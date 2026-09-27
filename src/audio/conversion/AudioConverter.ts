import { audioBufferToWav } from '../silenceTrimmer.ts';
import { AudioFormat } from './formats.ts';
import { encodeAudioBufferToMp3 } from './mp3Encoder.ts';

export interface ConversionOptions {
  targetFormat: AudioFormat;
  bitrateKbps?: number; // default: 192 kbps for MP3
  onProgress?: (percent: number) => void;
  isAborted?: () => boolean;
}

export interface ConvertedAudio {
  blob: Blob;
  mimeType: string;
  extension: string;
  format: AudioFormat;
  sizeBytes: number;
}

/**
 * Decodes an audio Blob (WebM, WAV, etc.) into an AudioBuffer using the Web Audio API.
 */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  if (!blob || blob.size === 0) {
    throw new Error('Cannot decode empty or invalid audio data');
  }

  const AudioCtx =
    (typeof window !== 'undefined' ? window.AudioContext : null) ||
    (globalThis as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
    (typeof window !== 'undefined'
      ? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      : null);

  if (!AudioCtx) {
    throw new Error('AudioContext is unavailable in this environment');
  }

  const audioCtx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return decodedBuffer;
  } catch (err) {
    throw new Error(
      `Audio decoding failed: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}

/**
 * Encodes audio using FFmpeg WASM for FLAC and OGG formats.
 * Lazy-loads @ffmpeg/ffmpeg only when invoked.
 */
async function convertWithFFmpeg(
  audioBuffer: AudioBuffer,
  targetFormat: 'flac' | 'ogg',
  options: ConversionOptions
): Promise<ConvertedAudio> {
  const { onProgress, isAborted } = options;

  try {
    onProgress?.(30);
    // Dynamic import to keep bundle and extension boot fast
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      const mapped = Math.min(98, Math.round(35 + progress * 60));
      onProgress?.(mapped);
    });

    await ffmpeg.load();

    if (isAborted && isAborted()) {
      throw new Error('Conversion cancelled by user');
    }

    onProgress?.(50);
    // Generate lossless WAV as input to FFmpeg
    const wavBlob = audioBufferToWav(audioBuffer);
    const wavData = await fetchFile(wavBlob);

    await ffmpeg.writeFile('input.wav', wavData);

    const outFilename = targetFormat === 'flac' ? 'output.flac' : 'output.ogg';
    const ffmpegArgs =
      targetFormat === 'flac'
        ? ['-i', 'input.wav', '-c:a', 'flac', outFilename]
        : ['-i', 'input.wav', '-c:a', 'libopus', outFilename];

    await ffmpeg.exec(ffmpegArgs);

    if (isAborted && isAborted()) {
      throw new Error('Conversion cancelled by user');
    }

    const data = await ffmpeg.readFile(outFilename);
    const mimeType = targetFormat === 'flac' ? 'audio/flac' : 'audio/ogg';
    const outputBlob = new Blob([data as unknown as BlobPart], { type: mimeType });

    onProgress?.(100);

    return {
      blob: outputBlob,
      mimeType,
      extension: targetFormat,
      format: targetFormat,
      sizeBytes: outputBlob.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('cancelled')) {
      throw err;
    }
    throw new Error(
      `Encoding to ${targetFormat.toUpperCase()} failed: ${msg}. Please select MP3 or WAV for zero-dependency encoding.`
    );
  }
}

/**
 * Universal client-side audio converter.
 * Converts an audio Blob to the desired AudioFormat (MP3, WAV, FLAC, OGG, WebM).
 * Non-blocking: yields to browser event loop during processing and reports progress.
 */
export async function convertAudio(
  sourceBlob: Blob,
  options: ConversionOptions
): Promise<ConvertedAudio> {
  const { targetFormat, bitrateKbps = 192, onProgress, isAborted } = options;

  if (!sourceBlob || sourceBlob.size === 0) {
    throw new Error('Cannot convert empty or invalid audio data');
  }

  if (isAborted && isAborted()) {
    throw new Error('Conversion cancelled by user');
  }

  // 1. WebM: Native pass-through
  if (targetFormat === 'webm') {
    onProgress?.(50);
    if (isAborted && isAborted()) throw new Error('Conversion cancelled by user');
    onProgress?.(100);
    return {
      blob: sourceBlob,
      mimeType: sourceBlob.type || 'audio/webm',
      extension: 'webm',
      format: 'webm',
      sizeBytes: sourceBlob.size,
    };
  }

  // 2. Decode source audio to AudioBuffer PCM
  onProgress?.(10);
  const audioBuffer = await decodeAudioBlob(sourceBlob);

  if (isAborted && isAborted()) {
    throw new Error('Conversion cancelled by user');
  }
  onProgress?.(25);

  // 3. WAV: Lossless uncompressed 16-bit PCM (instant)
  if (targetFormat === 'wav') {
    const wavBlob = audioBufferToWav(audioBuffer);
    onProgress?.(100);
    return {
      blob: wavBlob,
      mimeType: 'audio/wav',
      extension: 'wav',
      format: 'wav',
      sizeBytes: wavBlob.size,
    };
  }

  // 4. MP3: 192 kbps LAME encoder (non-blocking chunk-based)
  if (targetFormat === 'mp3') {
    const mp3Blob = await encodeAudioBufferToMp3(audioBuffer, {
      bitrateKbps,
      onProgress: (p) => {
        // Map 0-100% of LAME encoder to 25-100% overall progress
        const overall = Math.min(100, Math.round(25 + p * 0.75));
        onProgress?.(overall);
      },
      isAborted,
    });

    return {
      blob: mp3Blob,
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      format: 'mp3',
      sizeBytes: mp3Blob.size,
    };
  }

  // 5. FLAC or OGG: Lazy-load FFmpeg WASM
  if (targetFormat === 'flac' || targetFormat === 'ogg') {
    return await convertWithFFmpeg(audioBuffer, targetFormat, options);
  }

  throw new Error(`Unsupported audio format: ${targetFormat}`);
}
