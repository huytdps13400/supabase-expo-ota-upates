// Main exports for supabase-expo-ota-updates

export type {
  OtaConfig,
  OtaPlatformConfig,
  PublishOptions,
  CleanupOptions,
  DoctorOptions,
  InfoOptions,
  InitOptions,
  CronOptions,
  PluginOptions,
  AssetInfo,
  BundleInfo,
  OtaUpdatePayload,
  OtaAssetPayload,
  Platform,
  Channel,
  RuntimeVersionPolicy,
  CheckAutomatically,
} from './types';

// Re-export utilities for advanced use cases
export {
  loadConfig,
  findConfigFile,
  getSupabaseUrl,
  getServiceRoleKey,
  normalizeChannel,
  getDefaultChannel,
  getBucket,
  deriveRuntimeVersion,
  validatePublishEnv,
  createConfigContent,
  createEnvExample,
} from './utils/config';

export { base64Url, sha256Base64Url, encodePath } from './utils/crypto';

export {
  readFilesRecursive,
  contentTypeForExt,
  chunk,
  sleep,
  ensureDir,
} from './utils/files';
