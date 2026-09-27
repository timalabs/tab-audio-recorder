/**
 * Chrome-specific implementation utilities for Manifest V3.
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

/**
 * Checks whether an offscreen document currently exists.
 */
export async function hasOffscreenDocument(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    return false;
  }

  // Chrome 116+ runtime.getContexts
  if ('getContexts' in chrome.runtime) {
    try {
      const contexts = await (chrome.runtime as unknown as {
        getContexts: (filter: { contextTypes: string[] }) => Promise<unknown[]>;
      }).getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      return contexts.length > 0;
    } catch {
      // fallback below
    }
  }

  // Fallback for older Chromium versions
  try {
    const swSelf = self as unknown as {
      clients?: {
        matchAll: () => Promise<Array<{ url: string }>>;
      };
    };
    const clients = await swSelf.clients?.matchAll();
    return clients ? clients.some((client: { url: string }) => client.url.includes(OFFSCREEN_DOCUMENT_PATH)) : false;
  } catch {
    return false;
  }
}

/**
 * Ensures that the Chrome offscreen document is created and ready.
 */
export async function setupOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    return;
  }

  const exists = await hasOffscreenDocument();
  if (exists) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Record tab audio and pass through speaker audio to user',
  });
}

/**
 * Closes the offscreen document to release resources.
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    return;
  }

  const exists = await hasOffscreenDocument();
  if (exists) {
    try {
      await chrome.offscreen.closeDocument();
    } catch (err) {
      console.warn('[chromePlatform] Error closing offscreen document:', err);
    }
  }
}

/**
 * Generates a tab media stream ID using chrome.tabCapture.
 */
export async function getTabStreamId(tabId: number): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
    throw new Error('chrome.tabCapture API is not available.');
  }

  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const lastErr = chrome.runtime.lastError;
      if (lastErr) {
        return reject(new Error(lastErr.message || 'Failed to capture tab stream ID'));
      }
      if (!streamId) {
        return reject(new Error('Browser returned an empty stream ID'));
      }
      resolve(streamId);
    });
  });
}
