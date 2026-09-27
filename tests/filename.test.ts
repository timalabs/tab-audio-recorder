import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  sanitizeTitle,
  generateRecordingFilename,
} from '../src/utils/filename.ts';

describe('Filename Sanitization and Generation', () => {
  describe('formatTimestamp', () => {
    it('should format date to YYYY-MM-DD-HH-mm-ss with 2-digit padding', () => {
      const fixedDate = new Date(2026, 8, 27, 21, 45, 12); // September is month index 8
      const formatted = formatTimestamp(fixedDate);
      expect(formatted).toBe('2026-09-27-21-45-12');
    });

    it('should pad single digits with leading zeros', () => {
      const date = new Date(2026, 0, 5, 4, 3, 9); // Jan 5, 04:03:09
      expect(formatTimestamp(date)).toBe('2026-01-05-04-03-09');
    });
  });

  describe('sanitizeTitle', () => {
    it('should return empty string for null, undefined, or empty inputs', () => {
      expect(sanitizeTitle(undefined)).toBe('');
      expect(sanitizeTitle('')).toBe('');
    });

    it('should remove illegal filesystem characters', () => {
      const raw = 'My: <Cool> / Track "Name" \\ With | Wildcards? *';
      const sanitized = sanitizeTitle(raw);
      expect(sanitized).toBe('My-Cool-Track-Name-With-Wildcards');
      expect(sanitized).not.toMatch(/[<>:"/\\|?*]/);
    });

    it('should convert spaces and underscores to dashes and collapse duplicates', () => {
      const raw = '  Multiple   Spaces ___ and --- dashes  ';
      expect(sanitizeTitle(raw)).toBe('Multiple-Spaces-and-dashes');
    });

    it('should strip leading and trailing punctuation and dots', () => {
      const raw = '...---Hello World---...';
      expect(sanitizeTitle(raw)).toBe('Hello-World');
    });

    it('should enforce maxLength without leaving a trailing dash', () => {
      const longTitle = 'A'.repeat(80);
      const sanitized = sanitizeTitle(longTitle, 20);
      expect(sanitized.length).toBe(20);
      expect(sanitized.endsWith('-')).toBe(false);
    });
  });

  describe('generateRecordingFilename', () => {
    const fixedDate = new Date(2026, 8, 27, 21, 45, 12);

    it('should generate title-based filename when title is present', () => {
      const filename = generateRecordingFilename('My Music Generator', 'webm', fixedDate);
      expect(filename).toBe('My-Music-Generator-2026-09-27-21-45-12.webm');
    });

    it('should generate fallback filename when title is empty or undefined', () => {
      const filename = generateRecordingFilename('', 'webm', fixedDate);
      expect(filename).toBe('tab-recording-2026-09-27-21-45-12.webm');
    });

    it('should handle extension with leading dot gracefully', () => {
      const filename = generateRecordingFilename('Podcast', '.ogg', fixedDate);
      expect(filename).toBe('Podcast-2026-09-27-21-45-12.ogg');
    });
  });
});
