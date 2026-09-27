# Auto-Start Recording

**Tab Audio Recorder** features an optional **Auto-start Recording** capability that monitors captured browser tab audio levels and begins recording automatically when sustained sound is detected.

---

## 1. Overview & Workflow

Auto-start allows you to arm the extension, switch tabs or prepare a media player, and let the extension start recording hands-free the moment audio actually begins.

```text
       Waiting for audio
              ↓
    Audio level detected
              ↓
  Sustained audio confirmed (≥ 400ms)
              ↓
  Pre-roll + audio captured (700ms)
              ↓
      Recording started
```

---

## 2. Core Detection Principles

### 1. Root-Mean-Square (RMS) & Decibel Calculation
Audio is monitored locally via the Web Audio API (`AnalyserNode`). The detector computes the time-domain root-mean-square energy:
$$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} s[i]^2}$$
$$\text{dB} = 20 \log_{10}(\text{RMS})$$

The default detection threshold is **`-48 dB`** (adjustable from `-60 dB` to `-25 dB`).

### 2. False Start Rejection (Transient Spikes & Clicks)
The detector will **not** start recording because of:
* Mouse clicks or keystroke audio
* Short UI sounds or alert chimes
* Transient audio pops or buffering clicks

To trigger recording, sound must remain continuously above the threshold for at least the **Minimum sound duration** (default: **`400 ms`**). Any burst shorter than this duration is rejected and resets the detection counter.

```text
tiny spike (50ms)  ──► ignore (reset)
short sound (150ms) ──► ignore (reset)
sustained audio (≥400ms) ──► CONFIRMED ──► START RECORDING
```

---

## 3. Pre-Roll Buffer (Preserving Opening Attacks)

Starting recording at the exact millisecond the threshold is confirmed would cut off:
* The first drum beat or cymbal crash
* Opening vocal attack or breath
* Initial instrument transient
* Subtle song fade-ins

To solve this completely, the extension configures a Web Audio **`DelayNode`** buffering **`700 ms`** (configurable up to `1500 ms`) of audio ahead of the recorder.

```text
Real time: ────► t = 0 (sound starts) ────► t = 400ms (sustained confirmed)
                                                    │
                                                    ▼
Delayed stream at t = 400ms: ─────────────► t = -300ms (pre-attack silence)
                                                    +
                                            t = 0 (first drum hit preserved!)
```

When sustained audio is confirmed, the MediaRecorder starts recording the delayed stream. **Not a single millisecond of the opening note is lost.**

---

## 4. Interaction with Other Features

### Interaction with Track Duration
Auto-start and Track Duration work harmoniously together:
1. **Waiting for audio**: Extension monitors the tab in `WAITING_FOR_AUDIO` state.
2. **Audio detected**: Recording starts at $t = 0$.
3. **Protected window ($0:00 \to 03:42$)**: Any internal silence, quiet interlude, or breakdown inside this duration is **strictly preserved**.
4. **Post-duration**: Sustained silence occurring *after* the expected duration signals the genuine end of the track.

### Interaction with Smart Silence Trimming
* Auto-start and Smart Trim are completely independent:
  * **Auto-start**: Controls *when recording begins*.
  * **Smart Trim**: Analyzes the final recording *after it stops* to trim any remaining leading/trailing silence to pristine sample boundaries.

### Auto-Start vs. Auto-Stop
* Auto-start **only controls the start of recording**.
* It does **not** assume the track should stop automatically. The user stops the recording manually, or when the session ends.

---

## 5. UI States & Indicators

| Status | Display Label | Description |
| :--- | :--- | :--- |
| `IDLE` | `Start Recording` / `Wait for Audio` | Extension is idle. |
| `WAITING_FOR_AUDIO` | `Waiting for audio...` | Armed and monitoring tab audio levels. Visualizer is active. |
| `AUDIO_DETECTED` | `Audio detected! Starting...` | Sustained sound confirmed; launching recorder. |
| `RECORDING` | `🔴 Recording active 00:00` | Recording in progress. |
| `STOPPING` | `Finalizing audio...` | Slicing silence / preparing master audio. |
| `COMPLETED` | `Recording Complete` | Ready for format conversion and download. |

---

## 6. Advanced Settings Configuration

Under **Smart recording** → **Advanced**, you can fine-tune:

* **Audio detection threshold** (Default: `-48 dB`):
  Lower values (e.g. `-55 dB`) increase sensitivity for very quiet classical music or soft speech. Higher values (e.g. `-35 dB`) prevent triggering on noisy backgrounds.
* **Minimum sound duration** (Default: `400 ms`):
  Duration of sustained sound required before triggering. Higher values provide stronger rejection of accidental clicks.
* **Pre-roll buffer** (Default: `700 ms`):
  Amount of audio prepended to the recording to preserve the opening transient attack.

---

## 7. Privacy & Performance

* **100% Client-Side**: Sound level analysis runs strictly on your device's audio hardware via Web Audio API.
* **Zero Telemetry or Speech Recognition**: No audio is ever processed by external AI models or uploaded anywhere.
* **Background Persistence**: In Chrome MV3, monitoring runs in the dedicated offscreen document, allowing you to close the popup without interrupting detection.
* **Lightweight**: Analysis loop runs at an efficient interval (~50ms) using less than 1% CPU.

---

## 8. Manual Testing Guide

### Test on Google Chrome:
1. Open a video or music player (e.g. YouTube, Suno, Spotify). Ensure the track is paused.
2. Click the **Tab Audio Recorder** icon.
3. In **Smart recording**, toggle **Auto-start recording** to `ON`.
4. Click **Wait for Audio**. The status will display `Waiting for audio...`.
5. Close the extension popup.
6. Press play on the video/track.
7. Reopen the popup: notice the status has automatically switched to `🔴 Recording active` with live elapsed time.
8. Stop recording and verify the downloaded audio includes the opening attack cleanly.

### Test on Mozilla Firefox:
1. Open a media page with an HTML5 `<video>` or `<audio>` element.
2. Toggle **Auto-start recording** to `ON` and click **Wait for Audio**.
3. Play audio on the page; verify recording automatically initiates once sustained sound begins.
