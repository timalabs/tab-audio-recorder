# Smart Silence Trimming

**Tab Audio Recorder** features an intelligent client-side silence trimming engine designed to produce clean, ready-to-use audio files without manual editing.

---

## 1. Core Principles

1. **100% Local & In-Memory**: Audio analysis, trimming, and slicing happen entirely within your browser using the Web Audio API. No audio is ever uploaded to any server or external API.
2. **Never Remove Internal Silence**: Natural musical pauses, dramatic rests, dialogue gaps, and quiet interludes between song movements are **never** removed. Only unwanted leading and trailing silence are trimmed.
3. **Protected Safe Window**: When an expected track duration is provided (e.g. `03:42`), it defines a *protected window* rather than a rigid guillotine cut. All silence inside this window is guaranteed to be preserved.

---

## 2. Trimming Modes & Dynamic UI

In the extension popup, you can configure trimming under **Smart recording**:

| Setting | State | Annotation / Behavior |
| :--- | :--- | :--- |
| **Trim silence** | `ON` | Automatically trims leading and trailing silence after recording stops. |
| **Trim silence** | `OFF` | Trimming is completely bypassed. Downloads exact byte-for-byte recording. |
| **Track duration** | `ON` + Duration set (`03:42`) | `ⓘ Silence within this duration will not be trimmed.` |
| **Track duration** | `ON` + Duration empty | `ⓘ Optional. Helps detect the end of the track.` |
| **Track duration** | `OFF` | Disabled (`row-disabled`), shows `ⓘ Enable Trim silence to use track duration.` |

---

## 3. How the Trimming Algorithm Works

```
                                TRACK DURATION (e.g., 03:42)
                    ├─────────────────────────────────────────────────┤
                    │                PROTECTED WINDOW                 │
                    │                                                 │
[ LEADING SILENCE ] │ [ MUSIC INTRO ] ── [ SILENCE ] ── [ MUSIC OUTRO ]│ [ TRAILING SILENCE ]
      TRIMMED       │   PRESERVED           PRESERVED       PRESERVED │       TRIMMED
                    └─────────────────────────────────────────────────┴──────────────────────► Time
```

### Step 1: RMS Energy Window Analysis
The recorded audio is converted into a linear PCM `AudioBuffer`. The engine analyzes the audio in 25ms root-mean-square (RMS) energy windows across all channels:
$$\text{RMS} = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} x[i]^2}$$

An RMS energy threshold of `-46 dB` ($\approx 0.005$) distinguishes silence/background noise from intentional audio content.

### Step 2: Leading Silence Detection
- The engine scans from $t = 0$ until energy exceeds the threshold.
- A **60ms pre-roll padding** is subtracted from the start boundary to preserve the natural attack and transients of the opening note.

### Step 3: Trailing Silence Detection & Safe Window
- **Protected Window**: If an expected track duration $D$ is specified, the engine will **never** cut earlier than $D$ minus post-roll. Any quiet passage or silence occurring before $D$ is preserved.
- **Sustained Silence Confirmation**: To prevent trimming during an extended pause or slow decay, the engine requires sustained silence ($\ge 1500\text{ms}$) after active audio to confirm the track has genuinely concluded.
- A **250ms post-roll padding** is added to preserve natural reverb tails and room acoustic decay.

### Step 4: Slicing and WAV Slicing
If meaningful trimming occurs ($>60\text{ms}$ at start or $>250\text{ms}$ at end), the AudioBuffer is sliced and converted into a pristine 16-bit PCM WAV. If trimming would remove negligible duration or if trimming is disabled, the original buffer is preserved without alterations.

---

## 4. Examples

### Case A: Song with Leading & Trailing Dead Time
- **Input**: 3s silence + 3m 30s song + 6s silence = 3m 39s total.
- **Expected Duration**: Empty or `03:30`.
- **Result**: Exactly 3m 30s song with clean intro attack and natural reverb fade-out.

### Case B: Ambient Track with a 10-Second Silent Interlude
- **Input**: 2s silence + 1m music + 10s silent interlude + 1m music + 4s silence.
- **Result**: The 10-second silent interlude is **completely preserved** intact. Only the 2s leading silence and 4s trailing silence are trimmed.

---

## 5. Persistence
Settings are automatically saved in `chrome.storage.local` with automatic fallback to `localStorage`. Your preference (`Trim silence` and `Track duration`) will be remembered across sessions.
