/**
 * Shared types for supabase-expo-ota-updates
 */

export type Platform = 'ios' | 'android';
export type Channel = string;
export type RuntimeVersionPolicy =
  | 'nativeVersion'
  | 'sdkVersion'
  | 'appVersion'
  | 'fingerprint'
  | 'fingerprintExperimental'
  | string;
export type CheckAutomatically =
  | 'ON_LOAD'
  | 'ON_ERROR_RECOVERY'
  | 'NEVER'
  | 'WIFI_ONLY';

export interface OtaConfig {
  /** Supabase project URL */
  supabaseUrl?: string;
  /** Supabase service role key for CLI operations */
  supabaseServiceRoleKey?: string;
  /** OTA manifest endpoint URL (can be used to derive supabaseUrl) */
  otaUrl?: string;
  /** Default channel for OTA updates (e.g., 'production', 'staging', 'beta') */
  channel?: Channel;
  /** Storage bucket name */
  bucket?: string;
  /** Runtime version policy */
  runtimeVersionPolicy?: RuntimeVersionPolicy;
  /** Platform-specific config */
  platforms?: {
    ios?: Partial<OtaPlatformConfig>;
    android?: Partial<OtaPlatformConfig>;
  };
}

export interface OtaPlatformConfig {
  /** Build number for iOS */
  iosBuildNumber?: string;
  /** Version code for Android */
  androidVersionCode?: string;
  /** App version number */
  versionNumber?: string;
}

export interface PublishOptions {
  /** Target platform */
  platform: Platform;
  /** Channel name (e.g., 'production', 'staging', 'beta') */
  channel?: Channel;
  /** Runtime version override */
  runtimeVersion?: string;
  /** Storage bucket */
  bucket?: string;
  /** Dist directory path */
  dist?: string;
  /** Timestamp for the upload path */
  timestamp?: string;
  /** Skip the build step */
  noBuild?: boolean;
  /** Dry run - don't actually upload */
  dryRun?: boolean;
  /** Config file path */
  config?: string;
  /** Force update - require immediate update */
  forceUpdate?: boolean;
  /** Rollout percentage (0-100) */
  rollout?: number;
  /** Update message/changelog */
  message?: string;
  /** App version for semver matching */
  appVersion?: string;
}

export interface CleanupOptions {
  /** Cleanup edge function URL */
  cleanupUrl?: string;
  /** Retain count override */
  retainCount?: number;
  /** Retention days override */
  retainDays?: number;
  /** Config file path */
  config?: string;
}

export interface DoctorOptions {
  /** Config file path */
  config?: string;
  /** Test manifest fetch */
  testManifest?: boolean;
}

export interface InfoOptions {
  /** Platform to show info for */
  platform?: Platform;
  /** Config file path */
  config?: string;
}

export interface InitOptions {
  /** Config format (legacy config-only mode) */
  format?: 'ts' | 'js' | 'json';
  /** Force overwrite existing config */
  force?: boolean;
  /** Supabase project URL */
  supabaseUrl?: string;
  /** Supabase service role key */
  serviceKey?: string;
  /** Skip creating migration files */
  skipMigrations?: boolean;
  /** Skip creating edge functions */
  skipFunctions?: boolean;
  /** Skip creating config files */
  skipConfig?: boolean;
  /** Skip project linking */
  skipLink?: boolean;
  /** Skip auto deploy step */
  skipDeploy?: boolean;
  /** Run only config scaffolding (legacy init behavior) */
  configOnly?: boolean;
}

export interface CronOptions {
  /** Schedule expression (cron format) */
  schedule?: string;
  /** Edge function URL */
  cleanupUrl?: string;
}

export interface PluginOptions {
  /** OTA manifest endpoint URL */
  url: string;
  /** Channel name (e.g., 'production', 'staging', 'beta') */
  channel: Channel;
  /** Enable/disable plugin */
  enabled?: boolean;
  /** Runtime version policy */
  runtimeVersionPolicy?: RuntimeVersionPolicy;
  /** Check automatically setting */
  checkAutomatically?: CheckAutomatically;
  /** Code signing certificate path */
  codeSigningCertificate?: string;
  /** Code signing metadata */
  codeSigningMetadata?: {
    keyid: string;
    alg: string;
    sig?: string;
  };
}

export interface AssetInfo {
  filePath: string;
  fileName: string;
  storagePath: string;
  key: string;
  hash: string;
  ext: string;
  contentType: string;
}

export interface BundleInfo {
  filePath: string;
  fileName: string;
  storagePath: string;
  key: string;
  hash: string;
  contentType: string;
}

export interface OtaUpdatePayload {
  channel: Channel;
  platform: Platform;
  runtime_version: string;
  launch_asset_url: string;
  launch_asset_key: string;
  launch_asset_hash: string;
  launch_asset_content_type: string;
  launch_asset_storage_bucket: string;
  launch_asset_storage_path: string;
  metadata: Record<string, unknown>;
  extra: Record<string, unknown>;
  is_active: boolean;
  is_mandatory?: boolean;
  rollout_percentage?: number;
  message?: string;
  app_version?: string;
}

export interface OtaAssetPayload {
  update_id: string;
  hash: string;
  key: string;
  content_type: string;
  file_extension: string | null;
  url: string;
  storage_bucket: string;
  storage_path: string;
}

export interface OtaUpdateRecord {
  id: string;
  created_at: string;
  channel: string;
  platform: string;
  runtime_version: string;
  is_active: boolean;
  is_mandatory?: boolean;
  rollout_percentage?: number;
  message?: string;
  app_version?: string;
  bundle_id?: string;
  launch_asset_key: string;
}

export interface RollbackOptions {
  platform: Platform;
  channel?: Channel;
  config?: string;
  /** Specific update ID to rollback to */
  to?: string;
}

export interface ListOptions {
  platform?: Platform;
  channel?: Channel;
  config?: string;
  limit?: number;
  offset?: number;
  /** Show only active updates */
  active?: boolean;
  /** Output format */
  format?: 'table' | 'json';
}
