import * as lame from '@breezystack/lamejs';

export interface Mp3EncodeOptions {
  bitrateKbps?: number; // default: 192 kbps
  onProgress?: (percent: number) => void;
  isAborted?: () => boolean;
}

/**
 * Converts a Web Audio AudioBuffer into an MP3 Blob asynchronously without blocking the UI thread.
 */
export async function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  options: Mp3EncodeOptions = {}
): Promise<Blob> {
  const { bitrateKbps = 192, onProgress, isAborted } = options;

  const numChannels = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = audioBuffer.length;

  // Resolve Mp3Encoder class from CommonJS/ESM interop
  const EncoderClass =
    (lame as unknown as { Mp3Encoder: typeof lame.Mp3Encoder }).Mp3Encoder ||
    (lame as unknown as { default?: { Mp3Encoder: typeof lame.Mp3Encoder } }).default?.Mp3Encoder;

  if (!EncoderClass) {
    throw new Error('LAME MP3 encoder could not be initialized');
  }

  const encoder = new EncoderClass(numChannels, sampleRate, bitrateKbps);
  const mp3DataChunks: Uint8Array[] = [];

  // Extract PCM Float32 data
  const leftFloat = audioBuffer.getChannelData(0);
  const rightFloat = numChannels > 1 ? audioBuffer.getChannelData(1) : leftFloat;

  // Process in blocks of 11520 samples (10 MP3 frames, ~250ms of audio)
  const BLOCK_SIZE = 11520;
  const leftInt16 = new Int16Array(BLOCK_SIZE);
  const rightInt16 = numChannels > 1 ? new Int16Array(BLOCK_SIZE) : leftInt16;

  let processedSamples = 0;

  while (processedSamples < totalSamples) {
    if (isAborted && isAborted()) {
      throw new Error('Conversion cancelled by user');
    }

    const currentBlockCount = Math.min(BLOCK_SIZE, totalSamples - processedSamples);

    for (let i = 0; i < currentBlockCount; i++) {
      const idx = processedSamples + i;
      // Convert float [-1.0, 1.0] to 16-bit integer [-32768, 32767]
      const l = Math.max(-1, Math.min(1, leftFloat[idx]));
      leftInt16[i] = l < 0 ? l * 0x8000 : l * 0x7fff;

      if (numChannels > 1) {
        const r = Math.max(-1, Math.min(1, rightFloat[idx]));
        rightInt16[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
      }
    }

    // Pass sub-arrays if the block is smaller than BLOCK_SIZE at the tail
    const leftChunk = currentBlockCount === BLOCK_SIZE ? leftInt16 : leftInt16.subarray(0, currentBlockCount);
    const rightChunk =
      numChannels > 1
        ? currentBlockCount === BLOCK_SIZE
          ? rightInt16
          : rightInt16.subarray(0, currentBlockCount)
        : leftChunk;

    const mp3buf = numChannels === 1 ? encoder.encodeBuffer(leftChunk) : encoder.encodeBuffer(leftChunk, rightChunk);

    if (mp3buf && mp3buf.length > 0) {
      mp3DataChunks.push(new Uint8Array(mp3buf));
    }

    processedSamples += currentBlockCount;

    if (onProgress) {
      const percent = Math.min(98, Math.round((processedSamples / totalSamples) * 100));
      onProgress(percent);
    }

    // Yield to the event loop so the UI updates and doesn't freeze
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // Flush remaining buffer
  const finalChunk = encoder.flush();
  if (finalChunk && finalChunk.length > 0) {
    mp3DataChunks.push(new Uint8Array(finalChunk));
  }

  if (onProgress) {
    onProgress(100);
  }

  return new Blob(mp3DataChunks as unknown as BlobPart[], { type: 'audio/mpeg' });
}
