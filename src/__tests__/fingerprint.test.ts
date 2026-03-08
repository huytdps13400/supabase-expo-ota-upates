import * as path from 'path';
import {
  generateFingerprint,
  isFingerprintAvailable,
} from '../utils/fingerprint';

describe('fingerprint', () => {
  describe('isFingerprintAvailable', () => {
    it('should return a boolean', () => {
      const result = isFingerprintAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('generateFingerprint', () => {
    it('should generate fingerprint from project root', async () => {
      const projectRoot = path.resolve(__dirname, '../../');
      const hash = await generateFingerprint(projectRoot);

      // Should generate a hash since project files exist
      expect(hash).not.toBeNull();
      expect(typeof hash).toBe('string');
      expect(hash!.length).toBeGreaterThan(0);
    });

    it('should return consistent hash for same project', async () => {
      const projectRoot = path.resolve(__dirname, '../../');
      const hash1 = await generateFingerprint(projectRoot);
      const hash2 = await generateFingerprint(projectRoot);

      expect(hash1).toBe(hash2);
    });
  });
});
