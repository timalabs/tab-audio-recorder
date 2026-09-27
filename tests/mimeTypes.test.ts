import { describe, it, expect } from 'vitest';
import { getSupportedMimeType, CANDIDATE_MIME_TYPES } from '../src/audio/mimeTypes.ts';

describe('MIME Type Detection', () => {
  it('should prioritize audio/webm;codecs=opus when supported', () => {
    const mockCheck = (type: string) => type === 'audio/webm;codecs=opus';
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/webm;codecs=opus');
    expect(result.extension).toBe('webm');
    expect(result.label).toBe('WebM / Opus');
  });

  it('should fall back to audio/webm when opus codec parameter is unsupported', () => {
    const mockCheck = (type: string) => type === 'audio/webm';
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/webm');
    expect(result.extension).toBe('webm');
    expect(result.label).toBe('WebM');
  });

  it('should select audio/ogg;codecs=opus when webm is unsupported', () => {
    const mockCheck = (type: string) => type.startsWith('audio/ogg');
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/ogg;codecs=opus');
    expect(result.extension).toBe('ogg');
  });

  it('should select audio/mp4 if only MP4 is supported', () => {
    const mockCheck = (type: string) => type === 'audio/mp4';
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/mp4');
    expect(result.extension).toBe('mp4');
  });

  it('should gracefully return default WebM when none are supported', () => {
    const mockCheck = () => false;
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/webm');
    expect(result.extension).toBe('webm');
  });

  it('should handle isTypeSupported throwing exceptions without crashing', () => {
    const mockCheck = () => {
      throw new Error('Internal security policy restriction');
    };
    const result = getSupportedMimeType(mockCheck);

    expect(result.mimeType).toBe('audio/webm');
  });

  it('should have valid candidate MIME list', () => {
    expect(CANDIDATE_MIME_TYPES.length).toBeGreaterThan(2);
    CANDIDATE_MIME_TYPES.forEach((item) => {
      expect(item.mimeType).toBeDefined();
      expect(item.extension).toBeDefined();
      expect(item.label).toBeDefined();
    });
  });
});
