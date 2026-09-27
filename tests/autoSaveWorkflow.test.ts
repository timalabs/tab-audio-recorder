import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioAnalyzer } from '../src/audio/AudioAnalyzer.ts';
import { AudioRecorder } from '../src/recorder/AudioRecorder.ts';

describe('Auto-save & Automatic End Detection Workflow', () => {
  let mockAudioContext: {
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    createAnalyser: ReturnType<typeof vi.fn>;
    createDelay: ReturnType<typeof vi.fn>;
    createMediaStreamDestination: ReturnType<typeof vi.fn>;
    destination: object;
    state: string;
    close: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    const mockAnalyserNode = {
      fftSize: 256,
      smoothingTimeConstant: 0.1,
      minDecibels: -100,
      maxDecibels: 0,
      frequencyBinCount: 128,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn(),
      getByteTimeDomainData: vi.fn(),
    };

    const mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockDelayNode = {
      delayTime: { value: 0.7 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockTracks = [{ stop: vi.fn() }];
    const mockStream = {
      getAudioTracks: vi.fn(() => mockTracks),
      getTracks: vi.fn(() => mockTracks),
    } as unknown as MediaStream;

    mockAudioContext = {
      destination: {},
      state: 'running',
      createMediaStreamSource: vi.fn(() => mockSourceNode),
      createAnalyser: vi.fn(() => mockAnalyserNode),
      createDelay: vi.fn(() => mockDelayNode),
      createMediaStreamDestination: vi.fn(() => ({
        stream: mockStream,
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    (globalThis as unknown as { AudioContext: unknown }).AudioContext = vi.fn(
      () => mockAudioContext
    );

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
        if (this.onstop) this.onstop();
      }
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('AudioAnalyzer Silence Protection Logic', () => {
    it('1. should NEVER trigger silence callback within the protected track duration window', () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ readyState: 'live', enabled: true, muted: false }]),
        getTracks: vi.fn(() => []),
      } as unknown as MediaStream;

      const analyzer = new AudioAnalyzer(mockStream, false);
      const onSilence = vi.fn();

      const startedAt = 1000000;
      vi.setSystemTime(startedAt);

      // Expected duration: 3 minutes = 180,000 ms
      analyzer.configureSilenceDetection({
        threshold: 0.05,
        silenceDurationMs: 3000,
        recordingStartedAt: startedAt,
        expectedDurationMs: 180000,
        onSilence,
      });

      // Mock zero audio level (complete silence)
      vi.spyOn(analyzer, 'getLevel').mockReturnValue(0);
      vi.spyOn(analyzer, 'getAudioMetrics').mockReturnValue({ rms: 0, db: -100, level: 0 });

      // Start monitoring
      analyzer.startMonitoring(50);

      // Advance by 10 seconds of silence (during intro/verse)
      vi.advanceTimersByTime(10000);
      expect(onSilence).not.toHaveBeenCalled();

      // Advance to 60 seconds (mid-song quiet breakdown)
      vi.advanceTimersByTime(50000);
      expect(onSilence).not.toHaveBeenCalled();

      // Advance to 175 seconds (5s before track expected duration)
      vi.advanceTimersByTime(115000);
      expect(onSilence).not.toHaveBeenCalled();

      // Advance past the protected window (180s) + sustained silence (3s)
      vi.advanceTimersByTime(10000);
      expect(onSilence).toHaveBeenCalledTimes(1);

      analyzer.cleanup();
    });

    it('2. should use 12s minimum recording protection window when expected duration is not specified', () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ readyState: 'live', enabled: true, muted: false }]),
        getTracks: vi.fn(() => []),
      } as unknown as MediaStream;

      const analyzer = new AudioAnalyzer(mockStream, false);
      const onSilence = vi.fn();

      const startedAt = 5000000;
      vi.setSystemTime(startedAt);

      // No expected duration specified, minRecordingMs defaults to 12000 ms
      analyzer.configureSilenceDetection({
        threshold: 0.05,
        silenceDurationMs: 3000,
        recordingStartedAt: startedAt,
        minRecordingMs: 12000,
        onSilence,
      });

      vi.spyOn(analyzer, 'getLevel').mockReturnValue(0);
      vi.spyOn(analyzer, 'getAudioMetrics').mockReturnValue({ rms: 0, db: -100, level: 0 });

      analyzer.startMonitoring(50);

      // 5 seconds into recording: silence must not trigger
      vi.advanceTimersByTime(5000);
      expect(onSilence).not.toHaveBeenCalled();

      // 10 seconds into recording: silence must not trigger
      vi.advanceTimersByTime(5000);
      expect(onSilence).not.toHaveBeenCalled();

      // Past 12 seconds + 3 seconds of sustained silence -> should trigger track end!
      vi.advanceTimersByTime(6000);
      expect(onSilence).toHaveBeenCalledTimes(1);

      analyzer.cleanup();
    });

    it('3. should reset silence timer if sound plays before 3s sustained silence threshold', () => {
      const mockStream = {
        getAudioTracks: vi.fn(() => [{ readyState: 'live', enabled: true, muted: false }]),
        getTracks: vi.fn(() => []),
      } as unknown as MediaStream;

      const analyzer = new AudioAnalyzer(mockStream, false);
      const onSilence = vi.fn();

      const startedAt = 10000000;
      vi.setSystemTime(startedAt);

      analyzer.configureSilenceDetection({
        threshold: 0.05,
        silenceDurationMs: 3000,
        recordingStartedAt: startedAt,
        minRecordingMs: 5000,
        onSilence,
      });

      // Start in silence
      let currentLevel = 0;
      vi.spyOn(analyzer, 'getLevel').mockImplementation(() => currentLevel);
      vi.spyOn(analyzer, 'getAudioMetrics').mockImplementation(() => ({
        rms: currentLevel,
        db: currentLevel > 0 ? -20 : -100,
        level: currentLevel,
      }));

      analyzer.startMonitoring(50);

      // Past protection window (5s)
      vi.advanceTimersByTime(5000);

      // 2 seconds of silence
      vi.advanceTimersByTime(2000);
      expect(onSilence).not.toHaveBeenCalled();

      // Sound resumes!
      currentLevel = 0.5;
      vi.advanceTimersByTime(500);

      // Sound goes quiet again
      currentLevel = 0;
      vi.advanceTimersByTime(2000); // Only 2s of new silence, not 3s yet
      expect(onSilence).not.toHaveBeenCalled();

      // 1.5 more seconds of silence -> Total 3.5s of new continuous silence
      vi.advanceTimersByTime(1500);
      expect(onSilence).toHaveBeenCalledTimes(1);

      analyzer.cleanup();
    });
  });

  describe('AudioRecorder onAutoStop Integration', () => {
    it('should fire onAutoStop callback when silence is detected in autoStartRecording mode', async () => {
      const mockTracks = [{ stop: vi.fn() }];
      const fakeStream = {
        getAudioTracks: vi.fn(() => mockTracks),
        getTracks: vi.fn(() => mockTracks),
      } as unknown as MediaStream;

      const onAutoStop = vi.fn();

      const recorder = new AudioRecorder(
        fakeStream,
        { title: 'Auto Tab' },
        { onAutoStop },
        false,
        {
          trimSilence: true,
          outputFormat: 'mp3',
          autoStartRecording: true,
          autoStartThresholdDb: -48,
          autoStartMinSoundDurationMs: 400,
          autoStartPreRollMs: 700,
          autoSave: true,
          expectedDurationMs: 15000,
        }
      );

      await recorder.start();
      expect(recorder.getStatus()).toBe('WAITING_FOR_AUDIO');

      // User forces or audio starts
      recorder.forceStart();
      expect(recorder.getStatus()).toBe('RECORDING');

      // Check analyzer silence callback triggering
      // @ts-expect-error accessing private analyzer for test verification
      const analyzer = recorder.analyzer as AudioAnalyzer;
      expect(analyzer).toBeDefined();

      // @ts-expect-error accessing private silenceConfig
      const silenceConfig = analyzer.silenceConfig;
      expect(silenceConfig).toBeDefined();
      expect(silenceConfig).not.toBeNull();
      expect(silenceConfig!.expectedDurationMs).toBe(15000);

      // Invoke silenceConfig.onSilence directly to simulate detector firing
      silenceConfig!.onSilence();
      expect(onAutoStop).toHaveBeenCalledTimes(1);

      recorder.cleanup();
    });
  });
});
