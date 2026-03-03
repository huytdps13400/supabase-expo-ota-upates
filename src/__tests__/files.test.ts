import { contentTypeForExt, chunk, sleep } from '../utils/files';

describe('contentTypeForExt', () => {
  it('should return correct content types', () => {
    expect(contentTypeForExt('.png')).toBe('image/png');
    expect(contentTypeForExt('.jpg')).toBe('image/jpeg');
    expect(contentTypeForExt('.jpeg')).toBe('image/jpeg');
    expect(contentTypeForExt('.json')).toBe('application/json');
    expect(contentTypeForExt('.js')).toBe('application/javascript');
    expect(contentTypeForExt('.bundle')).toBe('application/javascript');
    expect(contentTypeForExt('.hbc')).toBe('application/vnd.expo.hbc');
  });

  it('should return octet-stream for unknown extensions', () => {
    expect(contentTypeForExt('.unknown')).toBe('application/octet-stream');
    expect(contentTypeForExt('')).toBe('application/octet-stream');
  });

  it('should be case insensitive', () => {
    expect(contentTypeForExt('.PNG')).toBe('image/png');
    expect(contentTypeForExt('.Js')).toBe('application/javascript');
  });
});

describe('chunk', () => {
  it('should split array into chunks', () => {
    const arr = [1, 2, 3, 4, 5];
    const chunks = chunk(arr, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle empty array', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('should handle chunk size larger than array', () => {
    const arr = [1, 2, 3];
    expect(chunk(arr, 10)).toEqual([[1, 2, 3]]);
  });

  it('should handle exact division', () => {
    const arr = [1, 2, 3, 4];
    expect(chunk(arr, 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});

describe('sleep', () => {
  it('should resolve after specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small margin
  });

  it('should resolve immediately for 0ms', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});
