import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const ALLOWED_PLATFORMS = new Set(['ios', 'android']);
const EMPTY_SFV_DICTIONARY = '';

// Expo Updates Protocol v1 Manifest Format
interface ExpoManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: {
    hash: string | undefined;
    key: string;
    contentType: string;
    url: string;
  };
  assets: Array<{
    hash: string | undefined;
    key: string;
    contentType: string;
    fileExtension: string | undefined;
    url: string;
  }>;
  metadata: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

// Extra info for advanced features (optional, in extra field)
interface ExtraInfo {
  bundleId?: string;
  shouldForceUpdate?: boolean;
  message?: string;
  rolloutPercentage?: number;
}

const baseHeaders = () =>
  new Headers({
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'expo-manifest-filters': EMPTY_SFV_DICTIONARY,
    'expo-server-defined-headers': EMPTY_SFV_DICTIONARY,
    'cache-control': 'private, max-age=0',
  });

const normalizeChannel = (raw: string | null) =>
  raw ? raw.trim().toUpperCase() : null;

/**
 * Generate signed URL for storage object (optional enhancement)
 */
async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 300
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);

    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }

    return data?.signedUrl || null;
  } catch (err) {
    console.error('Exception creating signed URL:', err);
    return null;
  }
}

/**
 * Get update info with optional rollout check
 */
async function getUpdateInfo(
  channel: string,
  platform: string,
  runtimeVersion: string,
  deviceId: string | null,
  currentBundleId: string | null
) {
  // Use RPC function if device_id provided for rollout support
  if (deviceId) {
    const { data, error } = await supabase.rpc('get_update_with_rollout', {
      p_channel: channel,
      p_platform: platform,
      p_runtime_version: runtimeVersion,
      p_device_id: deviceId,
      p_current_bundle_id: currentBundleId,
    });

    if (error) {
      console.error('RPC error:', error);
      return null;
    }

    return data?.[0] || null;
  }

  // Fallback to basic query
  const { data, error } = await supabase
    .from('ota_updates')
    .select('*')
    .eq('channel', channel)
    .eq('platform', platform)
    .eq('runtime_version', runtimeVersion)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Query error:', error);
    return null;
  }

  return data;
}

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);

  // Parse headers (Expo Updates standard headers)
  const platform =
    req.headers.get('expo-platform') || url.searchParams.get('platform');
  const runtimeVersion =
    req.headers.get('expo-runtime-version') ||
    url.searchParams.get('runtimeVersion');
  const channelRaw =
    req.headers.get('expo-channel-name') || url.searchParams.get('channel');
  const channel = normalizeChannel(channelRaw);

  // Optional headers for advanced features
  const deviceId =
    req.headers.get('x-device-id') || url.searchParams.get('deviceId');
  const currentBundleId =
    req.headers.get('x-bundle-id') || url.searchParams.get('bundleId');
  const acceptSignedUrl = req.headers.get('x-accept-signed-url') === 'true';

  console.log('[OTA Request]', {
    platform,
    runtimeVersion,
    channel,
    deviceId: deviceId ? `${deviceId.slice(0, 8)}...` : null,
    currentBundleId,
  });

  if (!platform || !runtimeVersion) {
    console.log('[OTA] Error: Missing required headers', {
      platform,
      runtimeVersion,
    });
    return new Response(
      'Missing required headers: expo-platform, expo-runtime-version',
      { status: 400 }
    );
  }

  if (!ALLOWED_PLATFORMS.has(platform)) {
    return new Response('Invalid platform', { status: 400 });
  }

  if (!channel) {
    return new Response('Forbidden', { status: 403 });
  }

  const headers = baseHeaders();

  // Get update info
  const update = await getUpdateInfo(
    channel,
    platform,
    runtimeVersion,
    deviceId,
    currentBundleId
  );

  console.log('[OTA Query Result]', {
    found: !!update,
    updateId: update?.id,
    bundleId: update?.bundle_id,
    shouldUpdate: update?.should_update,
    shouldForceUpdate: update?.should_force_update || update?.is_mandatory,
  });

  // No update available - return 204 (standard for Expo Updates)
  if (!update) {
    return new Response(null, { status: 204, headers });
  }

  // Check if should update (respect rollout and active status)
  const shouldUpdate = update.should_update !== false && update.is_active;

  // If shouldn't update (e.g., rollout excluded this device), return 204
  if (!shouldUpdate) {
    return new Response(null, { status: 204, headers });
  }

  // Get assets
  const { data: assets, error: assetsError } = await supabase
    .from('ota_assets')
    .select(
      'hash, key, content_type, file_extension, url, storage_bucket, storage_path'
    )
    .eq('update_id', update.id);

  if (assetsError) {
    console.error('ota-manifest: assets lookup failed', assetsError);
    return new Response('Server Error', { status: 500 });
  }

  // Generate signed URLs if requested
  let launchAssetUrl = update.launch_asset_url;
  const assetUrls: Record<string, string> = {};

  if (acceptSignedUrl) {
    // Generate signed URL for launch asset
    const signedLaunchUrl = await getSignedUrl(
      update.launch_asset_storage_bucket,
      update.launch_asset_storage_path,
      300 // 5 minutes
    );
    if (signedLaunchUrl) {
      launchAssetUrl = signedLaunchUrl;
    }

    // Generate signed URLs for assets
    for (const asset of assets || []) {
      if (asset.storage_bucket && asset.storage_path) {
        const signedUrl = await getSignedUrl(
          asset.storage_bucket,
          asset.storage_path,
          300
        );
        if (signedUrl) {
          assetUrls[asset.key] = signedUrl;
        }
      }
    }
  }

  // Build extra info for advanced features
  const extra: ExtraInfo = {};
  if (update.bundle_id) extra.bundleId = update.bundle_id;
  if (update.is_mandatory) extra.shouldForceUpdate = true;
  if (update.message) extra.message = update.message;
  if (
    update.rollout_percentage !== undefined &&
    update.rollout_percentage !== 100
  ) {
    extra.rolloutPercentage = update.rollout_percentage;
  }

  // Build Expo Updates Protocol v1 Manifest
  const manifest: ExpoManifest = {
    id: update.id,
    createdAt: new Date(update.created_at).toISOString(),
    runtimeVersion: update.runtime_version,
    launchAsset: {
      hash: update.launch_asset_hash || undefined,
      key: update.launch_asset_key,
      contentType: update.launch_asset_content_type,
      url: launchAssetUrl,
    },
    assets: (assets || []).map((asset) => ({
      hash: asset.hash || undefined,
      key: asset.key,
      contentType: asset.content_type,
      fileExtension: asset.file_extension || undefined,
      url: assetUrls[asset.key] || asset.url,
    })),
    metadata: update.metadata || {},
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };

  // Record device update attempt (fire and forget)
  if (deviceId) {
    supabase
      .rpc('record_device_update', {
        p_update_id: update.id,
        p_device_id: deviceId,
        p_platform: platform,
        p_bundle_id: currentBundleId || null,
        p_status: 'pending',
      })
      .catch((err: Error) => {
        console.error('Failed to record device update:', err.message);
      });
  }

  headers.set('content-type', 'application/expo+json');

  // Return standard Expo Updates manifest
  return new Response(JSON.stringify(manifest), { status: 200, headers });
});
