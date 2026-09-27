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
Audio is monitored locally via the Web Audio API (`AnalyserNode`). The detector computes the time-domain root-mean-square energy using 32-bit floating-point samples:
$$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} s[i]^2}$$
$$\text{dB} = 20 \log_{10}(\text{RMS})$$

* **Analyser Configuration**:
  * `fftSize = 2048` (42.6ms high-precision resolution window).
  * `smoothingTimeConstant = 0.1` (immediate transient response).
  * `minDecibels = -100 dB`, `maxDecibels = 0 dB`.
* **Default Threshold**: **`-48 dB`** (adjustable from `-60 dB` to `-25 dB`).

### 2. AudioContext Resumption & Engine Activation
Under modern browser autoplay policies (Chrome MV3 offscreen documents and Firefox content scripts), `AudioContext` instances created without a direct DOM click event begin in the `'suspended'` state.
* If suspended, the audio rendering clock does not advance and the analyser yields silence.
* The extension proactively calls `await audioContext.resume()` via `ensureRunning()` to guarantee the audio rendering clock is running before monitoring tab audio.

### 3. Rendering Pull via Zero-Gain Destination Bridge
Web Audio implementations (especially in Firefox) only pump frames from a `MediaStreamAudioSourceNode` when the graph terminates in an active destination.
* **Chrome (Pass-Through)**: Directly connects `analyserNode` to `audioContext.destination` so the user hears tab audio without latency.
* **Firefox (In-Page Capture)**: Page audio is already playing through the browser DOM; connecting directly to destination would create an echo. Instead, the extension routes through a `GainNode(gain = 0)` to `audioContext.destination`. This forces continuous audio frame rendering through the analyser with zero audible output.

### 4. False Start Rejection (Transient Spikes & Clicks)
The detector will **not** start recording because of:
* Mouse clicks or keyboard keystrokes
* Short UI sounds or alert chimes
* Transient audio pops or buffering clicks

To trigger recording, sound must remain continuously above the threshold for at least the **Minimum sound duration** (default: **`400 ms`**). Any burst shorter than this duration is rejected and resets the detection counter.

### 5. Hysteresis Margin
To prevent erratic state flutter when audio hovers near the threshold, a **3 dB hysteresis release margin** is applied. Once candidate detection starts at the trigger threshold (e.g. `-48 dB`), audio is allowed to dip down to `-51 dB` during musical decay without resetting the detection timer.

### 6. Ambient Baseline Calibration
During the first 600 ms of monitoring, the detector measures the ambient noise floor of the tab. If audio is silent, the measured noise floor (e.g. `-78 dB`) is recorded and displayed in the diagnostics panel.

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

## 4. Live Diagnostics & Debug Mode

When Auto-start is enabled or active in `WAITING_FOR_AUDIO` / `AUDIO_DETECTED`, the popup displays a real-time **Audio level** meter alongside an expandable **Diagnostics** panel:

```text
Auto-start: ON
Audio level: -18.4 dB (or -∞ dB when silent)
```

### Diagnostic Grid Metrics
| Metric | Description | Expected Value |
| :--- | :--- | :--- |
| **Capture** | MediaStream activity state | `OK` (stream active) |
| **Audio tracks** | Track count, readyState, muted | `1 (live, unmuted)` |
| **AudioContext** | Audio context lifecycle | `running` |
| **Analyser** | Analyser node status | `active` (fftSize 2048) |
| **RMS** | 32-bit floating-point energy | `0.00000` to `0.25000` |
| **dB** | Decibels relative to full scale | `-100 dB` to `0 dB` |
| **Threshold** | Configured trigger threshold | e.g. `-48 dB` |
| **Above threshold** | Real-time threshold evaluation | `YES` / `NO` |
| **Detection timer** | Elapsed candidate sound duration | `0 ms` to `400 ms` |
| **Noise floor** | Measured baseline ambient floor | e.g. `-74 dB` |
| **State** | Extension recorder state | `WAITING_FOR_AUDIO` |

---

## 5. Interaction with Other Features

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

## 6. Known Limitations & Edge Cases

* **Browser Internal Pages**: Browser security policies prevent extensions from capturing audio from `chrome://`, `about:`, and extension store pages.
* **Silent Video/Audio Tags**: If a webpage contains a `<video>` tag with no audio track or completely muted source, detection remains in `WAITING_FOR_AUDIO`.
* **Hardware Mute**: If the tab is muted at the browser tab strip level, Chrome mutes the captured audio track (`track.muted === true`). Unmute the tab to allow detection.
