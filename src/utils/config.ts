import * as fs from 'fs';
import * as path from 'path';
import type { OtaConfig, Channel, Platform } from '../types';

const CONFIG_FILES = [
  'supabase-ota.config.ts',
  'supabase-ota.config.js',
  'supabase-ota.config.json',
  'supabase-ota.config.mjs',
];

/**
 * Find and load the config file
 */
export async function loadConfig(
  configPath?: string
): Promise<OtaConfig | null> {
  const targetPath = configPath ?? findConfigFile();

  if (!targetPath) {
    return null;
  }

  const ext = path.extname(targetPath);

  if (ext === '.json') {
    const content = fs.readFileSync(targetPath, 'utf-8');
    return JSON.parse(content) as OtaConfig;
  }

  // For TS/JS/MJS files, use dynamic import
  // In CommonJS context, we need to use require for .js files
  if (ext === '.js' || ext === '.mjs') {
    // Clear require cache for hot reload in dev
    delete require.cache[require.resolve(targetPath)];
    const module = require(targetPath);
    return module.default ?? module;
  }

  // For .ts files, we'd need ts-node or similar in real usage
  // For this implementation, we'll assume the CLI is compiled/built
  // and TS configs are handled by the build process
  if (ext === '.ts') {
    try {
      // Try dynamic import first (ESM)
      const module = await import(targetPath);
      return module.default ?? module;
    } catch {
      // Fallback to require
      delete require.cache[require.resolve(targetPath)];
      const module = require(targetPath);
      return module.default ?? module;
    }
  }

  return null;
}

/**
 * Find config file in current directory
 */
export function findConfigFile(): string | null {
  for (const file of CONFIG_FILES) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Get Supabase URL from env or derive from OTA URL
 */
export function getSupabaseUrl(config?: OtaConfig): string | null {
  const direct = process.env.SUPABASE_URL ?? config?.supabaseUrl ?? null;
  if (direct) return direct;

  const otaUrl = process.env.EXPO_PUBLIC_OTA_URL ?? config?.otaUrl ?? null;
  if (!otaUrl) return null;

  try {
    const parsed = new URL(otaUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Get service role key from env or config
 */
export function getServiceRoleKey(config?: OtaConfig): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    config?.supabaseServiceRoleKey ??
    null
  );
}

/**
 * Normalize channel to uppercase and validate format
 * Channel can be any string containing letters, numbers, underscores, and hyphens
 */
export function normalizeChannel(
  value: string | null | undefined
): Channel | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();

  // Validate: alphanumeric + underscore + hyphen only
  if (!/^[A-Z0-9_-]+$/.test(upper)) {
    return null;
  }

  return upper;
}

/**
 * Get default channel from env
 */
export function getDefaultChannel(config?: OtaConfig): Channel | null {
  return normalizeChannel(process.env.EXPO_PUBLIC_ENV ?? config?.channel);
}

/**
 * Get bucket from env or config
 */
export function getBucket(config?: OtaConfig): string {
  return config?.bucket ?? 'ota-bundles';
}

/**
 * Derive runtime version from env vars
 */
export function deriveRuntimeVersion(
  platform: Platform,
  override?: string,
  config?: OtaConfig
): string | null {
  if (override) return override;

  const platformConfig = config?.platforms?.[platform];
  const version =
    process.env.VERSION_NUMBER ?? platformConfig?.versionNumber ?? null;

  if (!version) return null;

  const buildNumber =
    platform === 'ios'
      ? process.env.IOS_BUILD_NUMBER ?? platformConfig?.iosBuildNumber
      : process.env.ANDROID_BUILD_NUMBER ?? platformConfig?.androidVersionCode;

  if (!buildNumber) return null;

  return `${version}(${buildNumber})`;
}

/**
 * Validate channel format
 */
export function validateChannel(channel: string): {
  valid: boolean;
  error?: string;
} {
  const normalized = channel.trim().toUpperCase();

  if (!normalized) {
    return { valid: false, error: 'Channel cannot be empty' };
  }

  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    return {
      valid: false,
      error:
        'Channel must contain only letters, numbers, underscores, and hyphens',
    };
  }

  return { valid: true };
}

/**
 * Validate required env vars for publish
 */
export function validatePublishEnv(config?: OtaConfig): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  const supabaseUrl = getSupabaseUrl(config);
  if (!supabaseUrl) {
    missing.push('SUPABASE_URL (or EXPO_PUBLIC_OTA_URL)');
  }

  const serviceKey = getServiceRoleKey(config);
  if (!serviceKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  return { valid: missing.length === 0, missing };
}

interface ConfigTemplateOverrides {
  otaUrl?: string;
  channel?: string;
}

/**
 * Create config file content
 */
export function createConfigContent(
  format: 'ts' | 'js' | 'json',
  overrides?: ConfigTemplateOverrides
): string {
  const config = {
    // Supabase configuration
    // Either supabaseUrl or otaUrl must be provided
    // otaUrl can be used to derive supabaseUrl
    otaUrl:
      overrides?.otaUrl ??
      process.env.EXPO_PUBLIC_OTA_URL ??
      'https://your-project.supabase.co/functions/v1/ota-manifest',

    // Default channel for OTA updates
    channel: overrides?.channel ?? process.env.EXPO_PUBLIC_ENV ?? 'DEV',

    // Storage bucket name
    bucket: 'ota-bundles',

    // Runtime version policy
    runtimeVersionPolicy: 'nativeVersion',

    // Platform-specific configuration
    platforms: {
      ios: {
        // Can be overridden via IOS_BUILD_NUMBER env var
        iosBuildNumber: '1',
      },
      android: {
        // Can be overridden via ANDROID_BUILD_NUMBER env var
        androidVersionCode: '1',
      },
    },
  };

  switch (format) {
    case 'ts':
      return `import type { OtaConfig } from 'supabase-expo-ota-updates';

const config: OtaConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
    case 'js':
      return `/** @type {import('supabase-expo-ota-updates').OtaConfig} */
const config = ${JSON.stringify(config, null, 2)};

module.exports = config;
`;
    case 'json':
    default:
      return JSON.stringify(config, null, 2);
  }
}

interface EnvTemplateOverrides {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  otaUrl?: string;
  channel?: string;
}

/**
 * Create .env.example content
 */
export function createEnvExample(overrides?: EnvTemplateOverrides): string {
  const supabaseUrl =
    overrides?.supabaseUrl ??
    process.env.SUPABASE_URL ??
    'https://your-project.supabase.co';
  const supabaseServiceRoleKey =
    overrides?.supabaseServiceRoleKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    'your-service-role-key';
  const otaUrl =
    overrides?.otaUrl ??
    process.env.EXPO_PUBLIC_OTA_URL ??
    `${supabaseUrl}/functions/v1/ota-manifest`;
  const channel = overrides?.channel ?? process.env.EXPO_PUBLIC_ENV ?? 'DEV';

  return `# Supabase OTA Updates Configuration
# Copy this file to .env and fill in your values

# Supabase Configuration
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceRoleKey}

# OTA Configuration
EXPO_PUBLIC_OTA_URL=${otaUrl}
EXPO_PUBLIC_ENV=${channel}

# App Version (used to derive runtimeVersion)
VERSION_NUMBER=1.0.0
IOS_BUILD_NUMBER=1
ANDROID_BUILD_NUMBER=1

# Optional: Google Chat notifications
GOOGLE_CHAT_WEBHOOK=
`;
}
