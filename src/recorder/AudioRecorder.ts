import { AudioAnalyzer, SilenceConfig } from '../audio/AudioAnalyzer.ts';
import { getSupportedMimeType, MimeTypeOption } from '../audio/mimeTypes.ts';
import { trimAudioBlob } from '../audio/silenceTrimmer.ts';
import { generateRecordingFilename } from '../utils/filename.ts';
import { RecorderSettings } from '../utils/settings.ts';
import { RecordingResult, TabInfo } from './RecorderState.ts';

export interface AudioRecorderCallbacks {
  onLevel?: (level: number) => void;
  onError?: (error: Error) => void;
  onComplete?: (result: RecordingResult) => void;
}

export class AudioRecorder {
  private stream: MediaStream;
  private mediaRecorder: MediaRecorder | null = null;
  private analyzer: AudioAnalyzer | null = null;
  private chunks: Blob[] = [];
  private selectedMime: MimeTypeOption;
  private startedAt: number = 0;
  private stoppedAt: number = 0;
  private tabInfo?: TabInfo;
  private callbacks: AudioRecorderCallbacks;
  private completedResult: RecordingResult | null = null;
  private objectUrl: string | null = null;
  private settings?: RecorderSettings;

  constructor(
    stream: MediaStream,
    tabInfo?: TabInfo,
    callbacks: AudioRecorderCallbacks = {},
    passThroughToSpeaker: boolean = true,
    settings?: RecorderSettings
  ) {
    this.stream = stream;
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

  public start(): void {
    this.chunks = [];
    this.startedAt = Date.now();
    this.stoppedAt = 0;
    this.completedResult = null;

    try {
      const options: MediaRecorderOptions = {};
      if (this.selectedMime.mimeType) {
        options.mimeType = this.selectedMime.mimeType;
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        console.error('[AudioRecorder] MediaRecorder error:', event);
        const err = new Error('MediaRecorder encountered an unexpected recording error');
        if (this.callbacks.onError) {
          this.callbacks.onError(err);
        }
      };

      // Request data in 1-second chunks for reliability
      this.mediaRecorder.start(1000);

      // Start audio level visualizer monitoring
      if (this.analyzer && this.callbacks.onLevel) {
        this.analyzer.startMonitoring(80, (level) => {
          if (this.callbacks.onLevel) {
            this.callbacks.onLevel(level);
          }
        });
      }
    } catch (err) {
      console.error('[AudioRecorder] Failed to start MediaRecorder:', err);
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
      throw error;
    }
  }

  public stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (this.completedResult) {
          return resolve(this.completedResult);
        }
        return reject(new Error('Recorder is not active'));
      }

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
          let durationMs = Math.max(0, this.stoppedAt - this.startedAt);
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
            sizeBytes: finalBlob.size,
            mimeType: mimeTypeLabel,
            filename,
            tabTitle: this.tabInfo?.title,
            domain: this.tabInfo?.domain,
            trimmed: isTrimmed,
          };

          this.completedResult = result;

          // Stop all stream tracks to clear browser tab indicator
          this.stopStreamTracks();

          if (this.callbacks.onComplete) {
            this.callbacks.onComplete(result);
          }

          resolve(result);
        } catch (err) {
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
    } catch (e) {
      console.warn('[AudioRecorder] Error stopping tracks:', e);
    }
  }

  public cleanup(): void {
    this.stopStreamTracks();
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
  }
}
