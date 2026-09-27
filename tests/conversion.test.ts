import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_FORMAT,
  getFormatInfo,
  SUPPORTED_FORMATS,
} from '../src/audio/conversion/formats.ts';
import { encodeAudioBufferToMp3 } from '../src/audio/conversion/mp3Encoder.ts';
import { convertAudio } from '../src/audio/conversion/AudioConverter.ts';

// Helper to construct a synthetic AudioBuffer for testing
function createMockAudioBuffer(channels: number = 2, length: number = 44100, sampleRate: number = 44100): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(length);
    // Fill with 440Hz sine wave tone
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    channelData.push(data);
  }

  return {
    sampleRate,
    numberOfChannels: channels,
    length,
    duration: length / sampleRate,
    getChannelData: (c: number) => channelData[c] || channelData[0],
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe('Audio Formats Configuration', () => {
  it('should support MP3, WAV, FLAC, OGG, and WebM', () => {
    const ids = SUPPORTED_FORMATS.map((f) => f.id);
    expect(ids).toContain('mp3');
    expect(ids).toContain('wav');
    expect(ids).toContain('flac');
    expect(ids).toContain('ogg');
    expect(ids).toContain('webm');
  });

  it('should have MP3 as default format', () => {
    expect(DEFAULT_FORMAT).toBe('mp3');
  });

  it('should return correct format metadata via getFormatInfo', () => {
    const mp3 = getFormatInfo('mp3');
    expect(mp3.id).toBe('mp3');
    expect(mp3.mimeType).toBe('audio/mpeg');
    expect(mp3.extension).toBe('mp3');

    const wav = getFormatInfo('wav');
    expect(wav.mimeType).toBe('audio/wav');
    expect(wav.extension).toBe('wav');

    const flac = getFormatInfo('flac');
    expect(flac.mimeType).toBe('audio/flac');

    const ogg = getFormatInfo('ogg');
    expect(ogg.mimeType).toBe('audio/ogg');

    const webm = getFormatInfo('webm');
    expect(webm.mimeType).toBe('audio/webm');
    expect(webm.isNativeRecording).toBe(true);
  });
});

describe('MP3 Encoder (LAME)', () => {
  it('should encode synthetic AudioBuffer to MP3 Blob at 192kbps', async () => {
    const mockBuffer = createMockAudioBuffer(2, 22050, 44100); // 0.5s of stereo audio
    const progressValues: number[] = [];

    const mp3Blob = await encodeAudioBufferToMp3(mockBuffer, {
      bitrateKbps: 192,
      onProgress: (p) => progressValues.push(p),
    });

    expect(mp3Blob).toBeDefined();
    expect(mp3Blob.type).toBe('audio/mpeg');
    expect(mp3Blob.size).toBeGreaterThan(0);
    // Should have reported progress up to 100%
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it('should abort encoding if isAborted returns true', async () => {
    const mockBuffer = createMockAudioBuffer(2, 44100 * 3, 44100); // 3 seconds
    let callCount = 0;

    await expect(
      encodeAudioBufferToMp3(mockBuffer, {
        isAborted: () => {
          callCount++;
          return callCount > 2; // abort after 2 blocks
        },
      })
    ).rejects.toThrow('Conversion cancelled by user');
  });
});

describe('AudioConverter Pipeline', () => {
  const sampleAudioBuffer = createMockAudioBuffer(2, 44100, 44100);

  beforeEach(() => {
    // Mock AudioContext for Node.js / Vitest test runner
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
      state = 'running';
      decodeAudioData = vi.fn().mockImplementation(async (arrayBuffer: ArrayBuffer) => {
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          throw new Error('Invalid audio data');
        }
        return sampleAudioBuffer;
      });
      createBuffer = vi.fn().mockImplementation((channels, length, rate) =>
        createMockAudioBuffer(channels, length, rate)
      );
      close = vi.fn().mockResolvedValue(undefined);
    };
  });

  it('should handle WebM -> WebM as direct pass-through', async () => {
    const fakeWebmBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
    const progress: number[] = [];

    const result = await convertAudio(fakeWebmBlob, {
      targetFormat: 'webm',
      onProgress: (p) => progress.push(p),
    });

    expect(result.format).toBe('webm');
    expect(result.extension).toBe('webm');
    expect(result.mimeType).toBe('audio/webm');
    expect(result.sizeBytes).toBe(fakeWebmBlob.size);
    expect(progress).toContain(100);
  });

  it('should convert WebM -> WAV with 16-bit PCM RIFF structure', async () => {
    const fakeWebmBlob = new Blob([new Uint8Array([10, 20, 30, 40])], { type: 'audio/webm' });
    const progress: number[] = [];

    const result = await convertAudio(fakeWebmBlob, {
      targetFormat: 'wav',
      onProgress: (p) => progress.push(p),
    });

    expect(result.format).toBe('wav');
    expect(result.extension).toBe('wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(result.sizeBytes).toBeGreaterThan(44); // 44-byte WAV header + PCM data

    // Verify WAV RIFF header
    const buffer = await result.blob.arrayBuffer();
    const view = new DataView(buffer);
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    expect(riff).toBe('RIFF');
    expect(wave).toBe('WAVE');
  });

  it('should convert WebM -> MP3 with progress reporting', async () => {
    const fakeWebmBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/webm' });
    const progress: number[] = [];

    const result = await convertAudio(fakeWebmBlob, {
      targetFormat: 'mp3',
      bitrateKbps: 192,
      onProgress: (p) => progress.push(p),
    });

    expect(result.format).toBe('mp3');
    expect(result.extension).toBe('mp3');
    expect(result.mimeType).toBe('audio/mpeg');
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it('should reject when conversion is aborted by user', async () => {
    const fakeWebmBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });

    await expect(
      convertAudio(fakeWebmBlob, {
        targetFormat: 'mp3',
        isAborted: () => true,
      })
    ).rejects.toThrow('Conversion cancelled by user');
  });

  it('should reject empty or zero-byte audio data cleanly without crashing', async () => {
    const emptyBlob = new Blob([], { type: 'audio/webm' });

    await expect(
      convertAudio(emptyBlob, {
        targetFormat: 'wav',
      })
    ).rejects.toThrow('Cannot convert empty or invalid audio data');
  });

  it('should handle decoding errors gracefully when audio data is corrupted', async () => {
    // Mock decodeAudioData to reject with a decoding error
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
      state = 'running';
      decodeAudioData = vi.fn().mockRejectedValue(new Error('Corrupt bitstream: unable to decode'));
      close = vi.fn().mockResolvedValue(undefined);
    };

    const corruptBlob = new Blob([new Uint8Array([255, 255, 255])], { type: 'audio/webm' });

    await expect(
      convertAudio(corruptBlob, {
        targetFormat: 'wav',
      })
    ).rejects.toThrow(/Audio decoding failed/);
  });
});
