export interface SilenceConfig {
  threshold: number; // Volume below which is considered silence (0.01 - 0.05)
  silenceDurationMs: number; // Duration of continuous silence before triggering
  onSilence: () => void;
}

export interface AutoStartDetectorConfig {
  thresholdDb: number; // Volume threshold in dB (-60 to -20 dB, default: -48 dB)
  minSoundDurationMs: number; // Sustained duration required before triggering (default: 400 ms)
  onAudioDetected: () => void;
  onLevel?: (level: number, db: number) => void;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array<ArrayBuffer> | null = null;
  private timeDataArray: Uint8Array<ArrayBuffer> | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private silenceConfig: SilenceConfig | null = null;
  private silenceStartTimestamp: number | null = null;
  private autoStartConfig: AutoStartDetectorConfig | null = null;
  private soundStartTimestamp: number | null = null;

  constructor(stream: MediaStream, routeToSpeaker: boolean = true) {
    try {
      const AudioCtx =
        (typeof window !== 'undefined' ? window.AudioContext : null) ||
        (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
        (typeof window !== 'undefined'
          ? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          : null);

      if (!AudioCtx) {
        console.warn('[AudioAnalyzer] AudioContext is not supported in this environment');
        return;
      }

      this.audioContext = new AudioCtx();
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.5;

      this.sourceNode.connect(this.analyserNode);

      // Route to destination so user can continue hearing tab audio
      if (routeToSpeaker && this.audioContext.destination) {
        this.analyserNode.connect(this.audioContext.destination);
      }

      this.freqDataArray = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
      this.timeDataArray = new Uint8Array(new ArrayBuffer(this.analyserNode.fftSize));
    } catch (err) {
      console.warn('[AudioAnalyzer] Could not initialize Web Audio graph:', err);
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public getSourceNode(): MediaStreamAudioSourceNode | null {
    return this.sourceNode;
  }

  /**
   * Calculates the current root-mean-square (RMS) level normalized to [0, 1].
   */
  public getLevel(): number {
    if (!this.analyserNode || !this.freqDataArray) return 0;

    this.analyserNode.getByteFrequencyData(this.freqDataArray);

    let sum = 0;
    const length = this.freqDataArray.length;
    for (let i = 0; i < length; i++) {
      sum += this.freqDataArray[i];
    }

    const average = sum / length;
    // Normalize 0-255 to 0.0-1.0
    const normalized = Math.min(1, Math.max(0, average / 128));
    return parseFloat(normalized.toFixed(3));
  }

  /**
   * Computes the current real-time audio volume in decibels (dB FS).
   * Returns -100 for absolute silence or unavailable analyser.
   */
  public getDecibels(): number {
    if (
      !this.analyserNode ||
      !this.timeDataArray ||
      typeof this.analyserNode.getByteTimeDomainData !== 'function'
    ) {
      const level = this.getLevel();
      if (level <= 0.001) return -100;
      return Math.round(20 * Math.log10(level));
    }

    this.analyserNode.getByteTimeDomainData(this.timeDataArray);

    let sumSquares = 0;
    const length = this.timeDataArray.length;
    for (let i = 0; i < length; i++) {
      // Map 0..255 to -1.0..1.0
      const sample = (this.timeDataArray[i] - 128) / 128;
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / length);
    if (rms < 0.00001) return -100;

    const db = 20 * Math.log10(rms);
    return Math.round(db);
  }

  /**
   * Starts periodic audio level polling. Throttled to conserve CPU.
   */
  public startMonitoring(
    intervalMs: number = 60,
    onLevelUpdate?: (level: number) => void
  ): void {
    this.stopMonitoring();

    this.monitorTimer = setInterval(() => {
      const level = this.getLevel();
      const db = this.getDecibels();

      if (onLevelUpdate) {
        onLevelUpdate(level);
      }

      // Auto-start detection check
      if (this.autoStartConfig) {
        this.checkAutoStart(db, level);
      }

      // Silence detection check
      if (this.silenceConfig) {
        this.checkSilence(level);
      }
    }, intervalMs);
  }

  public stopMonitoring(): void {
    if (this.monitorTimer !== null) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  public configureAutoStartDetection(config: AutoStartDetectorConfig | null): void {
    this.autoStartConfig = config;
    this.soundStartTimestamp = null;
  }

  public configureSilenceDetection(config: SilenceConfig | null): void {
    this.silenceConfig = config;
    this.silenceStartTimestamp = null;
  }

  private checkAutoStart(db: number, level: number): void {
    if (!this.autoStartConfig) return;

    if (this.autoStartConfig.onLevel) {
      this.autoStartConfig.onLevel(level, db);
    }

    if (db >= this.autoStartConfig.thresholdDb) {
      const now = Date.now();
      if (this.soundStartTimestamp === null) {
        this.soundStartTimestamp = now;
      } else if (now - this.soundStartTimestamp >= this.autoStartConfig.minSoundDurationMs) {
        // Sustained audio confirmed! Trigger once and clear config
        const callback = this.autoStartConfig.onAudioDetected;
        this.autoStartConfig = null;
        this.soundStartTimestamp = null;
        callback();
      }
    } else {
      // Audio dropped below threshold -> reject short spike / reset
      this.soundStartTimestamp = null;
    }
  }

  private checkSilence(currentLevel: number): void {
    if (!this.silenceConfig) return;

    if (currentLevel < this.silenceConfig.threshold) {
      const now = Date.now();
      if (!this.silenceStartTimestamp) {
        this.silenceStartTimestamp = now;
      } else if (now - this.silenceStartTimestamp >= this.silenceConfig.silenceDurationMs) {
        // Trigger silence callback once
        this.silenceConfig.onSilence();
        this.silenceConfig = null; // disable further triggers until reconfigured
      }
    } else {
      this.silenceStartTimestamp = null;
    }
  }

  /**
   * Disconnects nodes and closes the AudioContext.
   */
  public cleanup(): void {
    this.stopMonitoring();

    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.analyserNode) {
        this.analyserNode.disconnect();
        this.analyserNode = null;
      }
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
        this.audioContext = null;
      }
    } catch (e) {
      console.warn('[AudioAnalyzer] Error during cleanup:', e);
    }
  }
}
