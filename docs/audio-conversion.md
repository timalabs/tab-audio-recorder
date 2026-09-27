# Local Audio Format Conversion

**Tab Audio Recorder** includes an in-browser audio conversion pipeline allowing users to export tab recordings into standard audio formats completely offline.

---

## 1. Zero-Cloud Privacy Model

Most audio converter extensions send user audio to remote servers or third-party cloud APIs. **Tab Audio Recorder** takes the opposite approach:
- **100% Client-Side**: All audio decoding, resampling, and encoding happen locally on your CPU/RAM inside your browser.
- **Zero Server Uploads**: No audio data or metadata ever leaves your device.
- **Works Completely Offline**: You can record, trim, and convert audio even with no internet connection.

---

## 2. Processing Pipeline

The processing flow strictly executes in the following order:

```
┌─────────────────┐       ┌──────────────────────┐       ┌───────────────────┐       ┌──────────────┐
│  Browser Audio  │  ──►  │ Smart Silence Trim   │  ──►  │ Format Conversion │  ──►  │ Local File   │
│  Tab Capture    │       │ (Leading & Trailing) │       │ (MP3 / WAV / ...) │       │ Download     │
└─────────────────┘       └──────────────────────┘       └───────────────────┘       └──────────────┘
```

1. **Capture**: The browser captures tab audio via `chrome.tabCapture` (Chrome) or media element stream capture (Firefox) in native WebM/Opus.
2. **Smart Silence Trim**: The audio is decoded to PCM and trimmed at the boundaries if enabled.
3. **Format Conversion**: The trimmed PCM master is converted into the selected output format.
4. **Download**: The converted audio file is saved directly to your local `Downloads` folder.

---

## 3. Supported Output Formats

| Format | Extension | MIME Type | Encoder / Engine | Typical Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **MP3** (Default) | `.mp3` | `audio/mpeg` | LAME (192 kbps stereo) | Universal playback on all devices and music players. |
| **WAV** | `.wav` | `audio/wav` | Native 16-bit PCM RIFF | Lossless, uncompressed audio editing in DAWs. |
| **FLAC** | `.flac` | `audio/flac` | FFmpeg WASM / libflac | Lossless compression for audiophiles and archival. |
| **OGG** | `.ogg` | `audio/ogg` | FFmpeg WASM / Opus | Open-standard container for modern web media. |
| **WebM** | `.webm` | `audio/webm` | Native browser container | Fastest pass-through export with zero re-encoding time. |

---

## 4. Architectural Highlights

### Lazy Loading
Heavy libraries and encoding modules are **not** loaded during extension startup or background idle time:
- The popup and background service workers initialize instantly with minimum memory footprint (<10MB).
- Encoder modules (`mp3Encoder`, `@ffmpeg/ffmpeg`) are dynamically imported on-demand only when a conversion is requested.

### Non-Blocking Asynchronous Processing
Encoding large audio files in JavaScript could freeze the browser popup UI if executed synchronously.
- **Chunked Processing**: Audio is processed in discreet sample blocks (11,520 samples $\approx 250\text{ms}$).
- **Event Loop Yielding**: Between blocks, the encoder yields execution via `await new Promise(r => setTimeout(r, 0))`.
- **Live Progress Updates**: The popup renders a smooth, real-time progress bar:
  $$\text{Converting audio... MP3 [████████░░] 78\%}$$
- **Cancellation**: Users can cancel long conversions at any time with the `Cancel` button.

### Multi-Format Re-Export Without Re-Recording
Once an audio track is recorded, the base audio is cached in browser memory:
- You can export the track as **MP3**, click Download, then immediately choose **WAV** and download the uncompressed version without having to replay or re-record the tab audio.
- Generated formats are marked with ready chips (`✓ MP3`, `✓ WAV`) for instant re-download.

---

## 5. Settings Persistence
Your chosen output format is automatically saved in extension storage and becomes the default selection for subsequent recordings.
