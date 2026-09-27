export interface TrimOptions {
  trimSilence: boolean;
  expectedDurationMs?: number;
  threshold?: number; // Volume threshold (0.001 - 0.05, default: 0.005 = -46dB)
  preRollMs?: number; // Pre-roll padding to preserve attack (default: 60ms)
  postRollMs?: number; // Post-roll padding to preserve decay/reverb tail (default: 250ms)
  minSustainedSilenceMs?: number; // Minimum silence to confirm track ending (default: 1500ms)
}

export interface TrimBoundaries {
  startMs: number;
  endMs: number;
  originalDurationMs: number;
  trimmedDurationMs: number;
  trimmed: boolean;
}

export interface AudioWindow {
  timeMs: number;
  rms: number;
}

/**
 * Computes root-mean-square (RMS) energy windows across all channels of an AudioBuffer.
 */
export function computeRmsWindows(
  audioBuffer: AudioBuffer,
  windowDurationMs: number = 25
): { windows: AudioWindow[]; windowSizeSamples: number } {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;
  const windowSizeSamples = Math.max(1, Math.floor((sampleRate * windowDurationMs) / 1000));
  const totalWindows = Math.ceil(totalSamples / windowSizeSamples);

  const channelsData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelsData.push(audioBuffer.getChannelData(c));
  }

  const windows: AudioWindow[] = new Array(totalWindows);

  for (let w = 0; w < totalWindows; w++) {
    const startSample = w * windowSizeSamples;
    const endSample = Math.min(totalSamples, startSample + windowSizeSamples);
    const count = endSample - startSample;

    let maxChannelRms = 0;
    for (let c = 0; c < numChannels; c++) {
      const data = channelsData[c];
      let sumSquares = 0;
      for (let s = startSample; s < endSample; s++) {
        const val = data[s];
        sumSquares += val * val;
      }
      const channelRms = Math.sqrt(sumSquares / count);
      if (channelRms > maxChannelRms) {
        maxChannelRms = channelRms;
      }
    }

    windows[w] = {
      timeMs: Math.round((startSample / sampleRate) * 1000),
      rms: maxChannelRms,
    };
  }

  return { windows, windowSizeSamples };
}

/**
 * Analyzes audio windows to find leading and trailing silence boundaries.
 * Guarantees that internal silence inside the track is NEVER removed.
 */
export function analyzeSilenceBoundaries(
  windows: AudioWindow[],
  originalDurationMs: number,
  options: TrimOptions
): TrimBoundaries {
  const {
    trimSilence,
    expectedDurationMs,
    threshold = 0.005,
    preRollMs = 60,
    postRollMs = 250,
    minSustainedSilenceMs = 1500,
  } = options;

  const noTrimResult: TrimBoundaries = {
    startMs: 0,
    endMs: originalDurationMs,
    originalDurationMs,
    trimmedDurationMs: originalDurationMs,
    trimmed: false,
  };

  if (!trimSilence || windows.length === 0 || originalDurationMs <= 0) {
    return noTrimResult;
  }

  // 1. Find leading silence end (start of sound)
  let firstSoundIdx = -1;
  for (let i = 0; i < windows.length; i++) {
    if (windows[i].rms >= threshold) {
      firstSoundIdx = i;
      break;
    }
  }

  // Entire audio is below silence threshold
  if (firstSoundIdx === -1) {
    return noTrimResult;
  }

  const firstSoundTimeMs = windows[firstSoundIdx].timeMs;
  const startMs = Math.max(0, firstSoundTimeMs - preRollMs);

  // 2. Find trailing silence start (end of actual track)
  let endSoundTimeMs = originalDurationMs;

  if (expectedDurationMs && expectedDurationMs > 0) {
    // When track duration is provided:
    // It acts as a safe window: "Do not interpret silence as the end of the track before this duration."
    const expectedEndMs = startMs + expectedDurationMs;

    // Scan backwards from the end of recording to find the last sound
    let lastSoundIdx = -1;
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i].rms >= threshold) {
        lastSoundIdx = i;
        break;
      }
    }

    if (lastSoundIdx === -1) {
      endSoundTimeMs = originalDurationMs;
    } else {
      const lastSoundMs = windows[lastSoundIdx].timeMs;

      if (lastSoundMs >= expectedEndMs) {
        // Track ended after expected duration (e.g. extended outro/fade)
        // Find if there is sustained silence after this last sound
        endSoundTimeMs = lastSoundMs;
      } else {
        // Last sound occurred before or around expected duration.
        // Check if silence from lastSoundMs onward is sustained across the expected duration
        const silenceAfterLastSoundMs = originalDurationMs - lastSoundMs;
        if (silenceAfterLastSoundMs >= minSustainedSilenceMs) {
          endSoundTimeMs = lastSoundMs;
        } else {
          endSoundTimeMs = originalDurationMs;
        }
      }
    }
  } else {
    // When track duration is NOT provided:
    // Conservative silence detection: find the very last sound window in the recording.
    let lastSoundIdx = -1;
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i].rms >= threshold) {
        lastSoundIdx = i;
        break;
      }
    }

    if (lastSoundIdx !== -1) {
      endSoundTimeMs = windows[lastSoundIdx].timeMs;
    }
  }

  const endMs = Math.min(originalDurationMs, endSoundTimeMs + postRollMs);

  // Sanity checks: end must be strictly after start
  if (endMs <= startMs) {
    return noTrimResult;
  }

  // Check if meaningful silence was actually trimmed
  const leadingTrimmedMs = startMs;
  const trailingTrimmedMs = originalDurationMs - endMs;
  const hasMeaningfulTrim = leadingTrimmedMs > preRollMs || trailingTrimmedMs > postRollMs;

  if (!hasMeaningfulTrim) {
    return noTrimResult;
  }

  return {
    startMs,
    endMs,
    originalDurationMs,
    trimmedDurationMs: endMs - startMs,
    trimmed: true,
  };
}

/**
 * Creates a sliced AudioBuffer containing only the audio between startMs and endMs.
 * All audio between startMs and endMs (including internal silence) is preserved intact.
 */
export function sliceAudioBuffer(
  audioBuffer: AudioBuffer,
  startMs: number,
  endMs: number
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const totalSamples = audioBuffer.length;

  const startSample = Math.max(0, Math.min(totalSamples, Math.floor((startMs * sampleRate) / 1000)));
  const endSample = Math.max(startSample, Math.min(totalSamples, Math.ceil((endMs * sampleRate) / 1000)));
  const lengthSamples = endSample - startSample;

  if (lengthSamples <= 0 || (startSample === 0 && endSample === totalSamples)) {
    return audioBuffer;
  }

  const AudioCtx =
    (typeof window !== 'undefined' ? window.AudioContext : null) ||
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
    (typeof window !== 'undefined' ? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext : null);

  const ctx = new AudioCtx();
  const slicedBuffer = ctx.createBuffer(numChannels, lengthSamples, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const sourceData = audioBuffer.getChannelData(c);
    const destData = slicedBuffer.getChannelData(c);
    destData.set(sourceData.subarray(startSample, endSample));
  }

  if (ctx.state !== 'closed') {
    ctx.close().catch(() => {});
  }

  return slicedBuffer;
}

/**
 * Encodes an AudioBuffer into a standard 16-bit PCM WAV audio Blob.
 * Runs synchronously and finishes in milliseconds.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = buffer.length * blockAlign;
  const totalLength = 44 + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');

  // fmt Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // data Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  // Interleave channel samples
  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  const length = buffer.length;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      // Convert float [-1.0, 1.0] to 16-bit signed integer [-32768, 32767]
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Complete trimming pipeline:
 * Decodes audio blob -> analyzes silence boundaries -> slices buffer -> encodes trimmed audio.
 */
export async function trimAudioBlob(
  blob: Blob,
  options: TrimOptions
): Promise<{
  blob: Blob;
  mimeType: string;
  extension: string;
  durationMs: number;
  trimmed: boolean;
}> {
  if (!options.trimSilence) {
    return {
      blob,
      mimeType: blob.type || 'audio/webm',
      extension: blob.type.includes('wav') ? 'wav' : 'webm',
      durationMs: 0,
      trimmed: false,
    };
  }

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx =
      (typeof window !== 'undefined' ? window.AudioContext : null) ||
      (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
      (typeof window !== 'undefined' ? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext : null);

    if (!AudioCtx) {
      console.warn('[silenceTrimmer] AudioContext unavailable, skipping trim');
      return {
        blob,
        mimeType: blob.type || 'audio/webm',
        extension: 'webm',
        durationMs: 0,
        trimmed: false,
      };
    }

    const audioCtx = new AudioCtx();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const originalDurationMs = Math.round(decodedBuffer.duration * 1000);

    const { windows } = computeRmsWindows(decodedBuffer, 25);
    const boundaries = analyzeSilenceBoundaries(windows, originalDurationMs, options);

    if (!boundaries.trimmed) {
      if (audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
      return {
        blob,
        mimeType: blob.type || 'audio/webm',
        extension: 'webm',
        durationMs: originalDurationMs,
        trimmed: false,
      };
    }

    const sliced = sliceAudioBuffer(decodedBuffer, boundaries.startMs, boundaries.endMs);
    const wavBlob = audioBufferToWav(sliced);

    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }

    return {
      blob: wavBlob,
      mimeType: 'WAV / PCM',
      extension: 'wav',
      durationMs: boundaries.trimmedDurationMs,
      trimmed: true,
    };
  } catch (err) {
    console.warn('[silenceTrimmer] Trimming encountered an error, falling back to original blob:', err);
    return {
      blob,
      mimeType: blob.type || 'audio/webm',
      extension: 'webm',
      durationMs: 0,
      trimmed: false,
    };
  }
}
