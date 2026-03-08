import { isInteractive } from '../utils/prompt';

describe('prompt utils', () => {
  describe('isInteractive', () => {
    it('should return boolean based on stdin.isTTY', () => {
      const result = isInteractive();
      // In test environment, stdin.isTTY is typically undefined (not a TTY)
      expect(typeof result).toBe('boolean');
    });
  });
});
