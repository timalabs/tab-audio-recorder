import { ExtensionMessage, TabInfo } from '../recorder/RecorderState.ts';
import { extractDomain } from '../utils/formatters.ts';

/**
 * Universal browser extension API wrapper.
 * Works seamlessly across Chrome (MV3) and Firefox (WebExtensions).
 */
export const browserApi = {
  /**
   * Returns true if running in a Chromium-based browser.
   */
  isChrome(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      navigator.userAgent.indexOf('Chrome') > -1 &&
      navigator.userAgent.indexOf('Firefox') === -1
    );
  },

  /**
   * Returns true if running in Mozilla Firefox.
   */
  isFirefox(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') > -1
    );
  },

  /**
   * Gets current active browser tab info.
   */
  async getActiveTab(): Promise<TabInfo> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return { title: 'Unknown Tab', domain: 'localhost' };
    }

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0 || !tabs[0]) {
        return { title: 'No Active Tab' };
      }

      const activeTab = tabs[0];
      return {
        id: activeTab.id,
        title: activeTab.title || 'Untitled Tab',
        url: activeTab.url,
        favIconUrl: activeTab.favIconUrl,
        domain: extractDomain(activeTab.url),
      };
    } catch (err) {
      console.warn('[browserApi] Error querying active tab:', err);
      return { title: 'Active Tab' };
    }
  },

  /**
   * Triggers a download of a file locally via browser.downloads or fallback anchor click.
   */
  async downloadFile(url: string, filename: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
      try {
        await chrome.downloads.download({
          url,
          filename,
          saveAs: true,
        });
        return;
      } catch (err) {
        console.warn('[browserApi] chrome.downloads.download failed, falling back:', err);
      }
    }

    // DOM fallback if downloads API not available or in page/popup context
    if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  },

  /**
   * Sends a message to the extension background or offscreen contexts.
   */
  async sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Extension runtime messaging API unavailable');
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          // If receiving end does not exist yet (e.g. initial connection), resolve undefined gracefully
          return resolve(undefined as unknown as T);
        }
        resolve(response as T);
      });
    });
  },

  /**
   * Listens for runtime messages across contexts.
   */
  addMessageListener(
    listener: (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void
  ): () => void {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    }
    return () => {};
  },
};
