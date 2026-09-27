import { browserApi } from '../platform/browser.ts';
import { getTabStreamId, setupOffscreenDocument } from '../platform/chrome.ts';
import { startFirefoxTabRecording, stopFirefoxTabRecording } from '../platform/firefox.ts';
import {
  ExtensionMessage,
  INITIAL_RECORDER_STATE,
  RecorderState,
  TabInfo,
} from '../recorder/RecorderState.ts';
import { getFriendlyErrorMessage, isRestrictedUrl } from '../utils/errors.ts';
import { generateRecordingFilename } from '../utils/filename.ts';

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
    // Expected when popup is closed
  }
}

// Handle messages from Popup, Offscreen document, or Content scripts
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'GET_STATE') {
    if (currentState.status === 'RECORDING' && currentState.startedAt) {
      currentState.elapsedMs = Math.max(0, Date.now() - currentState.startedAt);
    }
    sendResponse(currentState);
    return true;
  }

  if (message.type === 'STATE_CHANGED') {
    currentState = { ...message.state };
    return;
  }

  if (message.type === 'AUDIO_LEVEL') {
    currentState.audioLevel = message.level;
    return;
  }

  if (message.type === 'START_RECORDING') {
    handleStartRecording(message.tabId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        const errorMsg = getFriendlyErrorMessage(err);
        currentState = {
          status: 'ERROR',
          elapsedMs: 0,
          errorMessage: errorMsg,
          tabInfo: currentState.tabInfo,
        };
        broadcastState(currentState);
        sendResponse({ success: false, error: errorMsg });
      });
    return true;
  }

  if (message.type === 'STOP_RECORDING') {
    handleStopRecording()
      .then((res) => sendResponse({ success: true, result: res }))
      .catch((err) => {
        const errorMsg = getFriendlyErrorMessage(err);
        sendResponse({ success: false, error: errorMsg });
      });
    return true;
  }

  if (message.type === 'RESET_RECORDING') {
    handleResetRecording()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'DOWNLOAD_RECORDING') {
    handleDownloadRecording()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Firefox Content Script Handlers
  if (message.type === 'FF_RECORDING_DATA') {
    const filename = generateRecordingFilename(
      currentState.tabInfo?.title,
      'webm',
      new Date(currentState.startedAt || Date.now())
    );

    currentState = {
      status: 'COMPLETED',
      elapsedMs: message.durationMs,
      tabInfo: currentState.tabInfo,
      result: {
        dataUrl: message.blobData,
        downloadUrl: message.blobData,
        durationMs: message.durationMs,
        sizeBytes: message.sizeBytes,
        mimeType: message.mimeType,
        filename,
        tabTitle: currentState.tabInfo?.title,
        domain: currentState.tabInfo?.domain,
      },
    };
    broadcastState(currentState);
    return;
  }

  if (message.type === 'FF_RECORDING_ERROR') {
    currentState = {
      status: 'ERROR',
      elapsedMs: 0,
      errorMessage: message.message,
      tabInfo: currentState.tabInfo,
    };
    broadcastState(currentState);
    return;
  }

  return false;
});

async function handleStartRecording(specifiedTabId?: number): Promise<void> {
  const tabInfo: TabInfo = await browserApi.getActiveTab();
  const tabId = specifiedTabId || tabInfo.id;

  if (!tabId) {
    throw new Error('No active browser tab found to record.');
  }

  if (tabInfo.url && isRestrictedUrl(tabInfo.url)) {
    throw new Error('This page cannot be recorded by browser extensions.');
  }

  currentState = {
    status: 'STARTING',
    elapsedMs: 0,
    tabInfo,
  };
  broadcastState(currentState);

  // Chrome Manifest V3 flow using Offscreen document and tabCapture
  if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
    await setupOffscreenDocument();
    const streamId = await getTabStreamId(tabId);

    // Message offscreen document to initiate recording
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'INIT_CHROME_OFFSCREEN_CAPTURE',
          streamId,
          tabInfo,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && !response.success) {
            return reject(new Error(response.error || 'Offscreen recording initialization failed'));
          }
          resolve();
        }
      );
    });

    currentState = {
      status: 'RECORDING',
      startedAt: Date.now(),
      elapsedMs: 0,
      tabInfo,
    };
    broadcastState(currentState);
    return;
  }

  // Firefox / standard WebExtension flow using content script
  await startFirefoxTabRecording(tabId, tabInfo);

  currentState = {
    status: 'RECORDING',
    startedAt: Date.now(),
    elapsedMs: 0,
    tabInfo,
  };
  broadcastState(currentState);
}

async function handleStopRecording(): Promise<unknown> {
  currentState.status = 'STOPPING';
  broadcastState(currentState);

  if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'STOP_CHROME_OFFSCREEN_CAPTURE' },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && !response.success) {
            return reject(new Error(response.error || 'Failed to stop offscreen recording'));
          }
          resolve(response?.result);
        }
      );
    });
  }

  // Firefox content recording stop
  if (currentState.tabInfo?.id) {
    await stopFirefoxTabRecording(currentState.tabInfo.id);
  }
}

async function handleResetRecording(): Promise<void> {
  if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'RESET_RECORDING' }, () => {
        resolve();
      });
    });
  }

  currentState = {
    status: 'IDLE',
    elapsedMs: 0,
    tabInfo: currentState.tabInfo,
  };
  broadcastState(currentState);
}

async function handleDownloadRecording(): Promise<void> {
  if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
    await new Promise<void>((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD_RECORDING' }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && !response.success) {
          return reject(new Error(response.error || 'Download failed'));
        }
        resolve();
      });
    });
    return;
  }

  // Firefox local download
  if (currentState.result?.dataUrl) {
    await browserApi.downloadFile(
      currentState.result.dataUrl,
      currentState.result.filename
    );
  }
}
