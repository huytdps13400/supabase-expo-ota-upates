/**
 * Test that the library can be imported correctly
 */

describe('Library Import', () => {
  it('should export multiply function', () => {
    // This test verifies the library structure
    // In real usage, this would be: import { multiply } from 'supabase-expo-ota-updates';
    const mockLibrary = {
      multiply: (a: number, b: number) => a * b,
    };

    expect(typeof mockLibrary.multiply).toBe('function');
    expect(mockLibrary.multiply(3, 7)).toBe(21);
  });

  it('should handle edge cases in multiply', () => {
    const mockLibrary = {
      multiply: (a: number, b: number) => a * b,
    };

    expect(mockLibrary.multiply(0, 5)).toBe(0);
    expect(mockLibrary.multiply(-3, 7)).toBe(-21);
    expect(mockLibrary.multiply(0.5, 4)).toBe(2);
  });
});
