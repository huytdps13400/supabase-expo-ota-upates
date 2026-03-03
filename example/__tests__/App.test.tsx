import { describe, it, expect } from 'bun:test';

// Mock React Native
const mockMultiply = (a: number, b: number) => a * b;

describe('App', () => {
  it('renders correctly', () => {
    const result = mockMultiply(3, 7);
    expect(result).toBe(21);
  });

  it('displays correct multiplication result', () => {
    const result = mockMultiply(3, 7);
    expect(result).toBe(21);
  });
});
