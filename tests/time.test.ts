import { describe, it, expect } from 'vitest';
import { formatDuration, getElapsedMs } from '../src/utils/time.ts';

describe('Time and Duration Utilities', () => {
  describe('formatDuration', () => {
    it('should return 00:00 for zero, negative or invalid inputs', () => {
      expect(formatDuration(0)).toBe('00:00');
      expect(formatDuration(-5000)).toBe('00:00');
      expect(formatDuration(NaN)).toBe('00:00');
      expect(formatDuration(Infinity)).toBe('00:00');
    });

    it('should format seconds within a minute (MM:SS)', () => {
      expect(formatDuration(1000)).toBe('00:01');
      expect(formatDuration(9000)).toBe('00:09');
      expect(formatDuration(45000)).toBe('00:45');
    });

    it('should format minutes and seconds (MM:SS)', () => {
      expect(formatDuration(60000)).toBe('01:00');
      expect(formatDuration(84000)).toBe('01:24');
      expect(formatDuration(3599000)).toBe('59:59');
    });

    it('should format hours, minutes, and seconds (HH:MM:SS) for longer recordings', () => {
      expect(formatDuration(3600000)).toBe('01:00:00');
      expect(formatDuration(5565000)).toBe('01:32:45');
      expect(formatDuration(36000000)).toBe('10:00:00');
    });
  });

  describe('getElapsedMs', () => {
    it('should return 0 when startedAt is undefined', () => {
      expect(getElapsedMs(undefined)).toBe(0);
    });

    it('should compute non-negative elapsed time from a past timestamp', () => {
      const past = Date.now() - 3000;
      const elapsed = getElapsedMs(past);
      expect(elapsed).toBeGreaterThanOrEqual(2900);
      expect(elapsed).toBeLessThan(4000);
    });
  });
});
