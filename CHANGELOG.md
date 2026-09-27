# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
