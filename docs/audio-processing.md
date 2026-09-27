# Audio Processing Architecture

This document details the audio processing pipeline of **Tab Audio Recorder**, covering tab capture, Web Audio graph routing, real-time level analysis, silence trimming, and client-side format conversion.

---

## 1. Complete Audio Pipeline Architecture

```text
Browser Tab Audio (HTML5 / Web Audio / Media Streams)
        │
        ▼
Stream Capture
  ├── Chrome MV3: chrome.tabCapture.getMediaStreamId() ──► navigator.mediaDevices.getUserMedia()
  └── Firefox: HTMLMediaElement.captureStream() / mozCaptureStream()
        │
        ▼
AudioContext Initialization (Resumed via ensureRunning())
        │
        ├──► MediaStreamAudioSourceNode
        │          │
        │          ├──► AnalyserNode (fftSize=2048, Float32Array RMS dB)
        │          │          │
        │          │          ├── (Chrome) ──► audioContext.destination (0ms direct speaker pass-through)
        │          │          └── (Firefox) ──► GainNode(gain=0) ──► audioContext.destination (rendering pull)
        │          │
        │          └──► DelayNode (Pre-roll buffer: 700ms)
        │                     │
        │                     └──► MediaStreamAudioDestinationNode
        │                                │
        │                                └──► MediaRecorder (WebM / Opus container)
        │                                           │
        ▼                                           ▼
Trimming & Conversion Pipeline               Blob[] Chunks
  ├── Silence Analysis: trimAudioBlob() (Leading/Trailing silence slicing)
  └── Format Encoder: AudioConverter (MP3, WAV, FLAC, OGG, WebM)
        │
        ▼
Local File Download (Zero server uploads, 100% private in-browser)
```

---

## 2. Audio Capture Mechanisms

### Chrome Manifest V3
* **Background Service Worker**: Resolves the active tab stream ID via `chrome.tabCapture.getMediaStreamId({ targetTabId })`.
* **Offscreen Document (`offscreen.html`)**: Receives the `streamId` and invokes `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false })`.
* **Autoplay Resumption**: Modern Chromium places offscreen `AudioContext` instances in `'suspended'` state by default. The extension proactively calls `await audioContext.resume()` via `ensureRunning()` to activate the audio rendering clock.
* **Direct Speaker Pass-Through**: Connects the `AnalyserNode` directly to `audioContext.destination`, ensuring the user continues hearing their tab without latency while recording.

### Mozilla Firefox
* **Content Script Bridge**: Injects into the active tab to locate the active media element (`HTMLMediaElement`).
* **Element Stream Capture**: Calls `mediaEl.captureStream()` (or `mozCaptureStream()`).
* **Zero-Gain Destination Bridge**: Because the DOM element is already audible through page rendering, routing audio to `audioContext.destination` directly would create an echo. To force the Web Audio rendering engine to continuously pull audio frames through the `AnalyserNode` without creating audible output, audio is routed through a `GainNode` with `gain.value = 0` to `audioContext.destination`.

---

## 3. Real-Time RMS & Decibel Analysis

Audio signal power is computed using 32-bit floating-point time-domain samples:

```ts
analyser.getFloatTimeDomainData(buffer); // Float32Array with length = 2048

let sumSquares = 0;
for (let i = 0; i < buffer.length; i++) {
  const sample = buffer[i];
  sumSquares += sample * sample;
}

const rms = Math.sqrt(sumSquares / buffer.length);
const db = 20 * Math.log10(Math.max(rms, 1e-8));
```

### Analyser Configuration
* **`fftSize`**: `2048` (yields 42.6ms sampling window at 48kHz, providing accurate resolution down to 25 Hz).
* **`smoothingTimeConstant`**: `0.1` (fast transient response).
* **`minDecibels`**: `-100 dB`.
* **`maxDecibels`**: `0 dB`.

---

## 4. Auto-Start & False-Start Rejection

* **Transient Spike Rejection**: When audio crosses the detection threshold (default: `-48 dB`), a candidate timer starts. Audio must remain above the release threshold (`threshold - 3 dB`) continuously for at least `400 ms` (configurable `100–1200 ms`). Transient clicks, notification beeps, and pops (<400ms) are discarded.
* **Ambient Calibration**: The detector samples ambient noise levels during the initial 600ms of monitoring to establish the baseline noise floor.
* **Pre-Roll Delay Buffer**: A Web Audio `DelayNode` (default: `700 ms`, configurable `200–1500 ms`) buffers the audio stream before `MediaRecorder` is initiated. When sustained sound is confirmed, the recording starts from the pre-roll buffer, preserving the opening transient, attack beat, or quiet intro notes without clipping.

---

## 5. Smart Silence Trimming

* **PCM Decoding**: Raw WebM audio is decoded into an `AudioBuffer` in memory.
* **Leading/Trailing Silence Analysis**: Slices away unwanted silence before the track start and after the track end.
* **Internal Silence Preservation**: Silence occurring within the track or before the configured track duration window is **strictly preserved** (musical pauses, breakdowns, speech intervals).

---

## 6. Local Audio Format Conversion

* **MP3 (Default)**: 192 kbps joint-stereo encoding via `@breezystack/lamejs`. Chunked encoding yields to the browser event loop with a real-time progress indicator.
* **WAV**: Lossless 16-bit 44.1/48kHz linear PCM RIFF packaging.
* **FLAC & OGG**: Lossless and open-container formats encoded via on-demand WebAssembly.
* **WebM**: Native container pass-through with zero transcoding latency.
