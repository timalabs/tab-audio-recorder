import { describe, it, expect } from 'vitest';
import {
  analyzeSilenceBoundaries,
  AudioWindow,
  audioBufferToWav,
  sliceAudioBuffer,
} from '../src/audio/silenceTrimmer.ts';

// Helper to construct simulated audio windows for precise algorithmic testing
function buildWindows(
  segments: { durationMs: number; rms: number }[],
  windowMs: number = 25
): { windows: AudioWindow[]; totalDurationMs: number } {
  const windows: AudioWindow[] = [];
  let currentTimeMs = 0;

  for (const seg of segments) {
    const windowCount = Math.round(seg.durationMs / windowMs);
    for (let i = 0; i < windowCount; i++) {
      windows.push({
        timeMs: currentTimeMs,
        rms: seg.rms,
      });
      currentTimeMs += windowMs;
    }
  }

  return { windows, totalDurationMs: currentTimeMs };
}

describe('Smart Silence Trimming Engine', () => {
  // Case 1: Trim silence ON, no duration
  it('1. should trim leading and trailing silence when Trim silence is ON and no duration is set', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 4000, rms: 0.001 }, // 4s leading silence
      { durationMs: 30000, rms: 0.25 }, // 30s music
      { durationMs: 5000, rms: 0.001 }, // 5s trailing silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      threshold: 0.005,
    });

    expect(result.trimmed).toBe(true);
    // startMs should be close to 4000 (minus preRoll 60ms)
    expect(result.startMs).toBeGreaterThanOrEqual(3900);
    expect(result.startMs).toBeLessThanOrEqual(4000);
    // endMs should be close to 34000 (plus postRoll 250ms)
    expect(result.endMs).toBeGreaterThanOrEqual(34000);
    expect(result.endMs).toBeLessThanOrEqual(34500);
    expect(result.trimmedDurationMs).toBeLessThan(totalDurationMs);
  });

  // Case 2: Trim silence OFF
  it('2. should not perform any trimming when Trim silence is OFF', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 5000, rms: 0.0005 },
      { durationMs: 60000, rms: 0.3 },
      { durationMs: 5000, rms: 0.0005 },
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: false,
    });

    expect(result.trimmed).toBe(false);
    expect(result.startMs).toBe(0);
    expect(result.endMs).toBe(totalDurationMs);
    expect(result.trimmedDurationMs).toBe(totalDurationMs);
  });

  // Case 3: Trim silence ON, duration = 03:00 (180,000ms)
  it('3. should trim leading and trailing silence when expected duration is provided', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 3000, rms: 0.001 }, // 3s leading silence
      { durationMs: 180000, rms: 0.2 }, // 3 min music
      { durationMs: 6000, rms: 0.001 }, // 6s trailing silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 180000,
    });

    expect(result.trimmed).toBe(true);
    expect(result.startMs).toBeGreaterThanOrEqual(2900);
    expect(result.startMs).toBeLessThanOrEqual(3000);
    expect(result.endMs).toBeGreaterThanOrEqual(183000);
    expect(result.endMs).toBeLessThanOrEqual(183500);
  });

  // Case 4: Internal silence before expected duration (NEVER REMOVE INTERNAL SILENCE)
  it('4. must NEVER remove internal silence before or inside expected duration', () => {
    // Exactly matches prompt scenario:
    // 00:00 - 00:05: silence
    // 00:05 - 01:20: music (75s)
    // 01:20 - 01:25: intentional silence (5s)
    // 01:25 - 03:00: music continues (95s)
    // 03:00 - 03:05: trailing silence (5s)
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 5000, rms: 0.0008 }, // 00:00 - 00:05 leading silence
      { durationMs: 75000, rms: 0.25 }, // 00:05 - 01:20 music
      { durationMs: 5000, rms: 0.0008 }, // 01:20 - 01:25 internal silence!
      { durationMs: 95000, rms: 0.25 }, // 01:25 - 03:00 music continues
      { durationMs: 5000, rms: 0.0008 }, // 03:00 - 03:05 trailing silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 180000, // 03:00
    });

    expect(result.trimmed).toBe(true);
    // startMs around 5000 (leading silence removed)
    expect(result.startMs).toBeGreaterThanOrEqual(4900);
    expect(result.startMs).toBeLessThanOrEqual(5000);

    // endMs around 180000 (trailing silence removed)
    expect(result.endMs).toBeGreaterThanOrEqual(179900);
    expect(result.endMs).toBeLessThanOrEqual(180500);

    // CRITICAL: The internal silence at 80,000ms - 85,000ms is strictly within [startMs, endMs]!
    expect(result.startMs).toBeLessThan(80000);
    expect(result.endMs).toBeGreaterThan(85000);
  });

  // Case 5: Track ending after expected duration (extended outro/solo)
  it('5. should preserve audio when track continues playing past expected duration', () => {
    // User expects 03:00 (180,000ms), but track plays for 03:20 (200,000ms)
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 2000, rms: 0.001 }, // 2s leading silence
      { durationMs: 200000, rms: 0.2 }, // 3m 20s music (longer than expected 3m)
      { durationMs: 8000, rms: 0.001 }, // 8s trailing silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 180000, // 03:00
    });

    expect(result.trimmed).toBe(true);
    // Must NOT cut at 180,000! Must extend to the actual end of music at ~202,000ms
    expect(result.endMs).toBeGreaterThanOrEqual(202000);
    expect(result.endMs).toBeLessThan(totalDurationMs);
  });

  // Case 6: Track ending before expected duration
  it('6. should detect track ending when track finishes slightly earlier than expected duration', () => {
    // User expects 03:00 (180,000ms), but song finishes at 02:45 (165,000ms), followed by silence
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 3000, rms: 0.001 }, // 3s leading silence
      { durationMs: 165000, rms: 0.2 }, // 2m 45s music
      { durationMs: 25000, rms: 0.001 }, // 25s sustained trailing silence across 3:00 mark
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 180000, // 03:00
    });

    expect(result.trimmed).toBe(true);
    // End should detect music ended around 168,000ms (plus postRoll)
    expect(result.endMs).toBeGreaterThanOrEqual(168000);
    expect(result.endMs).toBeLessThanOrEqual(169000);
  });

  // Case 7: Very short track, e.g. 00:45 (45,000ms)
  it('7. should accurately trim very short recordings (e.g. 00:45)', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 2500, rms: 0.001 },
      { durationMs: 45000, rms: 0.35 },
      { durationMs: 4000, rms: 0.001 },
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 45000,
    });

    expect(result.trimmed).toBe(true);
    expect(result.startMs).toBeGreaterThanOrEqual(2400);
    expect(result.endMs).toBeGreaterThanOrEqual(47400);
    expect(result.trimmedDurationMs).toBeGreaterThanOrEqual(45000);
    expect(result.trimmedDurationMs).toBeLessThanOrEqual(46000);
  });

  // Case 8: Long track, e.g. 10:00 (600,000ms)
  it('8. should accurately handle long tracks (e.g. 10:00)', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 6000, rms: 0.001 },
      { durationMs: 600000, rms: 0.2 },
      { durationMs: 10000, rms: 0.001 },
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      expectedDurationMs: 600000,
    });

    expect(result.trimmed).toBe(true);
    expect(result.startMs).toBeGreaterThanOrEqual(5900);
    expect(result.endMs).toBeGreaterThanOrEqual(606000);
  });

  // Case 9: Track with fade-in
  it('9. should preserve soft fade-in intro without clipping attack', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 3000, rms: 0.0005 }, // silence
      { durationMs: 200, rms: 0.004 }, // very quiet start of fade-in
      { durationMs: 500, rms: 0.008 }, // sound rising
      { durationMs: 20000, rms: 0.25 }, // main body
      { durationMs: 3000, rms: 0.0005 }, // silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      threshold: 0.005,
      preRollMs: 60,
    });

    expect(result.trimmed).toBe(true);
    // Because of preRoll, startMs safely precedes the threshold crossing
    expect(result.startMs).toBeLessThanOrEqual(3200);
  });

  // Case 10: Track with fade-out
  it('10. should preserve reverb tail and soft fade-out without abrupt cutoff', () => {
    const { windows, totalDurationMs } = buildWindows([
      { durationMs: 2000, rms: 0.0005 },
      { durationMs: 20000, rms: 0.25 },
      { durationMs: 1000, rms: 0.015 }, // fade out begins
      { durationMs: 1000, rms: 0.006 }, // trailing reverb tail
      { durationMs: 4000, rms: 0.0005 }, // absolute silence
    ]);

    const result = analyzeSilenceBoundaries(windows, totalDurationMs, {
      trimSilence: true,
      threshold: 0.005,
      postRollMs: 250,
    });

    expect(result.trimmed).toBe(true);
    // Post-roll ensures the reverb tail at 24000ms is preserved
    expect(result.endMs).toBeGreaterThanOrEqual(24200);
    expect(result.endMs).toBeLessThan(totalDurationMs);
  });
});

describe('AudioBuffer Slicing and WAV Encoding', () => {
  it('should encode a valid WAV file from an AudioBuffer', () => {
    const sampleRate = 44100;
    const length = 44100; // 1 second
    const channelData = new Float32Array(length);
    // Sine wave
    for (let i = 0; i < length; i++) {
      channelData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const mockBuffer = {
      sampleRate,
      numberOfChannels: 1,
      length,
      duration: 1.0,
      getChannelData: () => channelData,
    } as unknown as AudioBuffer;

    const wavBlob = audioBufferToWav(mockBuffer);
    expect(wavBlob).toBeDefined();
    expect(wavBlob.type).toBe('audio/wav');
    // 44-byte header + 44100 * 2 bytes = 88244 bytes
    expect(wavBlob.size).toBe(88244);
  });

  it('should cleanly slice AudioBuffer channels', () => {
    const sampleRate = 1000;
    const totalSamples = 5000; // 5 seconds
    const channel0 = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) channel0[i] = i / totalSamples;

    const mockBuffer = {
      sampleRate,
      numberOfChannels: 1,
      length: totalSamples,
      duration: 5.0,
      getChannelData: () => channel0,
    } as unknown as AudioBuffer;

    // Slice 1000ms to 3000ms (samples 1000 to 3000, length 2000)
    // Mock AudioContext for Node test environment
    const mockCreatedBuffer = {
      length: 2000,
      numberOfChannels: 1,
      sampleRate: 1000,
      getChannelData: () => new Float32Array(2000),
    };
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
      createBuffer() {
        return mockCreatedBuffer;
      }
      close() {
        return Promise.resolve();
      }
    };

    const sliced = sliceAudioBuffer(mockBuffer, 1000, 3000);
    expect(sliced.length).toBe(2000);
  });
});
