import { AudioRecorder } from '../recorder/AudioRecorder.ts';
import { ExtensionMessage, INITIAL_RECORDER_STATE, RecorderState, RecordingResult } from '../recorder/RecorderState.ts';
import { getFriendlyErrorMessage } from '../utils/errors.ts';

let activeRecorder: AudioRecorder | null = null;
let currentState: RecorderState = { ...INITIAL_RECORDER_STATE };

function broadcastState(state: RecorderState): void {
  currentState = { ...state };
  try {
    chrome.runtime.sendMessage({
      type: 'STATE_CHANGED',
      state: currentState,
    }).catch(() => {
      // Ignored if popup is closed
    });
  } catch {
    // Popup might not be open, which is completely expected
  }
}

function broadcastAudioLevel(level: number): void {
  currentState.audioLevel = level;
  try {
    chrome.runtime.sendMessage({
      type: 'AUDIO_LEVEL',
      level,
    }).catch(() => {
      // Ignored if popup is closed
    });
  } catch {
    // Expected when popup is closed
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    if (currentState.status === 'RECORDING' && activeRecorder) {
      currentState.elapsedMs = activeRecorder.getDurationMs();
    }
    sendResponse(currentState);
    return true;
  }

  if (message.type === 'INIT_CHROME_OFFSCREEN_CAPTURE') {
    handleStartRecording(message.streamId, message.tabInfo)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        const friendly = getFriendlyErrorMessage(err, message.tabInfo.url);
        broadcastState({
          status: 'ERROR',
          elapsedMs: 0,
          tabInfo: message.tabInfo,
          errorMessage: friendly,
        });
        sendResponse({ success: false, error: friendly });
      });
    return true;
  }

  if (message.type === 'STOP_CHROME_OFFSCREEN_CAPTURE') {
    handleStopRecording()
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => {
        const friendly = getFriendlyErrorMessage(err);
        sendResponse({ success: false, error: friendly });
      });
    return true;
  }

  if (message.type === 'RESET_RECORDING') {
    handleReset();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'DOWNLOAD_RECORDING') {
    handleDownload()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

async function handleStartRecording(streamId: string, tabInfo: RecorderState['tabInfo']): Promise<void> {
  if (activeRecorder) {
    activeRecorder.cleanup();
    activeRecorder = null;
  }

  broadcastState({
    status: 'STARTING',
    elapsedMs: 0,
    tabInfo,
  });

  // Capture tab audio stream using the tab streamId
  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    } as unknown as MediaTrackConstraints,
    video: false,
  });

  if (!mediaStream.getAudioTracks().length) {
    throw new Error('No audio tracks captured from tab');
  }

  activeRecorder = new AudioRecorder(
    mediaStream,
    tabInfo,
    {
      onLevel: (level) => broadcastAudioLevel(level),
      onError: (err) => {
        console.error('[Offscreen] Recorder error:', err);
        broadcastState({
          status: 'ERROR',
          elapsedMs: 0,
          tabInfo,
          errorMessage: getFriendlyErrorMessage(err, tabInfo?.url),
        });
      },
      onComplete: (result) => {
        broadcastState({
          status: 'COMPLETED',
          elapsedMs: result.durationMs,
          tabInfo,
          result,
        });
      },
    },
    true // Pass-through to speakers so user can still hear tab
  );

  activeRecorder.start();

  broadcastState({
    status: 'RECORDING',
    startedAt: Date.now(),
    elapsedMs: 0,
    tabInfo,
  });
}

async function handleStopRecording(): Promise<RecordingResult> {
  if (!activeRecorder) {
    if (currentState.result) {
      return currentState.result;
    }
    throw new Error('No active recording in progress');
  }

  broadcastState({
    status: 'STOPPING',
    startedAt: currentState.startedAt,
    elapsedMs: activeRecorder.getDurationMs(),
    tabInfo: currentState.tabInfo,
  });

  const result = await activeRecorder.stop();

  broadcastState({
    status: 'COMPLETED',
    elapsedMs: result.durationMs,
    tabInfo: currentState.tabInfo,
    result,
  });

  return result;
}

function handleReset(): void {
  if (activeRecorder) {
    activeRecorder.cleanup();
    activeRecorder = null;
  }

  broadcastState({
    status: 'IDLE',
    elapsedMs: 0,
    tabInfo: currentState.tabInfo,
  });
}

async function handleDownload(): Promise<void> {
  if (!currentState.result?.blobUrl) {
    throw new Error('No completed recording available for download');
  }

  const { blobUrl, filename } = currentState.result;

  if (chrome.downloads && chrome.downloads.download) {
    await chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: true,
    });
  } else {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
