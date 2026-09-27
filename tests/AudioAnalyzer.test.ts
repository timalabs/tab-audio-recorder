import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioAnalyzer } from '../src/audio/AudioAnalyzer.ts';

describe('AudioAnalyzer', () => {
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
  let mockAudioContext: {
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    createAnalyser: ReturnType<typeof vi.fn>;
    destination: object;
    state: string;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDestination = {};
    mockAnalyserNode = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      connect: vi.fn(),
      disconnect: vi.fn(),
      getByteFrequencyData: vi.fn((array: Uint8Array) => {
        // Populate array with mock audio values (e.g. 64 out of 255)
        for (let i = 0; i < array.length; i++) {
          array[i] = 64;
        }
      }),
      getByteTimeDomainData: vi.fn((array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = 128; // silent center
        }
      }),
    };

    mockSourceNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      destination: mockDestination,
      state: 'running',
      createMediaStreamSource: vi.fn(() => mockSourceNode),
      createAnalyser: vi.fn(() => mockAnalyserNode),
      close: vi.fn(),
    };

    // Attach mock to global window
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = vi.fn(
      () => mockAudioContext
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize Web Audio graph and connect pass-through to destination', () => {
    const mockStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(mockStream, true);

    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
    expect(mockSourceNode.connect).toHaveBeenCalledWith(mockAnalyserNode);
    expect(mockAnalyserNode.connect).toHaveBeenCalledWith(mockDestination);

    analyzer.cleanup();
  });

  it('should calculate normalized audio level between 0 and 1', () => {
    const mockStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(mockStream, false);

    const level = analyzer.getLevel();
    // 64 / 128 = 0.5
    expect(level).toBe(0.5);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(1);

    analyzer.cleanup();
  });

  it('should trigger silence callback when audio remains below threshold', async () => {
    vi.useFakeTimers();

    // Mock silent stream data (0s)
    mockAnalyserNode.getByteFrequencyData = vi.fn((array: Uint8Array) => {
      array.fill(0);
    });

    const mockStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(mockStream, false);
    const onSilence = vi.fn();

    analyzer.configureSilenceDetection({
      threshold: 0.05,
      silenceDurationMs: 500,
      onSilence,
    });

    analyzer.startMonitoring(100);

    // Fast-forward past silence duration
    vi.advanceTimersByTime(650);

    expect(onSilence).toHaveBeenCalledTimes(1);

    analyzer.cleanup();
    vi.useRealTimers();
  });

  it('should cleanly disconnect all nodes and close AudioContext on cleanup', () => {
    const mockStream = {} as MediaStream;
    const analyzer = new AudioAnalyzer(mockStream, true);

    analyzer.cleanup();

    expect(mockSourceNode.disconnect).toHaveBeenCalled();
    expect(mockAnalyserNode.disconnect).toHaveBeenCalled();
    expect(mockAudioContext.close).toHaveBeenCalled();
  });
});
