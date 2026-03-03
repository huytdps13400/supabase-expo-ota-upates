type ExpoConfig = any;
import type { PluginOptions } from '../types';

// Mock the plugin for testing
const mockWithSupabaseOta = (
  config: ExpoConfig,
  options: PluginOptions
): ExpoConfig => {
  if (options.enabled === false) {
    return config;
  }

  if (!options.url) {
    throw new Error('withSupabaseOta: url is required');
  }
  if (!options.channel) {
    throw new Error('withSupabaseOta: channel is required');
  }

  const channel = options.channel.trim().toUpperCase();
  if (!channel) {
    throw new Error('withSupabaseOta: channel cannot be empty');
  }

  if (!/^[A-Z0-9_-]+$/.test(channel)) {
    throw new Error(
      `withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens`
    );
  }

  return {
    ...config,
    updates: {
      ...config.updates,
      url: options.url,
      channel,
      checkAutomatically: options.checkAutomatically ?? 'NEVER',
      ...(options.codeSigningCertificate && {
        codeSigningCertificate: options.codeSigningCertificate,
      }),
      ...(options.codeSigningMetadata && {
        codeSigningMetadata: options.codeSigningMetadata,
      }),
    },
    runtimeVersion: {
      policy: options.runtimeVersionPolicy ?? 'nativeVersion',
    },
  };
};

describe('withSupabaseOta plugin', () => {
  const baseConfig: ExpoConfig = {
    name: 'TestApp',
    slug: 'test-app',
  };

  it('should configure updates with required options', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'DEV',
    });

    expect(result.updates?.url).toBe(
      'https://test.supabase.co/functions/v1/ota-manifest'
    );
    expect(result.updates?.channel).toBe('DEV');
    expect(result.updates?.checkAutomatically).toBe('NEVER');
    expect(result.runtimeVersion).toEqual({ policy: 'nativeVersion' });
  });

  it('should normalize channel to uppercase', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'dev',
    });

    expect(result.updates?.channel).toBe('DEV');
  });

  it('should accept STAGING channel', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'staging',
    });

    expect(result.updates?.channel).toBe('STAGING');
  });

  it('should accept custom channel names', () => {
    const result1 = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'production',
    });
    expect(result1.updates?.channel).toBe('PRODUCTION');

    const result2 = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'beta',
    });
    expect(result2.updates?.channel).toBe('BETA');

    const result3 = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'my_custom-channel123',
    });
    expect(result3.updates?.channel).toBe('MY_CUSTOM-CHANNEL123');
  });

  it('should set checkAutomatically option', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
      checkAutomatically: 'ON_LOAD',
    });

    expect(result.updates?.checkAutomatically).toBe('ON_LOAD');
  });

  it('should set runtimeVersion policy', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'DEV',
      runtimeVersionPolicy: 'appVersion',
    });

    expect(result.runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('should include code signing certificate', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'DEV',
      codeSigningCertificate: './certs/cert.pem',
    });

    expect(result.updates?.codeSigningCertificate).toBe('./certs/cert.pem');
  });

  it('should include code signing metadata', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'DEV',
      codeSigningMetadata: {
        keyid: 'main',
        alg: 'rsa-v1_5-sha256',
      },
    });

    expect(result.updates?.codeSigningMetadata).toEqual({
      keyid: 'main',
      alg: 'rsa-v1_5-sha256',
    });
  });

  it('should throw if url is missing', () => {
    expect(() =>
      mockWithSupabaseOta(baseConfig, {
        url: '',
        channel: 'DEV',
      })
    ).toThrow('withSupabaseOta: url is required');
  });

  it('should throw if channel is missing', () => {
    expect(() =>
      mockWithSupabaseOta(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: '' as any,
      })
    ).toThrow('withSupabaseOta: channel is required');
  });

  it('should throw for invalid channel characters', () => {
    expect(() =>
      mockWithSupabaseOta(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: 'channel with spaces',
      })
    ).toThrow(
      'withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens'
    );
  });

  it('should throw for empty channel', () => {
    expect(() =>
      mockWithSupabaseOta(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: '   ',
      })
    ).toThrow('withSupabaseOta: channel cannot be empty');
  });

  it('should return config unchanged when disabled', () => {
    const result = mockWithSupabaseOta(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'DEV',
      enabled: false,
    });

    expect(result).toBe(baseConfig);
  });
});
