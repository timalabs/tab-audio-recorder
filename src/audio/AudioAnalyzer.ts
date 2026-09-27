import { AutoStartDebugInfo } from '../recorder/RecorderState.ts';

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
  onDebug?: (debugInfo: AutoStartDebugInfo) => void;
}

export class AudioAnalyzer {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array<ArrayBuffer> | null = null;
  private timeDataArray: Uint8Array<ArrayBuffer> | null = null;
  private timeDataFloatArray: Float32Array<ArrayBuffer> | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private silenceConfig: SilenceConfig | null = null;
  private silenceStartTimestamp: number | null = null;
  private autoStartConfig: AutoStartDetectorConfig | null = null;
  private soundStartTimestamp: number | null = null;

  // Calibration state
  private isCalibrating: boolean = false;
  private calibrationStartMs: number = 0;
  private calibrationSamples: number[] = [];
  private noiseFloorDb: number | null = null;

  constructor(stream: MediaStream, routeToSpeaker: boolean = true) {
    this.stream = stream;

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

      // Recommended analyser settings for high-precision RMS signal analysis
      this.analyserNode.fftSize = 2048;
      this.analyserNode.smoothingTimeConstant = 0.1;
      this.analyserNode.minDecibels = -100;
      this.analyserNode.maxDecibels = 0;

      this.sourceNode.connect(this.analyserNode);

      // Route to destination
      if (routeToSpeaker && this.audioContext.destination) {
        // Direct speaker pass-through (Chrome offscreen document)
        this.analyserNode.connect(this.audioContext.destination);
      } else if (this.audioContext.destination && typeof this.audioContext.createGain === 'function') {
        // Connect to destination via a 0-gain node so the browser audio engine
        // always pulls samples through the analyser, without double-audio or feedback (Firefox content script)
        const silenceGain = this.audioContext.createGain();
        if (silenceGain && silenceGain.gain) {
          silenceGain.gain.value = 0;
          this.analyserNode.connect(silenceGain);
          silenceGain.connect(this.audioContext.destination);
        }
      }

      this.freqDataArray = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
      this.timeDataArray = new Uint8Array(new ArrayBuffer(this.analyserNode.fftSize));
      this.timeDataFloatArray = new Float32Array(new ArrayBuffer(this.analyserNode.fftSize * 4));

      // Attempt immediate resumption in case constructor was called in an allowed gesture context
      this.ensureRunning().catch(() => {});
    } catch (err) {
      console.warn('[AudioAnalyzer] Could not initialize Web Audio graph:', err);
    }
  }

  /**
   * Resumes the AudioContext if it is in 'suspended' state.
   */
  public async ensureRunning(): Promise<boolean> {
    if (!this.audioContext) return false;
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[AudioAnalyzer] AudioContext resumed, state:', this.audioContext.state);
      } catch (err) {
        console.warn('[AudioAnalyzer] Failed to resume AudioContext:', err);
      }
    }
    return this.audioContext.state === 'running';
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public getSourceNode(): MediaStreamAudioSourceNode | null {
    return this.sourceNode;
  }

  public getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
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
   * Computes precise real-time audio metrics: RMS, dB FS, and normalized level.
   */
  public getAudioMetrics(): { rms: number; db: number; level: number } {
    const level = this.getLevel();

    if (!this.analyserNode) {
      return { rms: 0, db: -100, level: 0 };
    }

    let rms = 0;

    if (
      this.timeDataFloatArray &&
      typeof this.analyserNode.getFloatTimeDomainData === 'function'
    ) {
      this.analyserNode.getFloatTimeDomainData(this.timeDataFloatArray);
      let sumSquares = 0;
      const length = this.timeDataFloatArray.length;
      for (let i = 0; i < length; i++) {
        const sample = this.timeDataFloatArray[i];
        sumSquares += sample * sample;
      }
      rms = Math.sqrt(sumSquares / length);
    } else if (
      this.timeDataArray &&
      typeof this.analyserNode.getByteTimeDomainData === 'function'
    ) {
      this.analyserNode.getByteTimeDomainData(this.timeDataArray);
      let sumSquares = 0;
      const length = this.timeDataArray.length;
      for (let i = 0; i < length; i++) {
        // Map 0..255 to -1.0..1.0
        const sample = (this.timeDataArray[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      rms = Math.sqrt(sumSquares / length);
    }

    if (rms < 0.00000001) {
      return { rms: 0, db: -100, level };
    }

    const rawDb = 20 * Math.log10(rms);
    const db = Math.round(rawDb * 10) / 10;
    return { rms: parseFloat(rms.toFixed(5)), db, level };
  }

  /**
   * Computes current volume in decibels (dB FS).
   * Returns -100 for silence or unavailable analyser.
   */
  public getDecibels(): number {
    return Math.round(this.getAudioMetrics().db);
  }

  /**
   * Generates a complete snapshot of the audio pipeline diagnostics.
   */
  public getDiagnostics(currentDb?: number, currentRms?: number): AutoStartDebugInfo {
    const tracks =
      this.stream && typeof this.stream.getAudioTracks === 'function'
        ? this.stream.getAudioTracks()
        : [];
    const track = tracks[0] || null;
    const metrics =
      currentDb !== undefined && currentRms !== undefined
        ? { db: currentDb, rms: currentRms, level: 0 }
        : this.getAudioMetrics();

    const threshold = this.autoStartConfig?.thresholdDb ?? -48;
    const isAbove = metrics.db >= (this.soundStartTimestamp ? threshold - 3 : threshold);
    const detectionTimerMs = this.soundStartTimestamp
      ? Math.max(0, Date.now() - this.soundStartTimestamp)
      : 0;

    return {
      streamExists: Boolean(this.stream),
      streamActive: Boolean(this.stream?.active),
      audioTracksCount: tracks.length,
      trackReadyState: track ? track.readyState : 'none',
      trackEnabled: track ? track.enabled : false,
      trackMuted: track ? track.muted : false,
      audioContextState: this.audioContext?.state || 'none',
      analyserActive: Boolean(this.analyserNode),
      rms: metrics.rms,
      db: metrics.db,
      thresholdDb: threshold,
      aboveThreshold: isAbove,
      detectionTimerMs,
      noiseFloorDb: this.noiseFloorDb ?? undefined,
      isCalibrating: this.isCalibrating,
    };
  }

  /**
   * Starts periodic audio level polling. Throttled to conserve CPU.
   */
  public startMonitoring(
    intervalMs: number = 50,
    onLevelUpdate?: (level: number, db: number, debugInfo?: AutoStartDebugInfo) => void
  ): void {
    this.stopMonitoring();

    // Ensure audio context is running when monitoring starts
    this.ensureRunning().catch(() => {});

    this.monitorTimer = setInterval(() => {
      const { level, db, rms } = this.getAudioMetrics();

      let debugInfo: AutoStartDebugInfo | undefined;
      if (this.autoStartConfig) {
        debugInfo = this.checkAutoStart(db, level, rms);
      } else {
        debugInfo = this.getDiagnostics(db, rms);
      }

      if (onLevelUpdate) {
        onLevelUpdate(level, db, debugInfo);
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

    if (config !== null) {
      this.isCalibrating = true;
      this.calibrationStartMs = Date.now();
      this.calibrationSamples = [];
      this.noiseFloorDb = null;
    } else {
      this.isCalibrating = false;
    }
  }

  public configureSilenceDetection(config: SilenceConfig | null): void {
    this.silenceConfig = config;
    this.silenceStartTimestamp = null;
  }

  private checkAutoStart(db: number, level: number, rms: number): AutoStartDebugInfo {
    const config = this.autoStartConfig;
    if (!config) {
      return this.getDiagnostics(db, rms);
    }

    if (config.onLevel) {
      config.onLevel(level, db);
    }

    // Auto-calibration phase for first 600ms of monitoring
    if (this.isCalibrating) {
      this.calibrationSamples.push(db);
      if (Date.now() - this.calibrationStartMs >= 600) {
        this.isCalibrating = false;
        if (this.calibrationSamples.length > 0) {
          const sum = this.calibrationSamples.reduce((a, b) => a + b, 0);
          this.noiseFloorDb = Math.round(sum / this.calibrationSamples.length);
          console.log('[AudioAnalyzer] Ambient noise floor calibrated:', this.noiseFloorDb, 'dB');
        }
      }
    }

    const threshold = config.thresholdDb;
    // Apply 3 dB hysteresis release margin once sound has started to avoid flutter
    const effectiveThreshold = this.soundStartTimestamp ? threshold - 3 : threshold;

    if (db >= effectiveThreshold) {
      const now = Date.now();
      if (this.soundStartTimestamp === null) {
        this.soundStartTimestamp = now;
      } else if (now - this.soundStartTimestamp >= config.minSoundDurationMs) {
        // Sustained audio confirmed! Trigger once and clear config
        const callback = config.onAudioDetected;
        this.autoStartConfig = null;
        this.soundStartTimestamp = null;
        callback();
      }
    } else {
      // Audio dropped below release threshold -> reject short spike / reset
      this.soundStartTimestamp = null;
    }

    const debugInfo = this.getDiagnostics(db, rms);
    if (config.onDebug) {
      config.onDebug(debugInfo);
    }
    return debugInfo;
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
