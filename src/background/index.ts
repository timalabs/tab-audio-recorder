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
    if (message.db !== undefined) {
      currentState.currentDb = message.db;
    }
    if (message.debugInfo) {
      currentState.debugInfo = message.debugInfo;
    }
    return;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    currentState.settings = message.settings;
    if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
      chrome.runtime.sendMessage(message).catch(() => {});
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'FORCE_RECORD') {
    if (browserApi.isChrome() || typeof chrome.tabCapture !== 'undefined') {
      chrome.runtime.sendMessage(message).catch(() => {});
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'START_RECORDING') {
    handleStartRecording(message.tabId, message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        const errorMsg = getFriendlyErrorMessage(err);
        currentState = {
          status: 'ERROR',
          elapsedMs: 0,
          errorMessage: errorMsg,
          tabInfo: currentState.tabInfo,
          settings: message.settings || currentState.settings,
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
    const isWav = message.mimeType.toLowerCase().includes('wav') || message.trimmed;
    const extension = isWav ? 'wav' : 'webm';

    const filename = generateRecordingFilename(
      currentState.tabInfo?.title,
      extension,
      new Date(currentState.startedAt || Date.now())
    );

    currentState = {
      status: 'COMPLETED',
      elapsedMs: message.durationMs,
      tabInfo: currentState.tabInfo,
      settings: currentState.settings,
      result: {
        dataUrl: message.blobData,
        downloadUrl: message.blobData,
        durationMs: message.durationMs,
        sizeBytes: message.sizeBytes,
        mimeType: message.mimeType,
        filename,
        tabTitle: currentState.tabInfo?.title,
        domain: currentState.tabInfo?.domain,
        trimmed: message.trimmed,
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
      settings: currentState.settings,
    };
    broadcastState(currentState);
    return;
  }

  return false;
});

async function handleStartRecording(
  specifiedTabId?: number,
  settings?: RecorderState['settings']
): Promise<void> {
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
    settings: settings || currentState.settings,
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
          settings: currentState.settings,
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

    const isAutoStart = Boolean(currentState.settings?.autoStartRecording);
    currentState = {
      status: isAutoStart ? 'WAITING_FOR_AUDIO' : 'RECORDING',
      startedAt: isAutoStart ? undefined : Date.now(),
      elapsedMs: 0,
      tabInfo,
      settings: currentState.settings,
    };
    broadcastState(currentState);
    return;
  }

  // Firefox / standard WebExtension flow using content script
  await startFirefoxTabRecording(tabId, tabInfo, currentState.settings);

  const isAutoStartFf = Boolean(currentState.settings?.autoStartRecording);
  currentState = {
    status: isAutoStartFf ? 'WAITING_FOR_AUDIO' : 'RECORDING',
    startedAt: isAutoStartFf ? undefined : Date.now(),
    elapsedMs: 0,
    tabInfo,
    settings: currentState.settings,
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
    settings: currentState.settings,
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
