# Tab Audio Recorder

> **Record audio from this browser tab — privately, locally, without a server.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/timalabs/tab-audio-recorder?color=blue)](https://github.com/timalabs/tab-audio-recorder/releases)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)](dist/chrome)
[![Firefox WebExtension](https://img.shields.io/badge/Firefox-WebExtension-orange)](dist/firefox)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](tsconfig.json)

**Tab Audio Recorder** is a production-quality, open-source browser extension for **Google Chrome** and **Mozilla Firefox** that lets you capture audio from the active browser tab and save the recording directly to your computer.

All processing occurs 100% locally in your browser. **No audio is ever uploaded to a server.**

---

## Key Features

- 🎵 **Local Audio Format Conversion**: Convert recordings client-side into **MP3** (192 kbps default), **WAV** (lossless PCM), **FLAC**, **OGG**, or native **WebM** without uploading to any server. See [docs/audio-conversion.md](docs/audio-conversion.md).
- ✂️ **Smart Silence Trimming**: Automatically removes unwanted silence at the beginning and end of recordings without touching internal silence. See [docs/smart-trim.md](docs/smart-trim.md).
- ⏱️ **Safe Track Duration Window**: Optional contextual signal helps preserve intentional dramatic pauses and breakdowns within tracks.
- 🔄 **Multi-Format Export**: Export the same recording to multiple formats (e.g. MP3 and WAV) without re-recording.
- 🔒 **Zero-Cloud Privacy**: Audio is processed exclusively in browser memory and saved to disk. No server, no backend, no telemetry, no tracking.
- ⚡ **Persistent Background Recording**: Closing or reopening the popup window will **not** stop your recording.
- 🔊 **Audible Pass-Through**: Capturing audio does not mute the tab—you can listen while recording.
- 📊 **Live Audio Level Meter**: Lightweight dynamic multi-bar visualizer shows volume levels in real-time.
- ⏱️ **Accurate Elapsed Timer**: Formats elapsed duration (`00:00` or `01:32:45`) synchronized with the background engine.
- 🏷️ **Intelligent Safe Filenames**: Sanitizes page titles and generates clean filenames (e.g., `Podcast-Episode-2026-09-27-21-45-12.mp3`).
- 🎨 **Dark Premium Interface**: 360px wide, high-contrast, keyboard-accessible UI with local settings persistence.

---

# Smart Silence Trimming

> Smart Silence Trimming automatically removes unwanted silence from the beginning and end of recordings while preserving intentional pauses inside the track.

### Trim silence

* **ON (Default)**: When enabled, the extension analyzes the recording after it finishes and removes only:
  * silence at the beginning
  * silence at the end
  
  **It will NEVER remove silence from the middle of the track.**
* **OFF**: When disabled, no silence trimming or audio processing is performed. The downloaded recording contains exactly the recorded audio from start to stop.

### Track duration

Users can optionally specify the expected track duration (e.g., `00:45`, `01:30`, `03:42`, `05:00`).

This helps the extension distinguish intentional silence inside a track from silence that occurs after the track has finished.

> If a track is expected to be 3:42 long, silence occurring before that point is preserved because it may be part of the music. After the expected duration, sustained silence can be interpreted as the end of the track.

> **Note**: Track duration is used as a detection hint, not as an exact cut-off time.

The extension does **not** hard-cut the audio at the specified duration. The actual track may be slightly shorter or longer than the duration hint.

### Examples

#### Example 1: Trimming Enabled with Duration Hint
```text
Trim silence: ON
Track duration: 03:42

Recording:
[silence] [music] [intentional silence] [music] [silence]

Result:
[music] [intentional silence] [music]
```

#### Example 2: Trimming Disabled
```text
Trim silence: OFF

Recording:
[silence] [music] [silence]

Result:
[silence] [music] [silence]
```

---

## 📥 Installation from Pre-Built Releases

Download the latest pre-built packages from [**GitHub Releases**](https://github.com/timalabs/tab-audio-recorder/releases).

### For Google Chrome / Brave / Microsoft Edge:
1. Download `tab-audio-recorder-chrome-v1.2.0.zip` from the latest release.
2. Unzip the file into a folder on your computer.
3. Open `chrome://extensions/` in your browser.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** (top-left button) and select the unzipped folder.
6. Pin **Tab Audio Recorder** to your toolbar.

### For Mozilla Firefox:
1. Download `tab-audio-recorder-firefox-v1.2.0.xpi` (or `.zip`).
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...**.
4. Select the downloaded `.xpi` (or `manifest.json` from the unzipped archive).
5. The extension is now active in Firefox.

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
Smart Silence Trimming (Optional, 100% Local PCM AudioBuffer analysis)
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

| Browser | Platform Architecture | Capture Mechanism | Package Format |
|---------|-----------------------|-------------------|----------------|
| **Google Chrome** (v116+) | Manifest V3 | `chrome.tabCapture` + `chrome.offscreen` | `.zip` |
| **Mozilla Firefox** (v109+) | WebExtensions MV3 | `HTMLMediaElement.captureStream()` bridge | `.xpi` / `.zip` |

---

## Development

```bash
# Clone the repository
git clone https://github.com/timalabs/tab-audio-recorder.git
cd tab-audio-recorder

# Install dependencies
npm install

# Start local Vite development server for popup UI preview
npm run dev

# Run TypeScript type checks
npm run typecheck

# Run ESLint
npm run lint

# Run unit tests (Vitest)
npm run test

# Build production extensions
npm run build          # Builds Chrome (dist/chrome/) and Firefox (dist/firefox/)
npm run build:chrome   # Builds Chrome only
npm run build:firefox  # Builds Firefox only

# Create installation packages (dist/releases/)
npm run package
```

---

## How It Works

### Chrome Architecture (Manifest V3)
In Chrome Manifest V3, background service workers lack access to DOM APIs such as `AudioContext` and `MediaRecorder`. To solve this cleanly:
1. When you click **Start Recording**, the popup messages the background service worker with your trimming preferences.
2. The service worker calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` to obtain a capture token.
3. The service worker spins up an **offscreen document** (`offscreen.html`) with reasons `USER_MEDIA` and `AUDIO_PLAYBACK`.
4. The offscreen document calls `navigator.mediaDevices.getUserMedia()` with the tab stream ID.
5. **Audible Pass-Through**: The stream is piped through a Web Audio `AudioContext` into `audioCtx.destination`, keeping the tab audible while recording.
6. The offscreen document runs `MediaRecorder` and an `AudioAnalyzer` node, broadcasting real-time audio levels and elapsed time to the popup.
7. Upon stopping, if **Trim silence** is ON, the audio is analyzed locally using Web Audio API to slice away leading and trailing silence, saving pristine PCM WAV or WebM audio.

### Firefox Architecture (WebExtensions)
Firefox does not support `chrome.tabCapture` or `chrome.offscreen`. To provide equivalent functionality:
1. The extension injects a content script bridge into the active tab.
2. The content script detects active `<audio>` or `<video>` elements in the DOM and calls `HTMLMediaElement.prototype.captureStream()`.
3. Audio chunks are encoded by `MediaRecorder`, trimmed locally if enabled, and delivered to the background script for local download.

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
| `storage` | Persists user settings (Trim silence toggle and duration hint) locally in browser. |

*No history, cookie, blanket host, or webRequest permissions are ever requested.*

---

## Limitations

- **Internal Browser Pages**: Extensions cannot capture audio on restricted internal pages (`chrome://`, `about:`, `moz-extension://`, `chrome-extension://`).
- **DRM-Protected Content**: Browsers prohibit capturing media streams protected by DRM (e.g. Netflix, Spotify Web Player) via standard WebExtension APIs.
- **Firefox Multiple Audio Sources**: On Firefox, recording relies on media element capture (`<video>`/`<audio>`), which captures standard HTML5 players. Pure synthesized Web Audio graphs without HTML media elements on Firefox are limited by Firefox's lack of tab-level capture APIs.

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
