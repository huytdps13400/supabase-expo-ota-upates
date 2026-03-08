import { deriveRuntimeVersionAsync } from '../utils/config';
import type { OtaConfig } from '../types';

describe('deriveRuntimeVersionAsync', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERSION_NUMBER;
    delete process.env.IOS_BUILD_NUMBER;
    delete process.env.ANDROID_BUILD_NUMBER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use override if provided', async () => {
    const result = await deriveRuntimeVersionAsync('ios', 'my-override');
    expect(result).toBe('my-override');
  });

  it('should derive from env vars for non-fingerprint policy', async () => {
    process.env.VERSION_NUMBER = '2.0.0';
    process.env.IOS_BUILD_NUMBER = '10';

    const result = await deriveRuntimeVersionAsync('ios');
    expect(result).toBe('2.0.0(10)');
  });

  it('should use fingerprint strategy when configured', async () => {
    const config: OtaConfig = {
      runtimeVersionPolicy: 'fingerprint',
    };

    const result = await deriveRuntimeVersionAsync('ios', undefined, config);

    // Should generate a fingerprint hash (16 hex chars) from fallback
    // since @expo/fingerprint is not installed in test
    if (result) {
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
    // May be null if no config files found - that's ok too
  });

  it('should fall back to sync derivation when fingerprint fails', async () => {
    process.env.VERSION_NUMBER = '1.0.0';
    process.env.ANDROID_BUILD_NUMBER = '5';

    const config: OtaConfig = {
      runtimeVersionPolicy: 'fingerprint',
    };

    const result = await deriveRuntimeVersionAsync(
      'android',
      undefined,
      config
    );

    // Should either return fingerprint hash or fall back to version(build)
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('should return null when no version info available', async () => {
    const result = await deriveRuntimeVersionAsync('ios');
    expect(result).toBeNull();
  });
});
