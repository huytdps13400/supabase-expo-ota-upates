import {
  normalizeChannel,
  getSupabaseUrl,
  getBucket,
  deriveRuntimeVersion,
  validatePublishEnv,
  createConfigContent,
  createEnvExample,
} from '../utils/config';
import type { OtaConfig } from '../types';

describe('normalizeChannel', () => {
  it('should normalize custom channel names', () => {
    expect(normalizeChannel('production')).toBe('PRODUCTION');
    expect(normalizeChannel('beta')).toBe('BETA');
    expect(normalizeChannel('my-channel')).toBe('MY-CHANNEL');
    expect(normalizeChannel('test_123')).toBe('TEST_123');
  });

  it('should normalize legacy DEV/STAGING', () => {
    expect(normalizeChannel('dev')).toBe('DEV');
    expect(normalizeChannel('DEV')).toBe('DEV');
    expect(normalizeChannel(' Staging ')).toBe('STAGING');
  });

  it('should return null for invalid characters', () => {
    expect(normalizeChannel('')).toBeNull();
    expect(normalizeChannel(null)).toBeNull();
    expect(normalizeChannel(undefined)).toBeNull();
    expect(normalizeChannel('channel with spaces')).toBeNull();
    expect(normalizeChannel('channel@special')).toBeNull();
  });
});

describe('getSupabaseUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_OTA_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return SUPABASE_URL directly', () => {
    process.env.SUPABASE_URL = 'https://direct.supabase.co';
    expect(getSupabaseUrl()).toBe('https://direct.supabase.co');
  });

  it('should derive from EXPO_PUBLIC_OTA_URL', () => {
    process.env.EXPO_PUBLIC_OTA_URL =
      'https://derived.supabase.co/functions/v1/ota-manifest';
    expect(getSupabaseUrl()).toBe('https://derived.supabase.co');
  });

  it('should prefer SUPABASE_URL over EXPO_PUBLIC_OTA_URL', () => {
    process.env.SUPABASE_URL = 'https://direct.supabase.co';
    process.env.EXPO_PUBLIC_OTA_URL =
      'https://derived.supabase.co/functions/v1/ota-manifest';
    expect(getSupabaseUrl()).toBe('https://direct.supabase.co');
  });

  it('should return null if neither is set', () => {
    expect(getSupabaseUrl()).toBeNull();
  });

  it('should use config value', () => {
    const config: OtaConfig = {
      supabaseUrl: 'https://config.supabase.co',
    };
    expect(getSupabaseUrl(config)).toBe('https://config.supabase.co');
  });
});

describe('getBucket', () => {
  it('should return default bucket', () => {
    expect(getBucket()).toBe('ota-bundles');
  });

  it('should return config bucket', () => {
    const config: OtaConfig = { bucket: 'custom-bucket' };
    expect(getBucket(config)).toBe('custom-bucket');
  });
});

describe('deriveRuntimeVersion', () => {
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

  it('should derive iOS runtime version', () => {
    process.env.VERSION_NUMBER = '1.0.0';
    process.env.IOS_BUILD_NUMBER = '42';
    expect(deriveRuntimeVersion('ios')).toBe('1.0.0(42)');
  });

  it('should derive Android runtime version', () => {
    process.env.VERSION_NUMBER = '2.0.0';
    process.env.ANDROID_BUILD_NUMBER = '100';
    expect(deriveRuntimeVersion('android')).toBe('2.0.0(100)');
  });

  it('should use override if provided', () => {
    process.env.VERSION_NUMBER = '1.0.0';
    process.env.IOS_BUILD_NUMBER = '1';
    expect(deriveRuntimeVersion('ios', 'override-version')).toBe(
      'override-version'
    );
  });

  it('should return null if version number missing', () => {
    process.env.IOS_BUILD_NUMBER = '1';
    expect(deriveRuntimeVersion('ios')).toBeNull();
  });

  it('should return null if build number missing', () => {
    process.env.VERSION_NUMBER = '1.0.0';
    expect(deriveRuntimeVersion('ios')).toBeNull();
  });

  it('should use config values', () => {
    const config: OtaConfig = {
      platforms: {
        ios: {
          versionNumber: '3.0.0',
          iosBuildNumber: '99',
        },
      },
    };
    expect(deriveRuntimeVersion('ios', undefined, config)).toBe('3.0.0(99)');
  });
});

describe('validatePublishEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_OTA_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should be valid with all required vars', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const result = validatePublishEnv();
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should be invalid with missing supabase url', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const result = validatePublishEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('SUPABASE_URL (or EXPO_PUBLIC_OTA_URL)');
  });

  it('should be invalid with missing service key', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    const result = validatePublishEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('should accept config values', () => {
    const config: OtaConfig = {
      supabaseUrl: 'https://config.supabase.co',
      supabaseServiceRoleKey: 'config-key',
    };
    const result = validatePublishEnv(config);
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});

describe('createConfigContent', () => {
  it('should create TypeScript config', () => {
    const content = createConfigContent('ts');
    expect(content).toContain('import type');
    expect(content).toContain('OtaConfig');
    expect(content).toContain('export default');
  });

  it('should create JavaScript config', () => {
    const content = createConfigContent('js');
    expect(content).toContain('/** @type');
    expect(content).toContain('module.exports');
  });

  it('should create JSON config', () => {
    const content = createConfigContent('json');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('should apply config overrides', () => {
    const content = createConfigContent('json', {
      otaUrl: 'https://custom.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
    });
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.otaUrl).toBe(
      'https://custom.supabase.co/functions/v1/ota-manifest'
    );
    expect(parsed.channel).toBe('PRODUCTION');
  });
});

describe('createEnvExample', () => {
  it('should create env example content', () => {
    const content = createEnvExample();
    expect(content).toContain('SUPABASE_URL');
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(content).toContain('EXPO_PUBLIC_OTA_URL');
    expect(content).toContain('VERSION_NUMBER');
    expect(content).toContain('IOS_BUILD_NUMBER');
    expect(content).toContain('ANDROID_BUILD_NUMBER');
  });

  it('should apply env overrides', () => {
    const content = createEnvExample({
      supabaseUrl: 'https://custom.supabase.co',
      supabaseServiceRoleKey: 'custom-key',
      otaUrl: 'https://custom.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
    });
    expect(content).toContain('SUPABASE_URL=https://custom.supabase.co');
    expect(content).toContain('SUPABASE_SERVICE_ROLE_KEY=custom-key');
    expect(content).toContain(
      'EXPO_PUBLIC_OTA_URL=https://custom.supabase.co/functions/v1/ota-manifest'
    );
    expect(content).toContain('EXPO_PUBLIC_ENV=PRODUCTION');
  });
});
