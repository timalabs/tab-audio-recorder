# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1] - 2026-09-27

### Fixed
- **Timer Stalling & Fallback Start Time**:
  - Resolved an issue where the live recording timer could freeze at `00:00` if `startedAt` was omitted in background IPC state broadcasts.
  - Added robust start timestamp fallback (`state.startedAt || Date.now()`) with smooth 100 ms interval ticking.
  - Display standard digital time format (`00:00`) during waiting states rather than placeholder dashes (`--:--`).
  - Added immediate state synchronization (`syncState()`) upon starting and stopping recording.
- **Background State Re-broadcasting**:
  - Ensured background service worker re-broadcasts all `STATE_CHANGED` messages received from offscreen documents and content scripts to active popup views.
  - Added explicit `startedAt` timestamp to Firefox content script state messages.
- **Auto-Start Audio Detection Pipeline**:
  - Resolved browser autoplay policy suspension via proactive `AudioContext.resume()` in offscreen documents.
  - Implemented 32-bit floating-point RMS detection with calibrated noise floor and 3 dB hysteresis margin.
- **Auto-Start UX Simplification**:
  - Standardized the primary idle button label to **"Start Recording"** regardless of whether Auto-start is enabled or disabled.
  - Implemented clear state progression: `[ Start Recording ]` → `"Waiting for audio..."` → `"Audio detected"` → `"🔴 Recording"`.
- **Clean UI & Logging**:
  - Removed temporary developer diagnostics UI card and cleaned up verbose `console.log` messages for a clean production experience.
- **Friendly Missing Track Guidance**:
  - Improved error notification when no active audio track is present: clear prompt to start playback in the tab and try again.

---

## [1.3.0] - 2026-09-27

### Added
- **Auto-Start Recording Pipeline**:
  - Hands-free audio recording that monitors the captured tab audio level and automatically starts recording when meaningful sound is detected.
  - **Auto-start recording toggle (`ON / OFF`, default: OFF)**: Preserves existing manual workflow when OFF; enters audio monitoring mode when ON.
  - **AudioContext Resumption**: Proactive `ensureRunning()` resumption prevents browser autoplay policies from stalling the audio rendering clock in Chrome MV3 offscreen documents and Firefox content scripts.
  - **Zero-Gain Destination Bridge**: In Firefox, routes the audio through a `GainNode(gain = 0)` to `audioContext.destination`, ensuring the audio rendering thread continuously processes audio frames without generating double-audio or acoustic feedback.
  - **32-Bit Float32Array RMS Detection**: High-precision time-domain signal power calculation ($20 \log_{10}(\text{RMS})$) with `fftSize = 2048` (42.6ms sampling window) and `smoothingTimeConstant = 0.1`.
  - **Transient Spike Rejection (Anti-False-Start)**: Requires sustained audio above the threshold for at least 400 ms (configurable) before triggering recording, eliminating false starts from clicks, pops, and short notification sounds.
  - **3 dB Hysteresis Margin**: Prevents candidate detection state flutter when audio fluctuates near the threshold.
  - **Ambient Baseline Calibration**: Measures ambient noise floor for 600 ms upon arming to establish a calibrated reference level.
  - **Web Audio Pre-Roll Delay Buffer**: Routes the recording stream through a Web Audio `DelayNode` (700 ms default, configurable) feeding into `MediaStreamAudioDestinationNode`. Ensures the initial transient attack, drum hit, or vocal intro is preserved without losing the first notes. Direct 0ms latency speaker pass-through is maintained so the tab plays without delay.
  - **Live Audio Meter & Developer Diagnostics Panel**:
    - Live decibel indicator (`Audio level: -18.4 dB` or `-∞ dB` when silent).
    - Expandable diagnostic grid displaying Capture state, Audio tracks count/readyState/mute status, AudioContext lifecycle, Analyser status, RMS, current dB, threshold, Above-Threshold flag, Detection timer ms, Noise floor dB, and current recorder state.
  - **Advanced Settings Accordion**: Collapsible panel in the popup UI allowing fine-grained control:
    - Audio Detection Threshold (`-60 dB` to `-25 dB`, default: `-48 dB`)
    - Minimum Sound Duration (`100 ms` to `1200 ms`, default: `400 ms`)
    - Pre-roll Delay Buffer (`200 ms` to `1500 ms`, default: `700 ms`)
    - Reset to Defaults button
  - **Independent Background Monitoring**:
    - Runs in Chrome offscreen document and Firefox content script bridge; monitoring continues uninterrupted if the popup is closed.
    - Explicit `FORCE_RECORD` ("Record Now") and `Cancel Monitoring` controls during the `WAITING_FOR_AUDIO` state.
  - **Settings Persistence**:
    - Persists auto-start preference and advanced tuning in `chrome.storage.local` with fallback to `localStorage`.
- **Comprehensive Documentation**:
  - Added `docs/auto-start.md` detailing Web Audio graph routing, DelayNode pre-roll mechanics, false-start state transitions, and manual verification guide.
  - Added `docs/audio-processing.md` detailing the complete end-to-end audio pipeline across Chrome and Firefox.
- **Expanded Test Suite**:
  - Added comprehensive regression tests covering suspended AudioContext resumption, inactive MediaStream handling, quiet audio hysteresis, Float32Array RMS calculations, and silence rejection.
  - Expanded total test suite to 82 passing tests across 10 test suites.

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
