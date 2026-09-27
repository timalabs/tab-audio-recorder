export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm';

export interface FormatInfo {
  id: AudioFormat;
  label: string;
  extension: string;
  mimeType: string;
  description: string;
  isNativeRecording?: boolean;
}

export const SUPPORTED_FORMATS: FormatInfo[] = [
  {
    id: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    description: 'High compatibility, 192 kbps stereo',
  },
  {
    id: 'wav',
    label: 'WAV',
    extension: 'wav',
    mimeType: 'audio/wav',
    description: 'Lossless uncompressed 16-bit PCM',
  },
  {
    id: 'flac',
    label: 'FLAC',
    extension: 'flac',
    mimeType: 'audio/flac',
    description: 'Lossless compressed audio',
  },
  {
    id: 'ogg',
    label: 'OGG',
    extension: 'ogg',
    mimeType: 'audio/ogg',
    description: 'Ogg / Opus open audio container',
  },
  {
    id: 'webm',
    label: 'WebM',
    extension: 'webm',
    mimeType: 'audio/webm',
    description: 'Native browser recording format',
    isNativeRecording: true,
  },
];

export const DEFAULT_FORMAT: AudioFormat = 'mp3';

export function getFormatInfo(format: AudioFormat): FormatInfo {
  const found = SUPPORTED_FORMATS.find((f) => f.id === format);
  return (
    found || {
      id: format,
      label: format.toUpperCase(),
      extension: format,
      mimeType: `audio/${format}`,
      description: 'Audio format',
    }
  );
}
