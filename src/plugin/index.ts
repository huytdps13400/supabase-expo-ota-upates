import type { ConfigPlugin } from 'expo/config-plugins';
import type { PluginOptions } from '../types';

/**
 * Expo Config Plugin for Supabase OTA Updates
 *
 * This plugin configures expo-updates to use Supabase as the OTA backend.
 *
 * @example
 * // app.config.js
 * const { withSupabaseOta } = require('supabase-expo-ota-updates/plugin');
 *
 * module.exports = withSupabaseOta({
 *   url: 'https://your-project.supabase.co/functions/v1/ota-manifest',
 *   channel: 'production',
 *   runtimeVersionPolicy: 'nativeVersion',
 *   checkAutomatically: 'ON_LOAD',
 * });
 *
 * @example
 * // Multiple channels with different URLs
 * const env = process.env.EXPO_PUBLIC_ENV || 'staging';
 * const channelUrls = {
 *   production: 'https://prod.example.com/functions/v1/ota-manifest',
 *   staging: 'https://staging.example.com/functions/v1/ota-manifest',
 *   beta: 'https://beta.example.com/functions/v1/ota-manifest',
 * };
 *
 * module.exports = withSupabaseOta({
 *   url: channelUrls[env],
 *   channel: env,
 *   runtimeVersionPolicy: 'nativeVersion',
 * });
 */

const withSupabaseOta: ConfigPlugin<PluginOptions> = (config, options) => {
  // If disabled, return config unchanged
  if (options.enabled === false) {
    return config;
  }

  // Validate required options
  if (!options.url) {
    throw new Error('withSupabaseOta: url is required');
  }
  if (!options.channel) {
    throw new Error('withSupabaseOta: channel is required');
  }

  // Normalize channel (uppercase, no spaces)
  const channel = options.channel.trim().toUpperCase();

  if (!channel) {
    throw new Error('withSupabaseOta: channel cannot be empty');
  }

  // Validate channel format (alphanumeric + underscore + hyphen)
  if (!/^[A-Z0-9_-]+$/.test(channel)) {
    throw new Error(
      `withSupabaseOta: channel must contain only letters, numbers, underscores, and hyphens. Got: "${options.channel}"`
    );
  }

  // Set updates configuration

  config.updates = {
    ...config.updates,
    url: options.url,
    channel,
    checkAutomatically: options.checkAutomatically ?? 'NEVER',
    // Code signing (optional)
    ...(options.codeSigningCertificate && {
      codeSigningCertificate: options.codeSigningCertificate,
    }),
    ...(options.codeSigningMetadata && {
      codeSigningMetadata: options.codeSigningMetadata,
    }),
  } as any;

  // Set runtime version policy
  const policy = options.runtimeVersionPolicy ?? 'nativeVersion';

  if (
    policy === 'nativeVersion' ||
    policy === 'sdkVersion' ||
    policy === 'appVersion'
  ) {
    config.runtimeVersion = {
      policy,
    };
  } else {
    // Custom runtime version string
    config.runtimeVersion = policy;
  }

  return config;
};

export default withSupabaseOta;
export { withSupabaseOta };
