import { describe, it, expect } from 'vitest';
import { isRestrictedUrl, getFriendlyErrorMessage } from '../src/utils/errors.ts';

describe('Error Handling and Restricted URLs', () => {
  describe('isRestrictedUrl', () => {
    it('should identify internal chrome pages as restricted', () => {
      expect(isRestrictedUrl('chrome://settings')).toBe(true);
      expect(isRestrictedUrl('chrome://extensions')).toBe(true);
      expect(isRestrictedUrl('chrome-extension://abcdefg/popup.html')).toBe(true);
    });

    it('should identify firefox and browser internal pages as restricted', () => {
      expect(isRestrictedUrl('about:debugging')).toBe(true);
      expect(isRestrictedUrl('about:config')).toBe(true);
      expect(isRestrictedUrl('moz-extension://abcdefg/popup.html')).toBe(true);
      expect(isRestrictedUrl('edge://settings')).toBe(true);
      expect(isRestrictedUrl('view-source:https://example.com')).toBe(true);
    });

    it('should allow standard web URLs and localhost', () => {
      expect(isRestrictedUrl('https://youtube.com/watch?v=123')).toBe(false);
      expect(isRestrictedUrl('https://suno.com')).toBe(false);
      expect(isRestrictedUrl('https://soundcloud.com')).toBe(false);
      expect(isRestrictedUrl('http://localhost:3000')).toBe(false);
    });

    it('should consider empty or undefined URLs restricted', () => {
      expect(isRestrictedUrl('')).toBe(true);
      expect(isRestrictedUrl(undefined)).toBe(true);
    });
  });

  describe('getFriendlyErrorMessage', () => {
    it('should provide clear guidance when URL is restricted', () => {
      const msg = getFriendlyErrorMessage(new Error('Unknown failure'), 'chrome://extensions');
      expect(msg).toContain('This page cannot be recorded');
    });

    it('should translate permission denied errors gracefully', () => {
      const error = new Error('Permission denied by system');
      error.name = 'NotAllowedError';
      const msg = getFriendlyErrorMessage(error);
      expect(msg).toContain('Audio capture permission was denied');
    });

    it('should translate missing audio tracks gracefully', () => {
      const error = new Error('No audio track available in requested stream');
      const msg = getFriendlyErrorMessage(error);
      expect(msg).toContain('No active audio track detected on this tab');
      expect(msg).toContain('Start playing audio on this tab and try again');
    });

    it('should translate tab closed errors gracefully', () => {
      const error = new Error('The tab was closed before capture finished');
      const msg = getFriendlyErrorMessage(error);
      expect(msg).toContain('target browser tab was closed');
    });

    it('should truncate excessively long error messages', () => {
      const longMsg = 'X'.repeat(300);
      const msg = getFriendlyErrorMessage(new Error(longMsg));
      expect(msg.length).toBeLessThanOrEqual(140);
      expect(msg.endsWith('...')).toBe(true);
    });
  });
});
