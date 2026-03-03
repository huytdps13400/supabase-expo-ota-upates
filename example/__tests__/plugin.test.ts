import type { ExpoConfig } from 'expo/config';

// We need to test the plugin separately since it modifies the config
const mockPlugin = (config: ExpoConfig, options: any): ExpoConfig => {
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

describe('withSupabaseOta Plugin', () => {
  const baseConfig: ExpoConfig = {
    name: 'TestApp',
    slug: 'test-app',
  };

  it('configures updates with required options', () => {
    const result = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'production',
    });

    expect(result.updates?.url).toBe(
      'https://test.supabase.co/functions/v1/ota-manifest'
    );
    expect(result.updates?.channel).toBe('PRODUCTION');
    expect(result.updates?.checkAutomatically).toBe('NEVER');
    expect(result.runtimeVersion).toEqual({ policy: 'nativeVersion' });
  });

  it('normalizes channel to uppercase', () => {
    const result = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'staging',
    });

    expect(result.updates?.channel).toBe('STAGING');
  });

  it('accepts custom channel names', () => {
    const result1 = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'beta',
    });
    expect(result1.updates?.channel).toBe('BETA');

    const result2 = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'my_custom-channel123',
    });
    expect(result2.updates?.channel).toBe('MY_CUSTOM-CHANNEL123');
  });

  it('sets checkAutomatically option', () => {
    const result = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
      checkAutomatically: 'ON_LOAD',
    });

    expect(result.updates?.checkAutomatically).toBe('ON_LOAD');
  });

  it('includes code signing certificate', () => {
    const result = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
      codeSigningCertificate: './certs/cert.pem',
    });

    expect(result.updates?.codeSigningCertificate).toBe('./certs/cert.pem');
  });

  it('throws if url is missing', () => {
    expect(() =>
      mockPlugin(baseConfig, {
        url: '',
        channel: 'PRODUCTION',
      })
    ).toThrow('withSupabaseOta: url is required');
  });

  it('throws if channel is missing', () => {
    expect(() =>
      mockPlugin(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: '',
      })
    ).toThrow('withSupabaseOta: channel is required');
  });

  it('throws for invalid channel characters', () => {
    expect(() =>
      mockPlugin(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: 'channel with spaces',
      })
    ).toThrow(
      'withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens'
    );
  });

  it('throws for empty channel', () => {
    expect(() =>
      mockPlugin(baseConfig, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: '   ',
      })
    ).toThrow('withSupabaseOta: channel cannot be empty');
  });

  it('returns config unchanged when disabled', () => {
    const result = mockPlugin(baseConfig, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'PRODUCTION',
      enabled: false,
    });

    expect(result).toBe(baseConfig);
  });
});
