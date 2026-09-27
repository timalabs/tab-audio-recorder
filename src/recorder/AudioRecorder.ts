import { AudioAnalyzer, SilenceConfig } from '../audio/AudioAnalyzer.ts';
import { getSupportedMimeType, MimeTypeOption } from '../audio/mimeTypes.ts';
import { trimAudioBlob } from '../audio/silenceTrimmer.ts';
import { generateRecordingFilename } from '../utils/filename.ts';
import { RecorderSettings } from '../utils/settings.ts';
import { RecordingResult, RecordingStatus, TabInfo } from './RecorderState.ts';

export interface AudioRecorderCallbacks {
  onLevel?: (level: number) => void;
  onError?: (error: Error) => void;
  onComplete?: (result: RecordingResult) => void;
  onStatusChange?: (status: RecordingStatus) => void;
}

export class AudioRecorder {
  private stream: MediaStream;
  private recordStream: MediaStream;
  private mediaRecorder: MediaRecorder | null = null;
  private analyzer: AudioAnalyzer | null = null;
  private delayNode: DelayNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private chunks: Blob[] = [];
  private selectedMime: MimeTypeOption;
  private startedAt: number = 0;
  private stoppedAt: number = 0;
  private tabInfo?: TabInfo;
  private callbacks: AudioRecorderCallbacks;
  private completedResult: RecordingResult | null = null;
  private objectUrl: string | null = null;
  private settings?: RecorderSettings;
  private status: RecordingStatus = 'IDLE';

  constructor(
    stream: MediaStream,
    tabInfo?: TabInfo,
    callbacks: AudioRecorderCallbacks = {},
    passThroughToSpeaker: boolean = true,
    settings?: RecorderSettings
  ) {
    this.stream = stream;
    this.recordStream = stream;
    this.tabInfo = tabInfo;
    this.callbacks = callbacks;
    this.selectedMime = getSupportedMimeType();
    this.settings = settings;

    // Set up real-time audio analysis and tab audio pass-through
    this.analyzer = new AudioAnalyzer(stream, passThroughToSpeaker);
  }

  public setSettings(settings?: RecorderSettings): void {
    this.settings = settings;
  }

  public getStatus(): RecordingStatus {
    return this.status;
  }

  public start(): void {
    this.chunks = [];
    this.stoppedAt = 0;
    this.completedResult = null;

    if (this.settings?.autoStartRecording) {
      this.setupAutoStartMode();
    } else {
      this.startMediaRecorder();
    }
  }

  private setupAutoStartMode(): void {
    this.status = 'WAITING_FOR_AUDIO';
    this.callbacks.onStatusChange?.('WAITING_FOR_AUDIO');

    const audioCtx = this.analyzer?.getAudioContext();
    const sourceNode = this.analyzer?.getSourceNode();
    const preRollMs = this.settings?.autoStartPreRollMs ?? 700;
    const preRollSeconds = Math.max(0.1, preRollMs / 1000);

    // Set up Web Audio DelayNode for pre-roll audio buffer
    if (audioCtx && sourceNode && typeof audioCtx.createMediaStreamDestination === 'function') {
      try {
        this.delayNode = audioCtx.createDelay(Math.max(5.0, preRollSeconds + 1.0));
        this.delayNode.delayTime.value = preRollSeconds;
        this.destinationNode = audioCtx.createMediaStreamDestination();

        sourceNode.connect(this.delayNode);
        this.delayNode.connect(this.destinationNode);

        this.recordStream = this.destinationNode.stream;
      } catch (err) {
        console.warn('[AudioRecorder] Could not configure DelayNode pre-roll, falling back to direct stream:', err);
        this.recordStream = this.stream;
      }
    } else {
      this.recordStream = this.stream;
    }

    // Configure Auto-start audio level detector
    if (this.analyzer) {
      this.analyzer.configureAutoStartDetection({
        thresholdDb: this.settings?.autoStartThresholdDb ?? -48,
        minSoundDurationMs: this.settings?.autoStartMinSoundDurationMs ?? 400,
        onAudioDetected: () => {
          this.handleAudioDetected();
        },
      });

      this.analyzer.startMonitoring(50, (level) => {
        if (this.callbacks.onLevel) {
          this.callbacks.onLevel(level);
        }
      });
    }
  }

  private handleAudioDetected(): void {
    if (this.status !== 'WAITING_FOR_AUDIO') return;

    this.status = 'AUDIO_DETECTED';
    this.callbacks.onStatusChange?.('AUDIO_DETECTED');

    // Begin recording the delayed stream (contains pre-roll)
    setTimeout(() => {
      this.startMediaRecorder();
    }, 20);
  }

  public forceStart(): void {
    if (this.status === 'WAITING_FOR_AUDIO') {
      if (this.analyzer) {
        this.analyzer.configureAutoStartDetection(null);
      }
      this.startMediaRecorder();
    }
  }

  private startMediaRecorder(): void {
    this.startedAt = Date.now();
    this.status = 'RECORDING';
    this.callbacks.onStatusChange?.('RECORDING');

    try {
      const options: MediaRecorderOptions = {};
      if (this.selectedMime.mimeType) {
        options.mimeType = this.selectedMime.mimeType;
      }

      this.mediaRecorder = new MediaRecorder(this.recordStream, options);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        console.error('[AudioRecorder] MediaRecorder error:', event);
        const err = new Error('MediaRecorder encountered an unexpected recording error');
        this.status = 'ERROR';
        if (this.callbacks.onError) {
          this.callbacks.onError(err);
        }
      };

      // Request data in 1-second chunks for reliability
      this.mediaRecorder.start(1000);

      // Continue audio level monitoring
      if (this.analyzer) {
        this.analyzer.startMonitoring(80, (level) => {
          if (this.callbacks.onLevel) {
            this.callbacks.onLevel(level);
          }
        });
      }
    } catch (err) {
      console.error('[AudioRecorder] Failed to start MediaRecorder:', err);
      this.status = 'ERROR';
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }

  public stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      // If user stops while still waiting for audio, cancel cleanly
      if (this.status === 'WAITING_FOR_AUDIO' || this.status === 'AUDIO_DETECTED') {
        this.cleanup();
        this.status = 'IDLE';
        this.callbacks.onStatusChange?.('IDLE');
        const emptyResult: RecordingResult = {
          durationMs: 0,
          sizeBytes: 0,
          mimeType: this.selectedMime.label,
          filename: '',
          tabTitle: this.tabInfo?.title,
          domain: this.tabInfo?.domain,
        };
        return resolve(emptyResult);
      }

      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (this.completedResult) {
          return resolve(this.completedResult);
        }
        return reject(new Error('Recorder is not active'));
      }

      this.status = 'STOPPING';
      this.callbacks.onStatusChange?.('STOPPING');
      this.stoppedAt = Date.now();

      // Stop audio analysis immediately
      if (this.analyzer) {
        this.analyzer.stopMonitoring();
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const rawBlob = new Blob(this.chunks, {
            type: this.selectedMime.mimeType || 'audio/webm',
          });

          let finalBlob = rawBlob;
          const rawDurationMs = Math.max(0, this.stoppedAt - this.startedAt);
          let durationMs = rawDurationMs;
          let mimeTypeLabel = this.selectedMime.label;
          let fileExtension = this.selectedMime.extension;
          let isTrimmed = false;

          // Apply Smart Silence Trimming if enabled
          const shouldTrim = this.settings ? this.settings.trimSilence : true;

          if (shouldTrim) {
            const trimResult = await trimAudioBlob(rawBlob, {
              trimSilence: true,
              expectedDurationMs: this.settings?.expectedDurationMs,
            });

            if (trimResult.trimmed) {
              finalBlob = trimResult.blob;
              durationMs = trimResult.durationMs;
              mimeTypeLabel = trimResult.mimeType;
              fileExtension = trimResult.extension;
              isTrimmed = true;
            }
          }

          if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
          }
          this.objectUrl = URL.createObjectURL(finalBlob);

          const filename = generateRecordingFilename(
            this.tabInfo?.title,
            fileExtension,
            new Date(this.startedAt || Date.now())
          );

          const result: RecordingResult = {
            blobUrl: this.objectUrl,
            durationMs,
            originalDurationMs: isTrimmed ? rawDurationMs : undefined,
            sizeBytes: finalBlob.size,
            mimeType: mimeTypeLabel,
            filename,
            tabTitle: this.tabInfo?.title,
            domain: this.tabInfo?.domain,
            trimmed: isTrimmed,
          };

          this.completedResult = result;
          this.status = 'COMPLETED';

          // Stop all stream tracks to clear browser tab indicator
          this.stopStreamTracks();

          if (this.callbacks.onComplete) {
            this.callbacks.onComplete(result);
          }

          resolve(result);
        } catch (err) {
          this.status = 'ERROR';
          const error = err instanceof Error ? err : new Error(String(err));
          if (this.callbacks.onError) {
            this.callbacks.onError(error);
          }
          reject(error);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        this.status = 'ERROR';
        reject(err);
      }
    });
  }

  public configureSilenceDetection(config: SilenceConfig | null): void {
    if (this.analyzer) {
      this.analyzer.configureSilenceDetection(config);
    }
  }

  public getDurationMs(): number {
    if (!this.startedAt) return 0;
    if (this.stoppedAt > 0) return this.stoppedAt - this.startedAt;
    return Date.now() - this.startedAt;
  }

  public getSelectedMime(): MimeTypeOption {
    return this.selectedMime;
  }

  public getCompletedResult(): RecordingResult | null {
    return this.completedResult;
  }

  public getBlob(): Blob | null {
    if (!this.chunks.length) return null;
    return new Blob(this.chunks, {
      type: this.selectedMime.mimeType || 'audio/webm',
    });
  }

  private stopStreamTracks(): void {
    try {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      if (this.recordStream !== this.stream) {
        this.recordStream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    } catch (e) {
      console.warn('[AudioRecorder] Error stopping tracks:', e);
    }
  }

  public cleanup(): void {
    this.stopStreamTracks();
    if (this.delayNode) {
      try {
        this.delayNode.disconnect();
      } catch {
        // ignore
      }
      this.delayNode = null;
    }
    if (this.destinationNode) {
      try {
        this.destinationNode.disconnect();
      } catch {
        // ignore
      }
      this.destinationNode = null;
    }
    if (this.analyzer) {
      this.analyzer.cleanup();
      this.analyzer = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.chunks = [];
    this.mediaRecorder = null;
    this.status = 'IDLE';
  }
}
