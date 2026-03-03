/**
 * Tests for configuration validation
 */

describe('Configuration', () => {
  describe('Environment Variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should require SUPABASE_URL or EXPO_PUBLIC_OTA_URL', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_OTA_URL;

      const supabaseUrl =
        process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_OTA_URL;
      expect(supabaseUrl).toBeUndefined();
    });

    it('should derive Supabase URL from OTA URL', () => {
      process.env.EXPO_PUBLIC_OTA_URL =
        'https://abc123.supabase.co/functions/v1/ota-manifest';

      const otaUrl = process.env.EXPO_PUBLIC_OTA_URL;
      const match = otaUrl?.match(/https:\/\/([^/]+)/);
      const derivedUrl = match ? match[0] : null;

      expect(derivedUrl).toBe('https://abc123.supabase.co');
    });

    it('should support custom channel names', () => {
      const channels = ['production', 'staging', 'beta', 'my-app-v1'];

      channels.forEach((channel) => {
        const normalized = channel.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        expect(normalized).toMatch(/^[A-Z0-9_-]+$/);
      });
    });

    it('should reject invalid channel names', () => {
      const invalidChannels = ['channel with spaces', 'channel@special', ''];

      invalidChannels.forEach((channel) => {
        const normalized = channel.toUpperCase().trim();
        const isValid = /^[A-Z0-9_-]+$/.test(normalized);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Runtime Version Derivation', () => {
    it('should derive runtime version from version and build number', () => {
      const version = '1.0.0';
      const buildNumber = '42';

      const runtimeVersion = `${version}(${buildNumber})`;
      expect(runtimeVersion).toBe('1.0.0(42)');
    });

    it('should handle different version formats', () => {
      const testCases = [
        { version: '1.0.0', build: '1', expected: '1.0.0(1)' },
        { version: '2.5.0', build: '100', expected: '2.5.0(100)' },
        { version: '0.1.0-beta', build: '5', expected: '0.1.0-beta(5)' },
      ];

      testCases.forEach(({ version, build, expected }) => {
        expect(`${version}(${build})`).toBe(expected);
      });
    });
  });

  describe('Storage Path Structure', () => {
    it('should generate correct storage path', () => {
      const channel = 'STAGING';
      const platform = 'ios';
      const runtimeVersion = '1.0.0(42)';
      const timestamp = '1700000000';

      const basePath = `${channel}/${platform}/${runtimeVersion}/${timestamp}`;
      expect(basePath).toBe('STAGING/ios/1.0.0(42)/1700000000');
    });

    it('should handle special characters in paths', () => {
      const fileName = 'main.jsbundle';
      const encodedPath = encodeURIComponent(fileName);
      expect(encodedPath).toBe('main.jsbundle');
    });
  });
});
