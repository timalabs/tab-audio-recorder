export type RecordingStatus =
  | 'IDLE'
  | 'STARTING'
  | 'RECORDING'
  | 'STOPPING'
  | 'COMPLETED'
  | 'ERROR';

export interface TabInfo {
  id?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  domain?: string;
}

export interface RecordingResult {
  blobUrl?: string;
  downloadUrl?: string;
  dataUrl?: string;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  filename: string;
  tabTitle?: string;
  domain?: string;
}

export interface RecorderState {
  status: RecordingStatus;
  startedAt?: number;
  elapsedMs: number;
  tabInfo?: TabInfo;
  result?: RecordingResult;
  errorMessage?: string;
  audioLevel?: number; // 0.0 to 1.0 (for instant level indicator)
}

export type ExtensionMessage =
  | { type: 'START_RECORDING'; tabId?: number }
  | { type: 'STOP_RECORDING' }
  | { type: 'RESET_RECORDING' }
  | { type: 'GET_STATE' }
  | { type: 'STATE_CHANGED'; state: RecorderState }
  | { type: 'AUDIO_LEVEL'; level: number }
  | { type: 'DOWNLOAD_RECORDING' }
  // Chrome offscreen messaging:
  | {
      type: 'INIT_CHROME_OFFSCREEN_CAPTURE';
      streamId: string;
      tabInfo: TabInfo;
    }
  | { type: 'STOP_CHROME_OFFSCREEN_CAPTURE' }
  // Firefox content-script messaging:
  | { type: 'FF_START_CONTENT_RECORDING'; tabInfo: TabInfo }
  | { type: 'FF_STOP_CONTENT_RECORDING' }
  | { type: 'FF_RECORDING_DATA'; blobData: string; mimeType: string; durationMs: number; sizeBytes: number }
  | { type: 'FF_RECORDING_ERROR'; message: string };

export const INITIAL_RECORDER_STATE: RecorderState = {
  status: 'IDLE',
  elapsedMs: 0,
};
