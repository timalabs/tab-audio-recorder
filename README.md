# Tab Audio Recorder

> **Record audio from this browser tab — privately, locally, without a server.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)](dist/chrome)
[![Firefox WebExtension](https://img.shields.io/badge/Firefox-WebExtension-orange)](dist/firefox)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](tsconfig.json)

**Tab Audio Recorder** is a production-quality, open-source browser extension for **Google Chrome** and **Mozilla Firefox** that lets you capture audio from the active browser tab and save the recording directly to your computer.

All processing occurs 100% locally in your browser. **No audio is ever uploaded to a server.**

---

## Key Features

- 🔒 **Zero-Cloud Privacy**: Audio is processed exclusively in browser memory and saved to disk. No server, no backend, no telemetry, no tracking.
- ⚡ **Persistent Background Recording**: Closing or reopening the popup window will **not** stop your recording.
- 🔊 **Audible Pass-Through**: Capturing audio does not mute the tab—you can listen while recording.
- 📊 **Live Audio Level Meter**: Lightweight dynamic multi-bar visualizer shows volume levels in real-time.
- ⏱️ **Accurate Elapsed Timer**: Formats elapsed duration (`00:00` or `01:32:45`) synchronized with the background engine.
- 🏷️ **Intelligent Safe Filenames**: Sanitizes page titles and generates clean filenames (e.g., `Podcast-Episode-2026-09-27-21-45-12.webm`).
- 🎛️ **Dynamic MIME Negotiation**: Detects best browser-supported format (`WebM / Opus`, `OGG / Opus`, `MP4`).
- 🎨 **Dark Premium Interface**: 360px wide, high-contrast, keyboard-accessible UI.

---

## Privacy Guarantee

```
Website (Active Tab)
       │
       ▼
Tab Audio Stream (chrome.tabCapture / captureStream)
       │
       ▼
MediaRecorder (Local In-Memory Blob)
       │
       ▼
Local Download (Your Computer's Downloads folder)
```

**All audio processing happens locally in your browser.**
- No remote backend
- No analytics or tracking
- No third-party network requests
- No user accounts or API keys required

---

## Supported Browsers

| Browser | Platform Architecture | Capture Mechanism | Output Directory |
|---------|-----------------------|-------------------|------------------|
| **Google Chrome** (v116+) | Manifest V3 | `chrome.tabCapture` + `chrome.offscreen` | `dist/chrome/` |
| **Mozilla Firefox** (v109+) | WebExtensions MV3 | `HTMLMediaElement.captureStream()` bridge | `dist/firefox/` |

---

## Quick Start & Installation

### Option 1: Load Pre-Built Unpacked Extension

1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/tab-audio-recorder.git
   cd tab-audio-recorder
   ```
2. Install dependencies and build both extensions:
   ```bash
   npm install
   npm run build
   ```

#### In Google Chrome / Chromium / Edge / Brave:
1. Navigate to `chrome://extensions/` in your browser.
2. Toggle on **Developer mode** (top-right corner).
3. Click **Load unpacked** (top-left corner).
4. Select the `dist/chrome/` directory.
5. Pin the extension icon to your toolbar.

#### In Mozilla Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox` in your browser.
2. Click **Load Temporary Add-on...**.
3. Select `dist/firefox/manifest.json`.
4. The extension is now active in Firefox.

---

## Development

```bash
# Install dependencies
npm install

# Start local Vite development server for popup UI preview
npm run dev

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run unit tests (Vitest)
npm run test

# Build production extensions
npm run build          # Builds both Chrome and Firefox
npm run build:chrome   # Builds Chrome to dist/chrome/
npm run build:firefox  # Builds Firefox to dist/firefox/
```

---

## How It Works

### Chrome Architecture (Manifest V3)
In Chrome Manifest V3, background service workers lack access to DOM APIs such as `AudioContext` and `MediaRecorder`. To solve this cleanly:
1. When you click **Start Recording**, the popup messages the background service worker.
2. The service worker calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` to obtain a capture token.
3. The service worker spins up an **offscreen document** (`offscreen.html`) with reasons `USER_MEDIA` and `AUDIO_PLAYBACK`.
4. The offscreen document calls `navigator.mediaDevices.getUserMedia()` with the tab stream ID.
5. **Audible Pass-Through**: The stream is piped through a Web Audio `AudioContext` into `audioCtx.destination`, keeping the tab audible while recording.
6. The offscreen document runs `MediaRecorder` and an `AudioAnalyzer` node, broadcasting real-time audio levels and elapsed time to the popup.
7. Because the offscreen document and service worker persist independently of the popup, closing the popup has zero effect on ongoing recording.

### Firefox Architecture (WebExtensions)
Firefox does not support `chrome.tabCapture` or `chrome.offscreen`. To provide equivalent functionality:
1. The extension injects a content script bridge into the active tab.
2. The content script detects active `<audio>` or `<video>` elements in the DOM and calls `HTMLMediaElement.prototype.captureStream()`.
3. Audio chunks are encoded by `MediaRecorder` and delivered to the background script for local download.

---

## Permissions

The extension requests only the minimum necessary permissions:

| Permission | Reason |
|------------|--------|
| `tabCapture` | *(Chrome)* Captures audio from the current tab upon user request. |
| `offscreen` | *(Chrome)* Hosts `AudioContext` and `MediaRecorder` in Manifest V3 without popup closure interruptions. |
| `downloads` | Saves the generated audio recording to your computer. |
| `activeTab` | Accesses the active tab strictly when the user clicks the extension. |
| `scripting` | *(Firefox)* Injects the media element capture script into the current tab. |

*No history, cookie, blanket host, or webRequest permissions are ever requested.*

---

## Limitations

- **Internal Browser Pages**: Extensions cannot capture audio on restricted internal pages (`chrome://`, `about:`, `moz-extension://`, `chrome-extension://`).
- **DRM-Protected Content**: Browsers prohibit capturing media streams protected by DRM (e.g. Netflix, Spotify Web Player) via standard WebExtension APIs.
- **Firefox Multiple Audio Sources**: On Firefox, recording relies on media element capture (`<video>`/`<audio>`), which captures standard HTML5 players. Pure synthesized Web Audio graphs without HTML media elements on Firefox are not currently exposed through browser tab capture APIs.

---

## Product Positioning

Tab Audio Recorder is a general-purpose local browser utility designed for capturing tab audio (e.g., presentations, meetings, royalty-free web audio, video conferences, or educational materials).

It is **NOT** designed to bypass:
- Digital Rights Management (DRM)
- Authentication or paywalls
- Download restrictions or access controls
- Protected copyright material

Users are responsible for ensuring they have the legal right or permission to record and save the audio.

---

## License

This project is licensed under the [MIT License](LICENSE).
