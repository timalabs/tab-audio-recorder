/**
 * Checks if a URL is an internal or restricted browser page that cannot be recorded.
 */
export function isRestrictedUrl(url?: string): boolean {
  if (!url) return true;
  const restrictedProtocols = [
    'chrome:',
    'chrome-extension:',
    'about:',
    'moz-extension:',
    'edge:',
    'view-source:',
    'data:',
    'file:',
  ];
  return restrictedProtocols.some((protocol) => url.startsWith(protocol));
}

/**
 * Transforms technical browser or capture errors into clean, user-friendly messages.
 */
export function getFriendlyErrorMessage(error: unknown, url?: string): string {
  // Only check restriction if a URL was explicitly provided
  if (url && isRestrictedUrl(url)) {
    return 'This page cannot be recorded by browser extensions. Please open a standard web page.';
  }

  if (typeof error === 'string') {
    return cleanErrorString(error);
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const name = error.name?.toLowerCase() || '';

    if (name.includes('notallowederror') || msg.includes('permission denied')) {
      return 'Audio capture permission was denied by the browser.';
    }
    if (name.includes('notfounderror') || msg.includes('no audio')) {
      return 'No active audio track detected on this tab.\n\nStart playing audio on this tab and try again.';
    }
    if (name.includes('notsupportederror') || msg.includes('notsupported')) {
      return 'Your browser does not support this recording format or API.';
    }
    if (msg.includes('tab') && (msg.includes('closed') || msg.includes('not found'))) {
      return 'The target browser tab was closed or changed.';
    }
    if (msg.includes('cannot capture') || msg.includes('restricted')) {
      return 'Audio capture is not available for this tab.';
    }
    if (msg.includes('no media elements') || msg.includes('no audio or video element')) {
      return 'No active audio or video element was found on this page.';
    }

    return cleanErrorString(error.message);
  }

  return 'Recording could not be started. Please try again.';
}

function cleanErrorString(msg: string): string {
  if (msg.length > 140) {
    return msg.substring(0, 137) + '...';
  }
  return msg || 'An unexpected recording error occurred.';
}
