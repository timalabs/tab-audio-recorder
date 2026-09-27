export interface SilenceConfig {
  threshold: number; // Volume below which is considered silence (0.01 - 0.05)
  silenceDurationMs: number; // Duration of continuous silence before triggering
  onSilence: () => void;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private silenceConfig: SilenceConfig | null = null;
  private silenceStartTimestamp: number | null = null;

  constructor(stream: MediaStream, routeToSpeaker: boolean = true) {
    try {
      const AudioCtx =
        (typeof window !== 'undefined' ? window.AudioContext : null) ||
        (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
        (typeof window !== 'undefined' ? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext : null);

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

      this.dataArray = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
    } catch (err) {
      console.warn('[AudioAnalyzer] Could not initialize Web Audio graph:', err);
    }
  }

  /**
   * Calculates the current root-mean-square (RMS) level normalized to [0, 1].
   */
  public getLevel(): number {
    if (!this.analyserNode || !this.dataArray) return 0;

    this.analyserNode.getByteFrequencyData(this.dataArray);

    let sum = 0;
    const length = this.dataArray.length;
    for (let i = 0; i < length; i++) {
      sum += this.dataArray[i];
    }

    const average = sum / length;
    // Normalize 0-255 to 0.0-1.0
    const normalized = Math.min(1, Math.max(0, average / 128));
    return parseFloat(normalized.toFixed(3));
  }

  /**
   * Starts periodic audio level polling. Throttled to conserve CPU.
   */
  public startMonitoring(
    intervalMs: number = 80,
    onLevelUpdate?: (level: number) => void
  ): void {
    this.stopMonitoring();

    this.monitorTimer = setInterval(() => {
      const level = this.getLevel();

      if (onLevelUpdate) {
        onLevelUpdate(level);
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

  public configureSilenceDetection(config: SilenceConfig | null): void {
    this.silenceConfig = config;
    this.silenceStartTimestamp = null;
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
