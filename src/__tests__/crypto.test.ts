import { base64Url, sha256Base64Url, encodePath } from '../utils/crypto';

describe('base64Url', () => {
  it('should encode buffer to base64url', () => {
    const buffer = Buffer.from('hello+world/test=');
    const encoded = base64Url(buffer);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('should produce URL-safe output', () => {
    const buffer = Buffer.from([251, 252, 253, 254, 255]);
    const encoded = base64Url(buffer);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('sha256Base64Url', () => {
  it('should produce consistent hashes', () => {
    const buffer = Buffer.from('test data');
    const hash1 = sha256Base64Url(buffer);
    const hash2 = sha256Base64Url(buffer);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different inputs', () => {
    const hash1 = sha256Base64Url(Buffer.from('data1'));
    const hash2 = sha256Base64Url(Buffer.from('data2'));
    expect(hash1).not.toBe(hash2);
  });

  it('should produce URL-safe output', () => {
    const buffer = Buffer.from('any data');
    const hash = sha256Base64Url(buffer);
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('encodePath', () => {
  it('should encode path segments', () => {
    const path = 'channel/platform/file name.js';
    const encoded = encodePath(path);
    expect(encoded).toContain('file%20name.js');
  });

  it('should preserve slashes between segments', () => {
    const path = 'a/b/c';
    const encoded = encodePath(path);
    expect(encoded).toBe('a/b/c');
  });

  it('should handle special characters', () => {
    const path = 'DEV/ios/1.0.0(1)/file.js';
    const encoded = encodePath(path);
    expect(encoded).toBe('DEV/ios/1.0.0(1)/file.js');
  });
});
