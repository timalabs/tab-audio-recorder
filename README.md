# 🎙 Tab Audio Recorder

Open-source browser extension for recording audio from your browser tabs.

**Record → Trim → Convert → Download**

Works with Chrome and Firefox.

All processing happens locally in your browser.  
No server. No account. No audio uploads.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/timalabs/tab-audio-recorder?color=blue)](https://github.com/timalabs/tab-audio-recorder/releases)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)](dist/chrome)
[![Firefox WebExtension](https://img.shields.io/badge/Firefox-WebExtension-orange)](dist/firefox)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](tsconfig.json)
[![Tests Passing](https://img.shields.io/badge/Tests-78%2F78%20Passed-success)](tests)

---

> **Tab Audio Recorder** is an open-source browser extension for Chrome and Firefox that lets you record audio playing in a browser tab and save it locally.
>
> Recording, silence trimming, and audio conversion happen locally in the browser. No audio is uploaded to a server.

The project is designed as a privacy-first, general-purpose browser audio recorder and local audio converter that works with websites containing HTML5 audio/video and web-based audio players.

---

## Features

* 🎙 **Record audio from the active browser tab**: Capture any sound playing in your Chrome or Firefox tab with a single click.
* ⚡ **Auto-start recording**: Automatically monitors tab audio level and begins recording hands-free when meaningful sound begins, with pre-roll protection.
* 🌐 **Chrome and Firefox support**: Native Manifest V3 tab capture on Chrome and media stream capture on Firefox.
* ✂️ **Smart leading/trailing silence trimming**: Automatically detect and slice unwanted silence before and after the track.
* ⏱ **Optional track duration protection**: Safe window ensures internal silence inside the track is preserved.
* 🎵 **Preserve intentional silence inside tracks**: Musical breakdowns, dramatic pauses, and speech pauses are never cut.
* 🔄 **Convert recordings to MP3, WAV, FLAC, OGG, and WebM**: Universal in-browser format conversion with 192 kbps MP3 default.
* 🔄 **Multi-format export**: Convert the same recording to multiple formats (e.g. MP3 first, then WAV) without re-recording.
* 🔒 **Local-first privacy**: Your audio is processed directly on your machine without external network transfers.
* 🚫 **No audio uploads**: Zero third-party cloud APIs, servers, or external dependencies.
* ⚡ **No backend required**: Runs completely offline once installed in your browser.
* 📦 **Open source**: Fully transparent, MIT-licensed TypeScript and React architecture.
* 🛠 **Non-blocking asynchronous UI**: Chunked encoding yields to the browser event loop with a real-time progress bar.

---

## How It Works

```text
Browser Tab
    ↓
Audio Capture (tabCapture / captureStream)
    ↓
Local Recording (In-Memory PCM / WebM)
    ↓
Smart Silence Trim (Optional Safe Window)
    ↓
Format Conversion (MP3 / WAV / FLAC / OGG / WebM)
    ↓
Local Download (Your Downloads Folder)
```

The extension captures audio from the active browser tab, processes it locally, optionally removes unwanted silence at the beginning and end, converts the recording into the selected format, and saves the result locally.

---

# Supported Use Cases

Tab Audio Recorder can be useful with many browser-based audio services, including music streaming platforms, AI music generators, online radio, podcasts, web audio players, and other websites that play audio in a browser tab.

### Music Streaming Services
The extension can record audio playing in supported browser tabs, including web-based music and streaming services such as:
* **Spotify** (record audio playing in a Spotify browser tab)
* **YouTube Music** (record audio playing in a YouTube Music browser tab)
* **Apple Music** (record audio playing in an Apple Music web player tab)
* **SoundCloud** (record audio playing in a SoundCloud browser tab)
* **Deezer** (record audio playing in a Deezer browser tab)
* **TIDAL** (record audio playing in a TIDAL web player tab)
* **Amazon Music** (record audio playing in an Amazon Music browser tab)
* **Pandora** (record audio playing in a Pandora radio tab)
* **Qobuz** (record audio playing in a Qobuz web player tab)
* **iHeartRadio** (record audio playing in an iHeartRadio browser tab)

### AI Music Generators
The extension can also be useful when working with browser-based AI music generators such as **Suno** and **Udio**:
* **Suno** (record audio generated or played in a Suno browser tab)
* **Udio** (record audio generated or played in a Udio browser tab)
* Other browser-based AI music generators, voice synthesizers, and sound effect generators.

If audio is playing in the browser tab, the extension can capture the tab's audio locally and save the resulting recording.

### Video Platforms
* **YouTube** (record audio playing in a YouTube browser tab)
* **Vimeo** (record audio playing in a Vimeo video tab)
* **Twitch** (record audio streams playing in a Twitch browser tab)

### Podcasts and Radio
* Online radio stations and live broadcasts
* Web-based podcast players and audiobooks
* Educational lectures, webinars, and conference calls

### Web Applications & Creative Tools
* Browser-based digital audio workstations (DAWs) and web synthesizers
* Online audio tools, soundboards, and voice editors
* Browser games and interactive multimedia presentations

---

## Service Compatibility

| Service / Platform | Use Case |
| :--- | :--- |
| **Suno** | Record audio playing in a browser tab |
| **Udio** | Record audio playing in a browser tab |
| **Spotify** | Record browser-tab audio |
| **YouTube Music** | Record browser-tab audio |
| **Apple Music** | Record browser-tab audio |
| **SoundCloud** | Record browser-tab audio |
| **Deezer** | Record browser-tab audio |
| **TIDAL** | Record browser-tab audio |
| **Amazon Music** | Record browser-tab audio |
| **Pandora** | Record browser-tab audio |
| **Qobuz** | Record browser-tab audio |
| **YouTube** | Record browser-tab audio |
| **Twitch** | Record browser-tab audio |
| **Vimeo** | Record browser-tab audio |

> **Note**: Examples of browser-based services where tab audio recording may be useful. Compatibility can vary by browser, operating system, and individual website implementation.

---

## Auto-start Recording

Tab Audio Recorder can automatically start recording when sound begins playing in the tab, allowing completely hands-free operation. See [docs/auto-start.md](docs/auto-start.md) for architecture details, Web Audio routing, and false-start rejection mechanics.

```text
User Arms Recorder (Waiting for audio...)
                ↓
Tab Audio Level Monitored via AnalyserNode (RMS / dB)
                ↓
Transient Spike? (< 400ms click/beep)  ──► Discarded (False-start rejected)
                ↓
Sustained Audio (≥ 400ms above threshold)
                ↓
Auto-Start Triggered!
Pre-Roll Delay Buffer (700ms) captured seamlessly
                ↓
Recording Active (0ms of track beginning lost)
```

* **Hands-Free Detection**: When **Auto-start recording** is toggled ON, the extension enters `WAITING_FOR_AUDIO` mode. It continuously monitors tab audio levels without recording silence.
* **Transient Spike Rejection**: Sound must remain continuously above the volume threshold for at least 400 ms (configurable) to trigger recording. Short clicks, UI pops, and system chimes are discarded.
* **Pre-Roll Delay Buffer**: Built-in 700 ms (configurable) Web Audio delay buffer ensures the very first drum hit, guitar pluck, or vocal attack is preserved in the recording.
* **Advanced Settings**: Fine-tune detection parameters in the collapsible Advanced settings panel:
  * **Audio Threshold**: `-60 dB` (ultra-sensitive) to `-25 dB` (loud audio only, default: `-48 dB`).
  * **Min Sound Duration**: `100 ms` to `1200 ms` (default: `400 ms`).
  * **Pre-roll Buffer**: `200 ms` to `1500 ms` (default: `700 ms`).
* **Strict Independence**: Auto-start only initiates recording. Recording continues until you click Stop or cancel monitoring. Smart Silence Trimming and format conversion work seamlessly with auto-started recordings.

---

## Smart Silence Trimming

Smart Silence Trimming automatically removes unwanted silence from the beginning and end of recordings while preserving intentional pauses inside the track. See [docs/smart-trim.md](docs/smart-trim.md) for full technical documentation.

```text
                                TRACK DURATION (e.g., 03:42)
                    ├─────────────────────────────────────────────────┤
                    │                PROTECTED WINDOW                 │
                    │                                                 │
[ LEADING SILENCE ] │ [ MUSIC INTRO ] ── [ SILENCE ] ── [ MUSIC OUTRO ]│ [ TRAILING SILENCE ]
      TRIMMED       │   PRESERVED           PRESERVED       PRESERVED │       TRIMMED
                    └─────────────────────────────────────────────────┴──────────────────────► Time
```

* **Trim silence (`ON / OFF`, Default: ON)**:
  * **ON**: Automatically analyzes the recording after it finishes and trims only silence at the beginning and end. **It will NEVER remove silence from the middle of the track.**
  * **OFF**: Disables all silence trimming. The downloaded recording contains exactly the recorded audio from start to stop.
* **Track duration (`[ 03 : 42 ]`, Optional)**:
  * Acts as a safe window rather than an exact cut-off time. Silence occurring before that duration is preserved because it may be part of the music. Sustained silence after the expected duration indicates the end of the track.
  * **Dynamic UI Annotations**:
    * Trim ON + Duration entered: `ⓘ Silence within this duration will not be trimmed.`
    * Trim ON + Duration empty: `ⓘ Optional. Helps detect the end of the track.`
    * Trim OFF: `ⓘ Enable Trim silence to use track duration.`

---

## Local Audio Format Conversion

Convert tab audio recordings directly in your browser without uploading to any third-party service. See [docs/audio-conversion.md](docs/audio-conversion.md) for architecture details.

| Format | Extension | Type | Default Settings | Description |
| :--- | :--- | :--- | :--- | :--- |
| **MP3** | `.mp3` | Lossy | 192 kbps stereo | Universal playback on all phones, cars, and media players. |
| **WAV** | `.wav` | Lossless | 16-bit 44.1/48kHz PCM | Uncompressed pristine audio for editing in DAWs. |
| **FLAC** | `.flac` | Lossless | Compressed | Audiophile lossless archival format via FFmpeg WASM. |
| **OGG** | `.ogg` | Open | OGG / Opus | Open-source audio container for modern web applications. |
| **WebM** | `.webm` | Native | Opus container | Direct browser recording pass-through with 0ms re-encoding. |

* **Non-Blocking Progress UI**: Processes audio in sample blocks, yielding to the browser event loop so the popup remains fluid with a live progress indicator (`Converting audio... MP3 78%`).
* **Multi-Format Export**: Convert to MP3, download, then select WAV and download again from the same session without re-recording.

---

## Privacy First

> **Your audio never needs to leave your computer.**

* **No audio uploads**: Recordings are created and processed entirely within your browser.
* **No remote processing**: No external cloud rendering or remote transcoding.
* **No audio database**: Nothing is stored on remote servers or third-party databases.
* **No account required**: Install and use immediately with zero registration, login, or API keys.
* **Zero telemetry**: The extension contains no tracking scripts, analytics, or behavioral telemetry.
* **100% local**: Audio stays strictly in local browser memory and downloads directly to your computer.

---

## Responsible Use

Tab Audio Recorder is a general-purpose browser audio recording tool. Users are responsible for ensuring that they have the necessary rights or permissions to record and save audio.

The extension is **not** designed to bypass:
* Digital Rights Management (DRM)
* Authentication or user paywalls
* Website download restrictions or access controls
* Copyright-protected stream encryption

---

## 📥 Installation from Pre-Built Releases

Download the latest pre-built packages from [**GitHub Releases**](https://github.com/timalabs/tab-audio-recorder/releases).

### For Google Chrome / Brave / Microsoft Edge:
1. Download `tab-audio-recorder-chrome-v1.3.0.zip` from the [latest release](https://github.com/timalabs/tab-audio-recorder/releases).
2. Unzip the file into a folder on your computer.
3. Open `chrome://extensions/` in your browser.
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** (top-left button) and select the unzipped folder.
6. Pin **Tab Audio Recorder** to your toolbar.

### For Mozilla Firefox:
1. Download `tab-audio-recorder-firefox-v1.3.0.xpi` (or `.zip`).
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on...**.
4. Select the downloaded `.xpi` (or `manifest.json` from the unzipped archive).
5. The extension is now active in Firefox.

---

## FAQ

### Can I record audio from Spotify?
> The extension is designed to capture audio playing in a browser tab. Whether recording is appropriate depends on your rights and the service's terms. The extension does not bypass DRM or access controls.

### Can I record audio from Suno?
> The extension can capture audio playing in a supported browser tab. It does not bypass Suno's authentication, DRM, or access controls. Users are responsible for complying with applicable terms and rights.

### Can I convert WebM to MP3?
> Yes. Audio conversion is performed locally in the browser with sensible defaults (192 kbps stereo MP3).

### Does the audio get uploaded?
> No. The intended architecture processes recordings locally in the browser. Zero audio is ever uploaded to external servers.

### Does it work with Firefox?
> Yes, the project provides a Firefox build in addition to Chrome.

### Can it remove silence?
> Yes. Smart Silence Trimming can remove unwanted silence at the beginning and end while preserving intentional silence inside the protected track duration.

---

## Supported Browsers

| Browser | Platform Architecture | Capture Mechanism | Package Format |
|---------|-----------------------|-------------------|----------------|
| **Google Chrome** (v116+) | Manifest V3 | `chrome.tabCapture` + `chrome.offscreen` | `.zip` |
| **Mozilla Firefox** (v109+) | WebExtensions MV3 | `HTMLMediaElement.captureStream()` bridge | `.xpi` / `.zip` |

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
| `storage` | Persists user settings (Trim silence toggle, duration hint, format preference) locally in browser. |

*No history, cookie, blanket host, or webRequest permissions are ever requested.*

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

## License

This project is licensed under the [MIT License](LICENSE).
