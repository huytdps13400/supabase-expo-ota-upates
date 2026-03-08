import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  loadConfig,
  getSupabaseUrl,
  getServiceRoleKey,
  normalizeChannel,
  getDefaultChannel,
  getBucket,
  deriveRuntimeVersionAsync,
  validatePublishEnv,
} from '../../utils/config';
import { sha256Base64Url } from '../../utils/crypto';
import { readFilesRecursive, contentTypeForExt } from '../../utils/files';
import {
  uploadFile,
  insertOtaUpdate,
  insertOtaAssets,
} from '../../utils/supabase';
import type {
  PublishOptions,
  Platform,
  AssetInfo,
  OtaUpdatePayload,
  OtaAssetPayload,
} from '../../types';

function parseArgs(args: string[]): PublishOptions {
  const options: Partial<PublishOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--platform') {
      const value = args[++i];
      if (value === 'ios' || value === 'android') {
        options.platform = value;
      }
    } else if (arg === '--channel') {
      const channel = normalizeChannel(args[++i]);
      if (channel) {
        options.channel = channel;
      }
    } else if (arg === '--runtime-version') {
      options.runtimeVersion = args[++i];
    } else if (arg === '--bucket') {
      options.bucket = args[++i];
    } else if (arg === '--dist') {
      options.dist = args[++i];
    } else if (arg === '--timestamp') {
      options.timestamp = args[++i];
    } else if (arg === '--config') {
      options.config = args[++i];
    } else if (arg === '--no-build') {
      options.noBuild = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--force-update' || arg === '-f') {
      options.forceUpdate = true;
    } else if (arg === '--rollout') {
      const nextArg = args[++i];
      if (nextArg) {
        const percentage = parseInt(nextArg, 10);
        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
          options.rollout = percentage;
        } else {
          throw new Error('Rollout percentage must be between 0 and 100');
        }
      }
    } else if (arg === '--message' || arg === '-m') {
      options.message = args[++i];
    } else if (arg === '--app-version') {
      options.appVersion = args[++i];
    }
  }

  if (!options.platform) {
    throw new Error('Missing required --platform (ios|android)');
  }

  return options as PublishOptions;
}

export async function publishCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  // Validate environment
  const envCheck = validatePublishEnv(config ?? undefined);
  if (!envCheck.valid) {
    throw new Error(
      `Missing environment variables: ${envCheck.missing.join(', ')}`
    );
  }

  const supabaseUrl = getSupabaseUrl(config ?? undefined)!;
  const serviceKey = getServiceRoleKey(config ?? undefined)!;

  // Get channel
  const channel = options.channel ?? getDefaultChannel(config ?? undefined);
  if (!channel) {
    throw new Error(
      'Missing or invalid channel. Use --channel or EXPO_PUBLIC_ENV'
    );
  }

  // Get platform
  const platform: Platform = options.platform;

  // Get runtime version
  const runtimeVersion = await deriveRuntimeVersionAsync(
    platform,
    options.runtimeVersion,
    config ?? undefined
  );
  if (!runtimeVersion) {
    throw new Error(
      'Could not derive runtimeVersion. Set VERSION_NUMBER and IOS_BUILD_NUMBER/ANDROID_BUILD_NUMBER'
    );
  }

  // Get other options
  const bucket = options.bucket ?? getBucket(config ?? undefined);
  const distDir = options.dist ?? path.join('dist', platform);
  const timestamp = options.timestamp ?? `${Math.floor(Date.now() / 1000)}`;
  const basePath = `${channel}/${platform}/${runtimeVersion}/${timestamp}`;

  console.log(`Publishing OTA update:`);
  console.log(`  Platform: ${platform}`);
  console.log(`  Channel: ${channel}`);
  console.log(`  Runtime Version: ${runtimeVersion}`);
  console.log(`  Bucket: ${bucket}`);
  console.log(`  Base Path: ${basePath}`);

  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes will be made');
  }

  // Build if needed
  if (!options.noBuild) {
    console.log(`\nBuilding update for ${platform}...`);
    if (!options.dryRun) {
      execSync(
        `npx expo export --platform ${platform} --output-dir ${distDir}`,
        {
          stdio: 'inherit',
        }
      );
    } else {
      console.log(
        `[DRY RUN] Would run: npx expo export --platform ${platform} --output-dir ${distDir}`
      );
    }
  }

  // Verify dist directory exists
  if (!fs.existsSync(distDir)) {
    throw new Error(`Dist directory not found: ${distDir}`);
  }

  // Parse metadata and collect assets
  const metadataPath = path.join(distDir, 'metadata.json');
  let bundlePath: string | null = null;
  let bundleFileName: string | null = null;
  let assets: AssetInfo[] = [];

  if (fs.existsSync(metadataPath)) {
    // New expo export format with metadata.json
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const platformMetadata = metadata?.fileMetadata?.[platform];

    if (!platformMetadata?.bundle) {
      throw new Error(`metadata.json missing bundle for ${platform}`);
    }

    bundlePath = path.join(distDir, platformMetadata.bundle);
    bundleFileName = path.basename(platformMetadata.bundle);

    const assetList = Array.isArray(platformMetadata.assets)
      ? platformMetadata.assets
      : [];

    assets = assetList.map((asset: { path: string; ext?: string }) => {
      const assetPath = path.join(distDir, asset.path);
      const ext = asset.ext ? `.${asset.ext}` : '';
      const fileName = path.basename(asset.path) + ext;
      const key = path.basename(asset.path);
      const buffer = fs.readFileSync(assetPath);
      const hash = sha256Base64Url(buffer);
      const storagePath = `${basePath}/assets/${fileName}`;

      return {
        filePath: assetPath,
        fileName,
        storagePath,
        key,
        hash,
        ext,
        contentType: contentTypeForExt(ext),
      };
    });
  } else {
    // Fallback to legacy format (bundles/ directory)
    const bundlesDir = path.join(distDir, 'bundles');
    const assetsDir = path.join(distDir, 'assets');

    if (!fs.existsSync(bundlesDir)) {
      throw new Error(`Bundles directory not found: ${bundlesDir}`);
    }

    const bundleFiles = fs
      .readdirSync(bundlesDir)
      .filter(
        (file) =>
          file.endsWith('.bundle') ||
          file.endsWith('.jsbundle') ||
          file.endsWith('.hbc') ||
          file.endsWith('.js')
      );

    if (bundleFiles.length === 0) {
      throw new Error(`No bundle files found in ${bundlesDir}`);
    }

    if (bundleFiles.length > 1) {
      console.warn(
        `Warning: Multiple bundle files found, using first: ${bundleFiles[0]}`
      );
    }

    bundleFileName = bundleFiles[0];
    bundlePath = path.join(bundlesDir, bundleFileName);

    if (fs.existsSync(assetsDir)) {
      const assetFiles = readFilesRecursive(assetsDir);

      assets = assetFiles.map((filePath) => {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const fileName = path.basename(filePath);
        const key = path.basename(filePath, ext);
        const hash = sha256Base64Url(buffer);
        const storagePath = `${basePath}/assets/${fileName}`;

        return {
          filePath,
          fileName,
          storagePath,
          key,
          hash,
          ext,
          contentType: contentTypeForExt(ext),
        };
      });
    }
  }

  if (!bundlePath || !fs.existsSync(bundlePath)) {
    throw new Error(`Bundle file not found: ${bundlePath}`);
  }

  // Calculate bundle hash
  if (!bundleFileName) {
    throw new Error('Bundle file name is required');
  }
  const bundleBuffer = fs.readFileSync(bundlePath);
  const bundleHash = sha256Base64Url(bundleBuffer);
  const bundleExt = path.extname(bundleFileName);
  const bundleKey = path.basename(bundleFileName, bundleExt);
  const bundleStoragePath = `${basePath}/bundles/${bundleFileName}`;
  const bundleContentType =
    bundleExt === '.hbc'
      ? 'application/vnd.expo.hbc'
      : 'application/javascript';

  console.log(`\nBundle: ${bundleFileName}`);
  console.log(`Assets: ${assets.length}`);

  if (options.dryRun) {
    console.log(`\n[DRY RUN] Would upload:`);
    console.log(`  Bundle: ${bundleStoragePath}`);
    assets.forEach((asset) => {
      console.log(`  Asset: ${asset.storagePath}`);
    });
    console.log('\n[DRY RUN] Would insert DB rows for update and assets');
    return;
  }

  // Upload bundle
  console.log(`\nUploading bundle...`);
  const { url: bundleUrl } = await uploadFile(
    supabaseUrl,
    serviceKey,
    bucket,
    bundleStoragePath,
    bundleBuffer,
    bundleContentType
  );
  console.log(`✓ Bundle uploaded`);

  // Upload assets (parallel with concurrency limit)
  if (assets.length > 0) {
    console.log(`Uploading ${assets.length} assets...`);
    const UPLOAD_CONCURRENCY = 5;
    let completed = 0;

    async function uploadAsset(asset: AssetInfo) {
      const buffer = fs.readFileSync(asset.filePath);
      await uploadFile(
        supabaseUrl,
        serviceKey,
        bucket,
        asset.storagePath,
        buffer,
        asset.contentType
      );
      completed++;
      process.stdout.write(
        `\r  Uploading assets... ${completed}/${assets.length}`
      );
    }

    for (let i = 0; i < assets.length; i += UPLOAD_CONCURRENCY) {
      const batch = assets.slice(i, i + UPLOAD_CONCURRENCY);
      await Promise.all(batch.map(uploadAsset));
    }
    console.log('');
  }

  // Insert update record
  console.log('Inserting update record...');
  console.log(`  Force update: ${options.forceUpdate ? 'YES' : 'NO'}`);
  console.log(`  Rollout: ${options.rollout ?? 100}%`);
  if (options.message) console.log(`  Message: ${options.message}`);

  const updatePayload: OtaUpdatePayload = {
    channel,
    platform,
    runtime_version: runtimeVersion,
    launch_asset_url: bundleUrl,
    launch_asset_key: bundleKey,
    launch_asset_hash: bundleHash,
    launch_asset_content_type: bundleContentType,
    launch_asset_storage_bucket: bucket,
    launch_asset_storage_path: bundleStoragePath,
    metadata: {},
    extra: {},
    is_active: true,
    is_mandatory: options.forceUpdate ?? false,
    rollout_percentage: options.rollout ?? 100,
    message: options.message,
    app_version: options.appVersion,
  };

  const updateId = await insertOtaUpdate(
    supabaseUrl,
    serviceKey,
    updatePayload
  );
  console.log(`✓ Update record created: ${updateId}`);

  // Insert asset records
  if (assets.length > 0) {
    console.log('Inserting asset records...');
    const assetPayloads: OtaAssetPayload[] = assets.map((asset) => ({
      update_id: updateId,
      hash: asset.hash,
      key: asset.key,
      content_type: asset.contentType,
      file_extension: asset.ext || null,
      url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURIComponent(
        asset.storagePath
      ).replace(/%2F/g, '/')}`,
      storage_bucket: bucket,
      storage_path: asset.storagePath,
    }));

    await insertOtaAssets(supabaseUrl, serviceKey, assetPayloads);
    console.log(`✓ ${assetPayloads.length} asset records created`);
  }

  console.log('\n✅ OTA publish complete!');
  console.log(`Update ID: ${updateId}`);
}
