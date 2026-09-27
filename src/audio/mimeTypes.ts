export interface MimeTypeOption {
  mimeType: string;
  extension: string;
  label: string;
}

export const CANDIDATE_MIME_TYPES: MimeTypeOption[] = [
  {
    mimeType: 'audio/webm;codecs=opus',
    extension: 'webm',
    label: 'WebM / Opus',
  },
  {
    mimeType: 'audio/webm',
    extension: 'webm',
    label: 'WebM',
  },
  {
    mimeType: 'audio/ogg;codecs=opus',
    extension: 'ogg',
    label: 'OGG / Opus',
  },
  {
    mimeType: 'audio/ogg',
    extension: 'ogg',
    label: 'OGG',
  },
  {
    mimeType: 'audio/mp4',
    extension: 'mp4',
    label: 'MP4 Audio',
  },
];

/**
 * Dynamically detects the best supported audio MIME type in the current environment.
 */
export function getSupportedMimeType(
  isTypeSupportedFn?: (type: string) => boolean
): MimeTypeOption {
  const checkFn =
    isTypeSupportedFn ||
    (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
      ? (type: string) => MediaRecorder.isTypeSupported(type)
      : () => false);

  for (const candidate of CANDIDATE_MIME_TYPES) {
    try {
      if (checkFn(candidate.mimeType)) {
        return candidate;
      }
    } catch {
      // Ignore exceptions from environments where isTypeSupported throws
    }
  }

  // Safe fallback if isTypeSupported returned false for all or wasn't available
  return {
    mimeType: 'audio/webm',
    extension: 'webm',
    label: 'WebM (Default)',
  };
}
