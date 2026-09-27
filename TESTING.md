# Manual & Automated Testing Guide

This document details the test strategy, automated test execution, and comprehensive manual test checklist for **Tab Audio Recorder**.

---

## 1. Automated Unit Tests

Automated tests are written with [Vitest](https://vitest.dev/) and cover critical non-browser logic, formatting utilities, and mockable browser abstractions.

Run the test suite:

```bash
npm run test
```

### Test Suites Covered
- **`tests/mimeTypes.test.ts`**: Verifies dynamic detection of audio containers/codecs (`WebM/Opus`, `OGG/Opus`, `MP4`), graceful fallback handling when unsupported, and protection against API exceptions.
- **`tests/filename.test.ts`**: Tests timestamp generation (`YYYY-MM-DD-HH-mm-ss`), title sanitization (removing characters illegal on Windows/macOS/Linux: `[<>:"/\\|?*]`), whitespace collapsing, length truncation, and fallback naming.
- **`tests/time.test.ts`**: Tests formatted output (`00:00`, `01:24`, `01:32:45`), edge cases (zero, negative, NaN), and elapsed time calculation.
- **`tests/recorderState.test.ts`**: Verifies recorder state machine transitions (`IDLE` → `STARTING` → `RECORDING` → `STOPPING` → `COMPLETED` / `ERROR`).
- **`tests/errors.test.ts`**: Tests detection of restricted browser URLs (`chrome://`, `about:`, `moz-extension://`), translation of browser DOM exceptions (`NotAllowedError`, `NotFoundError`) into clean human-readable copy.
- **`tests/AudioAnalyzer.test.ts`**: Tests Web Audio API graph instantiation, level calculations, silence detection callback triggers, and memory cleanup.

---

## 2. Manual Test Plan (16-Point Checklist)

Follow this checklist when testing a newly built unpacked extension in Chrome and Firefox.

### Pre-requisites
1. Build both targets:
   ```bash
   npm run build
   ```
2. Unpacked outputs are ready in:
   - Chrome: `dist/chrome/`
   - Firefox: `dist/firefox/`

---

### Step-by-Step Test Scenarios

| # | Test Scenario | Steps | Expected Outcome | Result |
|---|---------------|-------|------------------|--------|
| **1** | **Chrome Loading** | Open `chrome://extensions/`, enable Developer Mode, click **Load unpacked**, select `dist/chrome/`. | Extension loads without warnings or manifest errors. Icon appears in toolbar. | [ ] |
| **2** | **Firefox Loading** | Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, select `dist/firefox/manifest.json`. | Extension loads cleanly with valid permissions. | [ ] |
| **3** | **Start Recording** | Open an audio site (e.g. YouTube, SoundCloud, or HTML5 player), open extension popup, click **Start Recording**. | State changes to `RECORDING`, red indicator pulses, timer advances, tab audio remains audible. | [ ] |
| **4** | **Stop Recording** | While recording, click **Stop Recording**. | State transitions to `STOPPING` then `COMPLETED`. Duration, format, and file size are accurately displayed. | [ ] |
| **5** | **Close Popup During Recording** | Start recording, close the popup by clicking anywhere outside or switching tabs. Wait 10-15 seconds. | Browser tab still shows audio capture indicator; service worker and offscreen document stay active. | [ ] |
| **6** | **Reopen Popup** | Click extension icon again while background recording is active. | Popup immediately renders the active `RECORDING` state with accurate elapsed time. | [ ] |
| **7** | **Download Recording** | From `COMPLETED` state, click **Download**. | Browser prompt or automatic save opens with sanitized filename (e.g., `Video-Title-2026-09-27-21-45-12.webm`). Audio plays clearly in media player. | [ ] |
| **8** | **Record Multiple Times** | Click **New Recording**, record another audio snippet, and download it. | Second recording starts fresh from 00:00 without overwriting the previous download. | [ ] |
| **9** | **Record Silent Tab** | Open a tab with no audio playing and click **Start Recording**. | Extension records cleanly; visualizer bars remain at resting minimum height. | [ ] |
| **10** | **Record Tab with Audio** | Play active music/speech. | Visualizer bars bounce dynamically in sync with audio output. Tab audio remains audible to the user. | [ ] |
| **11** | **Navigate Tab While Recording** | Start recording a tab, then navigate to another URL within that tab. | Recording handles track end or navigation gracefully without throwing uncaught exceptions. | [ ] |
| **12** | **Close Tab While Recording** | Start recording a tab, then close the tab immediately. | Extension detects closure and transitions to `COMPLETED` or friendly `ERROR` ("The target browser tab was closed"). | [ ] |
| **13** | **Restricted Browser Pages** | Navigate to `chrome://settings`, `about:debugging`, or an extension page and open popup. | Banner informs user: *"This page cannot be recorded by browser extensions. Please open a standard web page."* Recording button is guarded. | [ ] |
| **14** | **MIME Type Negotiation** | Test in Chrome (native `audio/webm;codecs=opus`) and Firefox (standard WebM/OGG). | Extension picks the best supported format dynamically without manual configuration. | [ ] |
| **15** | **Long Recording Duration** | Record continuous audio for > 5 minutes (or simulate 1h+). | Timer correctly formats to `HH:MM:SS` once past 1 hour. No memory leaks or offscreen crashes. | [ ] |
| **16** | **Keyboard Navigation** | Use `Tab`, `Shift+Tab`, `Space`, and `Enter` exclusively in the popup. | Clear visible focus rings on all buttons. Entire start/stop/download flow is operable without a mouse. | [ ] |
