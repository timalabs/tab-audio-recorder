import { TabInfo } from '../recorder/RecorderState.ts';
import { RecorderSettings } from '../utils/settings.ts';

/**
 * Firefox platform implementation for media element audio capture.
 */

/**
 * Injects content script into active tab if not already present, and starts capture.
 */
export async function startFirefoxTabRecording(
  tabId: number,
  tabInfo: TabInfo,
  settings?: RecorderSettings
): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    throw new Error('Tabs API unavailable in Firefox context');
  }

  // Attempt to message existing content script first
  try {
    const response = await sendTabMessage<{ success: boolean; error?: string }>(tabId, {
      type: 'FF_START_CONTENT_RECORDING',
      tabInfo,
      settings,
    });
    if (response?.error) {
      throw new Error(response.error);
    }
    return;
  } catch {
    // If message failed, inject content script dynamically
  }

  // Inject content script
  if (chrome.scripting && chrome.scripting.executeScript) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js'],
    });
  } else if (chrome.tabs.executeScript) {
    // Firefox MV2 fallback
    await new Promise<void>((resolve, reject) => {
      chrome.tabs.executeScript(tabId, { file: 'contentScript.js' }, () => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve();
      });
    });
  }

  // Small delay for content script initialization
  await new Promise((r) => setTimeout(r, 100));

  // Now send start recording message
  const resp = await sendTabMessage<{ success: boolean; error?: string }>(tabId, {
    type: 'FF_START_CONTENT_RECORDING',
    tabInfo,
    settings,
  });

  if (resp?.error) {
    throw new Error(resp.error);
  }
}

/**
 * Stops content script recording on the tab.
 */
export async function stopFirefoxTabRecording(tabId: number): Promise<void> {
  await sendTabMessage(tabId, {
    type: 'FF_STOP_CONTENT_RECORDING',
  });
}

function sendTabMessage<T = unknown>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        return reject(new Error(err.message || 'Failed to message tab content script'));
      }
      resolve(response as T);
    });
  });
}
