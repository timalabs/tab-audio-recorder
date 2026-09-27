# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-09-27

### Added
- **Client-Side Audio Format Conversion**:
  - Export tab recordings to **MP3**, **WAV**, **FLAC**, **OGG**, and **WebM** directly in your browser.
  - **MP3 (Default)**: Fast, non-blocking 192 kbps stereo encoding via `@breezystack/lamejs`.
  - **WAV**: Instant, uncompressed 16-bit PCM RIFF export.
  - **WebM**: Native browser container pass-through.
  - **FLAC & OGG**: On-demand encoding with lazy-loaded FFmpeg WASM.
  - **100% Client-Side & Private**: All conversion happens in browser memory; zero cloud uploads or third-party APIs.
  - **Multi-Format Re-Export**: Generate multiple formats (e.g. MP3 and WAV) from the same recording without re-recording.
  - **Format History Chips**: Visual badges (`✓ MP3`, `✓ WAV`) for instant re-downloading of already converted files.
- **Non-Blocking Conversion UX**:
  - Event-loop yielding ensures the popup never freezes during conversion.
  - Smooth animated progress bar with real-time percentage (`Converting audio... MP3 78%`).
  - Graceful cancellation support via `Cancel` button.
- **Improved Smart Trim UX**:
  - Dynamic explanatory annotations below the `Track duration` input:
    - Trim ON + Duration set: `ⓘ Silence within this duration will not be trimmed.`
    - Trim ON + Duration empty: `ⓘ Optional. Helps detect the end of the track.`
    - Trim OFF: `ⓘ Enable Trim silence to use track duration.`
  - Completed view displays Original Duration vs. Trimmed Duration with saved time badge.
- **Format Preference Persistence**:
  - Saves preferred output format in `chrome.storage.local` and `localStorage`.
- **Comprehensive Documentation**:
  - Added `docs/smart-trim.md` explaining trimming algorithms, RMS energy windows, and safe duration window.
  - Added `docs/audio-conversion.md` detailing conversion architecture, lazy loading, and privacy guarantees.
- **Expanded Test Suite**:
  - 71 unit tests covering all trimming scenarios, format encoding, progress reporting, aborting, and error recovery.

---

## [1.1.0] - 2026-09-27

### Added
- **Smart Silence Trimming**:
  - Automatically slices away unwanted leading and trailing silence after recording while **strictly preserving all internal silence and pauses**.
  - Local Web Audio API PCM analysis and lossless 16-bit WAV audio encoding.
- **Trim Silence Toggle**:
  - Clear `ON / OFF` toggle in popup UI (defaults to `ON`).
  - When `OFF`, downloads untouched raw recording without any processing.
- **Safe Track Duration Window**:
  - Optional `Track duration` input (`MM:SS` format, e.g. `03:42`, `00:45`, `05:00`).
  - Acts as a contextual safe window to prevent interpreting internal musical pauses as track endings before the expected duration.
  - Visually disabled when silence trimming is toggled OFF.
- **Local Settings Persistence**:
  - Saves user settings (`trimSilence`, `expectedDurationMs`) across browser sessions using `chrome.storage.local`.
- **Comprehensive Test Suite**:
  - 60 unit tests covering all 10 trimming edge cases (short tracks, long tracks, internal pauses, fade-in, fade-out, ending before/after expected duration).

---

## [1.0.0] - 2026-09-27

### Added
- **Production Extension Core**: Fully operational cross-browser tab audio recording for Google Chrome and Mozilla Firefox.
- **Chrome Manifest V3 Architecture**:
  - `tabCapture` stream ID resolution in background service worker.
  - Dedicated offscreen document (`offscreen.html`) hosting `AudioContext` and `MediaRecorder`.
  - Pass-through audio routing to speaker (`audioCtx.destination`) ensuring tabs remain audible while being recorded.
- **Firefox WebExtensions Support**:
  - In-page HTMLMediaElement capture stream bridge (`captureStream()` / `mozCaptureStream()`).
  - Graceful media fallback and clear notification when no active media elements are detected.
- **Persistent Recording**:
  - Independent recording lifecycle: closing and reopening the extension popup does not interrupt active recordings.
  - Real-time synchronization between background service worker / offscreen and React popup UI.
- **Dynamic MIME Type Negotiation**:
  - Runtime detection prioritizing `audio/webm;codecs=opus`, with fallbacks to `audio/webm`, `audio/ogg;codecs=opus`, and `audio/mp4`.
- **Audio Level Visualizer**:
  - 10-bar lightweight audio meter powered by `AnalyserNode` frequency bins.
  - Extensible `AudioAnalyzer` interface supporting future silence detection and auto-stop.
- **Safe Filename Generation**:
  - Intelligent title-based sanitization stripping illegal filesystem characters across Windows, macOS, and Linux.
  - Standardized timestamping (`YYYY-MM-DD-HH-mm-ss`).
- **Dark Premium Interface**:
  - Polished Obsidian & Slate theme with 360px fixed width and zero horizontal overflow.
  - Keyboard accessible controls and high-contrast ARIA indicators.
- **Automated Testing & Build System**:
  - Vitest test suite with 38 unit tests covering MIME detection, sanitization, duration calculations, error mapping, and Web Audio graphs.
  - Automated multi-target builder producing unpacked `dist/chrome/` and `dist/firefox/` bundles.
