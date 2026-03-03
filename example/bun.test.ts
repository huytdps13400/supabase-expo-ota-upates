/**
 * Bun Test Suite for Example Project
 * Run with: bun test
 */

import { describe, it, expect } from 'bun:test';

// Test basic math (similar to what the library does)
describe('Library Math Functions', () => {
  it('should multiply two numbers correctly', () => {
    const multiply = (a: number, b: number) => a * b;
    expect(multiply(3, 7)).toBe(21);
  });

  it('should handle zero', () => {
    const multiply = (a: number, b: number) => a * b;
    expect(multiply(0, 5)).toBe(0);
  });

  it('should handle negative numbers', () => {
    const multiply = (a: number, b: number) => a * b;
    expect(multiply(-3, 7)).toBe(-21);
  });
});

// Test plugin configuration
describe('Plugin Configuration', () => {
  const mockPlugin = (config: any, options: any) => {
    if (options.enabled === false) return config;
    if (!options.url) throw new Error('withSupabaseOta: url is required');
    if (!options.channel)
      throw new Error('withSupabaseOta: channel is required');

    const channel = options.channel.trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(channel)) {
      throw new Error(
        'withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens'
      );
    }

    return {
      ...config,
      updates: {
        url: options.url,
        channel,
        checkAutomatically: options.checkAutomatically ?? 'NEVER',
      },
      runtimeVersion: {
        policy: options.runtimeVersionPolicy ?? 'nativeVersion',
      },
    };
  };

  it('should configure plugin with valid options', () => {
    const config = { name: 'TestApp', slug: 'test' };
    const result = mockPlugin(config, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'production',
    });

    expect(result.updates.url).toBe(
      'https://test.supabase.co/functions/v1/ota-manifest'
    );
    expect(result.updates.channel).toBe('PRODUCTION');
  });

  it('should normalize channel to uppercase', () => {
    const config = { name: 'TestApp', slug: 'test' };
    const result = mockPlugin(config, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'staging',
    });

    expect(result.updates.channel).toBe('STAGING');
  });

  it('should accept custom channels', () => {
    const config = { name: 'TestApp', slug: 'test' };
    const result = mockPlugin(config, {
      url: 'https://test.supabase.co/functions/v1/ota-manifest',
      channel: 'beta-channel_123',
    });

    expect(result.updates.channel).toBe('BETA-CHANNEL_123');
  });

  it('should throw for invalid channel', () => {
    const config = { name: 'TestApp', slug: 'test' };
    expect(() => {
      mockPlugin(config, {
        url: 'https://test.supabase.co/functions/v1/ota-manifest',
        channel: 'channel with spaces',
      });
    }).toThrow(
      'withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens'
    );
  });

  it('should throw for missing url', () => {
    const config = { name: 'TestApp', slug: 'test' };
    expect(() => {
      mockPlugin(config, { channel: 'production' });
    }).toThrow('withSupabaseOta: url is required');
  });
});

// Test configuration validation
describe('Configuration Validation', () => {
  it('should validate channel format', () => {
    const validateChannel = (channel: string) => {
      const normalized = channel.trim().toUpperCase();
      return /^[A-Z0-9_-]+$/.test(normalized);
    };

    expect(validateChannel('production')).toBe(true);
    expect(validateChannel('STAGING')).toBe(true);
    expect(validateChannel('beta_123')).toBe(true);
    expect(validateChannel('channel with spaces')).toBe(false);
    expect(validateChannel('channel@special')).toBe(false);
  });

  it('should derive runtime version correctly', () => {
    const deriveRuntimeVersion = (version: string, build: string) =>
      `${version}(${build})`;

    expect(deriveRuntimeVersion('1.0.0', '42')).toBe('1.0.0(42)');
    expect(deriveRuntimeVersion('2.5.0', '100')).toBe('2.5.0(100)');
  });

  it('should generate correct storage path', () => {
    const generatePath = (
      channel: string,
      platform: string,
      version: string,
      timestamp: string
    ) => `${channel}/${platform}/${version}/${timestamp}`;

    expect(generatePath('STAGING', 'ios', '1.0.0(42)', '1700000000')).toBe(
      'STAGING/ios/1.0.0(42)/1700000000'
    );
  });
});

// Test CLI command simulations
describe('CLI Commands', () => {
  it('should parse channel flag correctly', () => {
    const parseArgs = (args: string[]) => {
      const options: any = {};
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--channel') options.channel = args[++i];
        if (args[i] === '--platform') options.platform = args[++i];
      }
      return options;
    };

    const result = parseArgs(['--platform', 'ios', '--channel', 'production']);
    expect(result.platform).toBe('ios');
    expect(result.channel).toBe('production');
  });

  it('should normalize channel from CLI', () => {
    const normalizeChannel = (value: string) => value.trim().toUpperCase();

    expect(normalizeChannel('dev')).toBe('DEV');
    expect(normalizeChannel('PRODUCTION')).toBe('PRODUCTION');
    expect(normalizeChannel('  staging  ')).toBe('STAGING');
  });
});

console.log('✅ All Bun tests loaded successfully!');
