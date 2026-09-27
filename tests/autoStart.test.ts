import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioAnalyzer } from '../src/audio/AudioAnalyzer.ts';
import { AudioRecorder } from '../src/recorder/AudioRecorder.ts';
import { RecordingStatus } from '../src/recorder/RecorderState.ts';
import { loadSettings, saveSettings } from '../src/utils/settings.ts';

describe('Auto-Start Audio Detection & Pre-roll Engine', () => {
  let mockDestination: object;
  let mockAnalyserNode: {
    fftSize: number;
    smoothingTimeConstant: number;
    frequencyBinCount: number;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    getByteFrequencyData: ReturnType<typeof vi.fn>;
    getByteTimeDomainData: ReturnType<typeof vi.fn>;
  };
  let mockSourceNode: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockDelayNode: {
    delayTime: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockMediaStreamDestination: {
    stream: MediaStream;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let mockAudioContext: {
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    createAnalyser: ReturnType<typeof vi.fn>;
    createDelay: ReturnType<typeof vi.fn>;
    createMediaStreamDestination: ReturnType<typeof vi.fn>;
    destination: object;
    state: string;
    close: ReturnType<typeof vi.fn>;
  };

  let mockTimeDomainSampleValue = 128; // 128 is center / 0.0 amplitude

  beforeEach(() => {
    vi.useFakeTimers();
    mockTimeDomainSampleValue = 128;

    mockDestination = {};
    mockAnalyserNode = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn((array: Uint8Array) => {
        // Estimate frequency data corresponding to amplitude
        const amp = Math.abs(mockTimeDomainSampleValue - 128);
        for (let i = 0; i < array.length; i++) {
          array[i] = amp;
        }
      }),
      getByteTimeDomainData: vi.fn((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = mockTimeDomainSampleValue;
        }
      }),
    };

    mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockDelayNode = {
      delayTime: { value: 0.7 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockTracks = [{ stop: vi.fn() }];
    const mockStream = {
      getAudioTracks: vi.fn(() => mockTracks),
      getTracks: vi.fn(() => mockTracks),
    } as unknown as MediaStream;

    mockMediaStreamDestination = {
      stream: mockStream,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      destination: mockDestination,
      state: 'running',
      createMediaStreamSource: vi.fn(() => mockSourceNode),
      createAnalyser: vi.fn(() => mockAnalyserNode),
      createDelay: vi.fn(() => mockDelayNode),
      createMediaStreamDestination: vi.fn(() => mockMediaStreamDestination),
      close: vi.fn().mockResolvedValue(undefined),
    };

    (globalThis as unknown as { AudioContext: unknown }).AudioContext = vi.fn(
      () => mockAudioContext
    );

    // Mock MediaRecorder in global
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = class {
      state = 'inactive';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        if (this.onstop) {
          this.onstop();
        }
      }
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('1. should calculate decibels accurately from time-domain signal', () => {
    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);

    // Silent center: 128 -> -100 dB
    mockTimeDomainSampleValue = 128;
    expect(analyzer.getDecibels()).toBe(-100);

    // Full scale: 255 -> 0 dB
    mockTimeDomainSampleValue = 255;
    expect(analyzer.getDecibels()).toBeGreaterThanOrEqual(-1);
    expect(analyzer.getDecibels()).toBeLessThanOrEqual(0);

    // Moderate volume (-20 dB)
    mockTimeDomainSampleValue = 128 + 13; // ~0.1 amplitude -> -20 dB
    const db = analyzer.getDecibels();
    expect(db).toBeGreaterThanOrEqual(-24);
    expect(db).toBeLessThanOrEqual(-18);

    analyzer.cleanup();
  });

  it('2. should reject short audio spikes (< minSoundDurationMs) without triggering', () => {
    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);
    const onDetected = vi.fn();

    analyzer.configureAutoStartDetection({
      thresholdDb: -48,
      minSoundDurationMs: 400,
      onAudioDetected: onDetected,
    });

    analyzer.startMonitoring(50);

    // 100ms click spike
    mockTimeDomainSampleValue = 200; // sound active (~ -2 dB)
    vi.advanceTimersByTime(100); // 100ms passed (< 400ms)

    // Back to silence
    mockTimeDomainSampleValue = 128;
    vi.advanceTimersByTime(200);

    expect(onDetected).not.toHaveBeenCalled();

    // Another short 250ms spike
    mockTimeDomainSampleValue = 180;
    vi.advanceTimersByTime(250); // 250ms (< 400ms)

    mockTimeDomainSampleValue = 128;
    vi.advanceTimersByTime(300);

    expect(onDetected).not.toHaveBeenCalled();

    analyzer.cleanup();
  });

  it('3. should trigger onAudioDetected when audio is sustained for >= minSoundDurationMs', () => {
    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);
    const onDetected = vi.fn();

    analyzer.configureAutoStartDetection({
      thresholdDb: -48,
      minSoundDurationMs: 400,
      onAudioDetected: onDetected,
    });

    analyzer.startMonitoring(50);

    // Initial silence for 1 second
    mockTimeDomainSampleValue = 128;
    vi.advanceTimersByTime(1000);
    expect(onDetected).not.toHaveBeenCalled();

    // Music starts playing (-20 dB)
    mockTimeDomainSampleValue = 150;

    // Advance 200ms -> not yet
    vi.advanceTimersByTime(200);
    expect(onDetected).not.toHaveBeenCalled();

    // Advance another 250ms -> total 450ms (>= 400ms)
    vi.advanceTimersByTime(250);
    expect(onDetected).toHaveBeenCalledTimes(1);

    // Further audio should not trigger multiple times (fires once)
    vi.advanceTimersByTime(500);
    expect(onDetected).toHaveBeenCalledTimes(1);

    analyzer.cleanup();
  });

  it('4. should configure DelayNode pre-roll and transition states in AudioRecorder', async () => {
    const mockTracks = [{ stop: vi.fn() }];
    const fakeStream = {
      getAudioTracks: vi.fn(() => mockTracks),
      getTracks: vi.fn(() => mockTracks),
    } as unknown as MediaStream;

    const statusChanges: RecordingStatus[] = [];

    const recorder = new AudioRecorder(
      fakeStream,
      { title: 'Test Tab', domain: 'example.com' },
      {
        onStatusChange: (status) => statusChanges.push(status),
      },
      false,
      {
        trimSilence: true,
        outputFormat: 'mp3',
        autoStartRecording: true,
        autoStartThresholdDb: -48,
        autoStartMinSoundDurationMs: 400,
        autoStartPreRollMs: 700,
      }
    );

    expect(recorder.getStatus()).toBe('IDLE');

    // Start recorder in auto-start mode
    await recorder.start();

    // Should create DelayNode with 0.700s delay
    expect(mockAudioContext.createDelay).toHaveBeenCalled();
    expect(mockDelayNode.delayTime.value).toBe(0.7);

    // Status should immediately transition to WAITING_FOR_AUDIO
    expect(recorder.getStatus()).toBe('WAITING_FOR_AUDIO');
    expect(statusChanges).toContain('WAITING_FOR_AUDIO');

    // Simulate sustained sound playing in tab
    mockTimeDomainSampleValue = 160;
    vi.advanceTimersByTime(450); // triggers detector

    // Audio detected -> Recording
    vi.advanceTimersByTime(50);
    expect(statusChanges).toContain('AUDIO_DETECTED');
    expect(recorder.getStatus()).toBe('RECORDING');

    recorder.cleanup();
  });

  it('5. should allow manual forceStart() while WAITING_FOR_AUDIO', async () => {
    const mockTracks = [{ stop: vi.fn() }];
    const fakeStream = {
      getAudioTracks: vi.fn(() => mockTracks),
      getTracks: vi.fn(() => mockTracks),
    } as unknown as MediaStream;

    const statusChanges: RecordingStatus[] = [];

    const recorder = new AudioRecorder(
      fakeStream,
      { title: 'Test Tab' },
      {
        onStatusChange: (status) => statusChanges.push(status),
      },
      false,
      {
        trimSilence: true,
        outputFormat: 'mp3',
        autoStartRecording: true,
        autoStartThresholdDb: -48,
        autoStartMinSoundDurationMs: 400,
        autoStartPreRollMs: 700,
      }
    );

    await recorder.start();
    expect(recorder.getStatus()).toBe('WAITING_FOR_AUDIO');

    // User clicks Record Now without waiting
    recorder.forceStart();
    expect(recorder.getStatus()).toBe('RECORDING');
    expect(statusChanges).toContain('RECORDING');

    recorder.cleanup();
  });

  it('6. should cancel cleanly when stopped while WAITING_FOR_AUDIO', async () => {
    const mockTracks = [{ stop: vi.fn() }];
    const fakeStream = {
      getAudioTracks: vi.fn(() => mockTracks),
      getTracks: vi.fn(() => mockTracks),
    } as unknown as MediaStream;

    const recorder = new AudioRecorder(
      fakeStream,
      { title: 'Test Tab' },
      {},
      false,
      {
        trimSilence: true,
        outputFormat: 'mp3',
        autoStartRecording: true,
        autoStartThresholdDb: -48,
        autoStartMinSoundDurationMs: 400,
        autoStartPreRollMs: 700,
      }
    );

    await recorder.start();
    expect(recorder.getStatus()).toBe('WAITING_FOR_AUDIO');

    // User clicks Cancel Monitoring
    const result = await recorder.stop();
    expect(recorder.getStatus()).toBe('IDLE');
    expect(result.durationMs).toBe(0);
    expect(result.blobUrl).toBeUndefined();
  });

  it('7. should persist auto-start settings in local storage', async () => {
    const memoryStorage: Record<string, string> = {};

    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: vi.fn((key: string) => memoryStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        memoryStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete memoryStorage[key];
      }),
      clear: vi.fn(),
    };

    // Default settings
    const initial = await loadSettings();
    expect(initial.autoStartRecording).toBe(false);
    expect(initial.autoStartThresholdDb).toBe(-48);
    expect(initial.autoStartMinSoundDurationMs).toBe(400);
    expect(initial.autoStartPreRollMs).toBe(700);

    // Save custom auto-start settings
    await saveSettings({
      autoStartRecording: true,
      autoStartThresholdDb: -52,
      autoStartMinSoundDurationMs: 500,
      autoStartPreRollMs: 800,
    });

    const updated = await loadSettings();
    expect(updated.autoStartRecording).toBe(true);
    expect(updated.autoStartThresholdDb).toBe(-52);
    expect(updated.autoStartMinSoundDurationMs).toBe(500);
    expect(updated.autoStartPreRollMs).toBe(800);
  });

  it('8. should resume AudioContext when suspended in ensureRunning()', async () => {
    let contextState = 'suspended';
    const suspendedContext = {
      ...mockAudioContext,
      get state() {
        return contextState;
      },
      resume: vi.fn(async () => {
        contextState = 'running';
      }),
    };
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = vi.fn(
      () => suspendedContext
    );

    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);
    contextState = 'suspended';
    expect(analyzer.getAudioContext()?.state).toBe('suspended');

    const running = await analyzer.ensureRunning();
    expect(running).toBe(true);
    expect(suspendedContext.resume).toHaveBeenCalled();
    expect(analyzer.getAudioContext()?.state).toBe('running');

    analyzer.cleanup();
  });

  it('9. should handle missing audio track and inactive MediaStream gracefully in diagnostics', () => {
    const inactiveStream = {
      active: false,
      getAudioTracks: vi.fn(() => []),
    } as unknown as MediaStream;

    const analyzer = new AudioAnalyzer(inactiveStream, false);
    const diag = analyzer.getDiagnostics();

    expect(diag.streamExists).toBe(true);
    expect(diag.streamActive).toBe(false);
    expect(diag.audioTracksCount).toBe(0);
    expect(diag.trackReadyState).toBe('none');
    expect(diag.trackEnabled).toBe(false);
    expect(diag.trackMuted).toBe(false);

    analyzer.cleanup();
  });

  it('10. should maintain candidate detection across quiet audio dips via hysteresis margin', () => {
    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);
    const onDetected = vi.fn();

    analyzer.configureAutoStartDetection({
      thresholdDb: -48,
      minSoundDurationMs: 400,
      onAudioDetected: onDetected,
    });

    vi.useFakeTimers();
    analyzer.startMonitoring(50);

    // Initial audio above threshold (-46 dB)
    mockTimeDomainSampleValue = 129;
    vi.advanceTimersByTime(200);

    // Momentary slight dip down to -50 dB (above release threshold -51 dB)
    // Hysteresis allows this without resetting timer!
    vi.advanceTimersByTime(250);

    expect(onDetected).toHaveBeenCalledTimes(1);

    analyzer.cleanup();
  });

  it('11. should remain in WAITING_FOR_AUDIO indefinitely during silence (-100 dB)', () => {
    const fakeStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(fakeStream, false);
    const onDetected = vi.fn();

    analyzer.configureAutoStartDetection({
      thresholdDb: -48,
      minSoundDurationMs: 400,
      onAudioDetected: onDetected,
    });

    vi.useFakeTimers();
    analyzer.startMonitoring(50);

    // Pure silence: 128
    mockTimeDomainSampleValue = 128;
    vi.advanceTimersByTime(5000);

    expect(onDetected).not.toHaveBeenCalled();
    const diag = analyzer.getDiagnostics();
    expect(diag.aboveThreshold).toBe(false);
    expect(diag.detectionTimerMs).toBe(0);

    analyzer.cleanup();
  });
});
