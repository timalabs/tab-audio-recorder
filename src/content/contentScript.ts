import { AudioRecorder } from '../recorder/AudioRecorder.ts';
import { ExtensionMessage, RecordingResult, TabInfo } from '../recorder/RecorderState.ts';

let contentRecorder: AudioRecorder | null = null;
let currentTabInfo: TabInfo | null = null;

function findBestMediaElement(): HTMLMediaElement | null {
  const elements = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));

  if (elements.length === 0) {
    return null;
  }

  // Prioritize currently playing elements
  const playing = elements.find((el) => !el.paused && !el.ended && el.readyState > 1);
  if (playing) {
    return playing;
  }

  // Otherwise return the first media element
  return elements[0];
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'FF_START_CONTENT_RECORDING') {
    currentTabInfo = message.tabInfo;
    handleStart()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'FF_STOP_CONTENT_RECORDING') {
    handleStop()
      .then((res) => sendResponse({ success: true, result: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  return false;
});

async function handleStart(): Promise<void> {
  const mediaEl = findBestMediaElement();
  if (!mediaEl) {
    throw new Error('No audio or video element was found on this page. Please ensure audio is playing in this tab.');
  }

  type CaptureMediaElement = HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };

  const el = mediaEl as CaptureMediaElement;
  let stream: MediaStream | null = null;

  if (typeof el.captureStream === 'function') {
    stream = el.captureStream();
  } else if (typeof el.mozCaptureStream === 'function') {
    stream = el.mozCaptureStream();
  }

  if (!stream || stream.getAudioTracks().length === 0) {
    throw new Error('Could not capture audio stream from the media element on this page.');
  }

  if (contentRecorder) {
    contentRecorder.cleanup();
    contentRecorder = null;
  }

  contentRecorder = new AudioRecorder(
    stream,
    currentTabInfo || undefined,
    {
      onLevel: (level) => {
        chrome.runtime.sendMessage({
          type: 'AUDIO_LEVEL',
          level,
        }).catch(() => {});
      },
      onError: (err) => {
        chrome.runtime.sendMessage({
          type: 'FF_RECORDING_ERROR',
          message: err.message,
        }).catch(() => {});
      },
    },
    false // In-page elements are already audible through DOM, don't double-route
  );

  contentRecorder.start();
}

async function handleStop(): Promise<RecordingResult> {
  if (!contentRecorder) {
    throw new Error('No content recording is active.');
  }

  const result = await contentRecorder.stop();
  const blob = contentRecorder.getBlob();

  if (blob) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      chrome.runtime.sendMessage({
        type: 'FF_RECORDING_DATA',
        blobData: dataUrl,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
        sizeBytes: result.sizeBytes,
      }).catch(() => {});
    };
    reader.readAsDataURL(blob);
  }

  contentRecorder.cleanup();
  contentRecorder = null;
  return result;
}
