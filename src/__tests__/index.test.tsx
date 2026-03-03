import type { OtaConfig, PluginOptions, Platform, Channel } from '../types';

describe('Types exports', () => {
  it('should have Platform type', () => {
    const platform: Platform = 'ios';
    expect(platform).toBe('ios');
  });

  it('should accept any string as Channel', () => {
    const channel1: Channel = 'PRODUCTION';
    const channel2: Channel = 'BETA';
    const channel3: Channel = 'MY_CUSTOM_CHANNEL';
    expect(channel1).toBe('PRODUCTION');
    expect(channel2).toBe('BETA');
    expect(channel3).toBe('MY_CUSTOM_CHANNEL');
  });
});

describe('OtaConfig interface', () => {
  it('should accept valid config', () => {
    const config: OtaConfig = {
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRoleKey: 'test-key',
      channel: 'DEV',
      bucket: 'ota-bundles',
      runtimeVersionPolicy: 'nativeVersion',
      platforms: {
        ios: {
          iosBuildNumber: '1',
          versionNumber: '1.0.0',
        },
        android: {
          androidVersionCode: '1',
          versionNumber: '1.0.0',
        },
      },
    };

    expect(config.supabaseUrl).toBe('https://test.supabase.co');
    expect(config.channel).toBe('DEV');
  });
});

describe('PluginOptions interface', () => {
  it('should accept valid plugin options', () => {
    const options: PluginOptions = {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'STAGING',
      enabled: true,
      runtimeVersionPolicy: 'nativeVersion',
      checkAutomatically: 'ON_LOAD',
    };

    expect(options.url).toBe(
      'https://test.supabase.co/functions/v1/ota-manifest'
    );
    expect(options.channel).toBe('STAGING');
  });
});
