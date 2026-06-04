// Shared OTA manifest handler used by every ota-manifest* edge function.
//
// Consolidating the per-channel functions (ota-manifest, ota-manifest-dev,
// ota-manifest-staging) into one handler avoids the drift that caused bugs
// where a fix landed in one copy but not the others. Channel-pinned functions
// pass `fixedChannel`; the generic function reads it from the request.
//
// Features:
//  - Expo Updates Protocol v1 manifest responses
//  - Gradual rollout via the get_update_with_rollout RPC (when x-device-id set)
//  - Optional signed Storage URLs (x-accept-signed-url: true), fetched in parallel
//  - Optional manifest code signing (expo-signature) when a private key is set
//  - rollBackToEmbedded directives (multipart/mixed) driven by ota_directives
//  - Device delivery tracking + success inference from the reported bundle id

import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const ALLOWED_PLATFORMS = new Set(['ios', 'android']);
const EMPTY_SFV_DICTIONARY = '';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManifestHandlerOptions {
  /** Pin the handler to a single channel (e.g. 'DEV'). When omitted the
   *  channel is read from the expo-channel-name header / query param. */
  fixedChannel?: string;
  /** Restrict accepted channels. null (default) allows any channel. */
  allowedChannels?: Set<string> | null;
}

interface ExtraInfo {
  bundleId?: string;
  shouldForceUpdate?: boolean;
  message?: string;
  rolloutPercentage?: number;
}

function getClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
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

// ---------------------------------------------------------------------------
// Code signing (optional)
// ---------------------------------------------------------------------------

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin);
}

// Import the signing key once per isolate.
let signingKeyPromise: Promise<CryptoKey | null> | undefined;

function loadSigningKey(): Promise<CryptoKey | null> {
  if (signingKeyPromise) return signingKeyPromise;
  signingKeyPromise = (async () => {
    const pem = Deno.env.get('EXPO_OTA_CODE_SIGNING_PRIVATE_KEY');
    if (!pem) return null;
    try {
      return await crypto.subtle.importKey(
        'pkcs8',
        pemToDer(pem),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );
    } catch (err) {
      console.error('Failed to import code signing key:', err);
      return null;
    }
  })();
  return signingKeyPromise;
}

/**
 * Returns the `expo-signature` structured-field value for the given bytes,
 * or null when code signing is not configured.
 */
async function signBody(bytes: Uint8Array): Promise<string | null> {
  const key = await loadSigningKey();
  if (!key) return null;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bytes);
  const keyId = Deno.env.get('EXPO_OTA_CODE_SIGNING_KEY_ID') ?? 'main';
  return `sig="${toBase64(sig)}", keyid="${keyId}", alg="rsa-v1_5-sha256"`;
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 300
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) {
      console.error('Error creating signed URL:', error);
      return null;
    }
    return data?.signedUrl ?? null;
  } catch (err) {
    console.error('Exception creating signed URL:', err);
    return null;
  }
}

async function getUpdateInfo(
  supabase: SupabaseClient,
  channel: string,
  platform: string,
  runtimeVersion: string,
  deviceId: string | null,
  currentBundleId: string | null
) {
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
    return data?.[0] ?? null;
  }

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

/** Latest active rollBackToEmbedded directive for this target, if any. */
async function getActiveDirective(
  supabase: SupabaseClient,
  channel: string,
  platform: string,
  runtimeVersion: string
) {
  const { data, error } = await supabase
    .from('ota_directives')
    .select('id, type, created_at')
    .eq('channel', channel)
    .eq('platform', platform)
    .eq('runtime_version', runtimeVersion)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist on older installs — treat as "no directive".
    return null;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

async function directiveResponse(
  type: string,
  parameters: Record<string, unknown>,
  headers: Headers
): Promise<Response> {
  const directive = JSON.stringify({ type, parameters });
  const signature = await signBody(new TextEncoder().encode(directive));

  const boundary = `expo-${crypto.randomUUID()}`;
  const partHeaders = [
    'Content-Type: application/json',
    'Content-Disposition: form-data; name="directive"',
  ];
  if (signature) partHeaders.push(`expo-signature: ${signature}`);

  const body =
    `--${boundary}\r\n` +
    `${partHeaders.join('\r\n')}\r\n\r\n` +
    `${directive}\r\n` +
    `--${boundary}--\r\n`;

  headers.set('content-type', `multipart/mixed; boundary=${boundary}`);
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export function createManifestHandler(
  options: ManifestHandlerOptions = {}
): (req: Request) => Promise<Response> {
  const supabase = getClient();
  const allowedChannels = options.allowedChannels ?? null;

  return async function handler(req: Request): Promise<Response> {
    if (req.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(req.url);

    const platform =
      req.headers.get('expo-platform') || url.searchParams.get('platform');
    const runtimeVersion =
      req.headers.get('expo-runtime-version') ||
      url.searchParams.get('runtimeVersion');
    const channel =
      options.fixedChannel ??
      normalizeChannel(
        req.headers.get('expo-channel-name') || url.searchParams.get('channel')
      );

    const deviceId =
      req.headers.get('x-device-id') || url.searchParams.get('deviceId');
    const currentBundleId =
      req.headers.get('x-bundle-id') || url.searchParams.get('bundleId');
    const acceptSignedUrl = req.headers.get('x-accept-signed-url') === 'true';

    if (!platform || !runtimeVersion) {
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
    if (allowedChannels && !allowedChannels.has(channel)) {
      return new Response('Forbidden', { status: 403 });
    }

    const headers = baseHeaders();

    // Infer success: a device reporting the bundle it is *currently* running
    // tells us a previously pending delivery of that bundle actually applied.
    if (deviceId && currentBundleId && UUID_RE.test(currentBundleId)) {
      supabase
        .rpc('mark_device_update_applied', {
          p_device_id: deviceId,
          p_current_bundle_id: currentBundleId,
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error('mark_device_update_applied failed:', error);
        });
    }

    const [update, directive] = await Promise.all([
      getUpdateInfo(
        supabase,
        channel,
        platform,
        runtimeVersion,
        deviceId,
        currentBundleId
      ),
      getActiveDirective(supabase, channel, platform, runtimeVersion),
    ]);

    // A rollback directive wins only while it is newer than the newest update,
    // so publishing a fix afterwards automatically supersedes the rollback.
    if (
      directive?.type === 'rollBackToEmbedded' &&
      (!update || new Date(directive.created_at) > new Date(update.created_at))
    ) {
      return directiveResponse(
        'rollBackToEmbedded',
        { commitTime: new Date(directive.created_at).toISOString() },
        headers
      );
    }

    if (!update) {
      return new Response(null, { status: 204, headers });
    }

    const shouldUpdate = update.should_update !== false && update.is_active;
    if (!shouldUpdate) {
      return new Response(null, { status: 204, headers });
    }

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

    let launchAssetUrl = update.launch_asset_url;
    const assetUrls: Record<string, string> = {};

    if (acceptSignedUrl) {
      const [signedLaunch, ...signedAssets] = await Promise.all([
        update.launch_asset_storage_bucket && update.launch_asset_storage_path
          ? getSignedUrl(
              supabase,
              update.launch_asset_storage_bucket,
              update.launch_asset_storage_path
            )
          : Promise.resolve(null),
        ...(assets ?? []).map(async (asset) =>
          asset.storage_bucket && asset.storage_path
            ? {
                key: asset.key,
                url: await getSignedUrl(
                  supabase,
                  asset.storage_bucket,
                  asset.storage_path
                ),
              }
            : { key: asset.key, url: null }
        ),
      ]);

      if (signedLaunch) launchAssetUrl = signedLaunch;
      for (const signed of signedAssets) {
        if (signed && signed.url) assetUrls[signed.key] = signed.url;
      }
    }

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

    const manifest = {
      id: update.id,
      createdAt: new Date(update.created_at).toISOString(),
      runtimeVersion: update.runtime_version,
      launchAsset: {
        hash: update.launch_asset_hash || undefined,
        key: update.launch_asset_key,
        contentType: update.launch_asset_content_type,
        url: launchAssetUrl,
      },
      assets: (assets ?? []).map((asset) => ({
        hash: asset.hash || undefined,
        key: asset.key,
        contentType: asset.content_type,
        fileExtension: asset.file_extension || undefined,
        url: assetUrls[asset.key] || asset.url,
      })),
      metadata: update.metadata || {},
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    };

    // Record the delivery attempt (fire and forget).
    if (deviceId) {
      supabase
        .rpc('record_device_update', {
          p_update_id: update.id,
          p_device_id: deviceId,
          p_platform: platform,
          p_bundle_id: currentBundleId || null,
          p_status: 'pending',
        })
        .then(({ error }: { error: unknown }) => {
          if (error) console.error('record_device_update failed:', error);
        });
    }

    const manifestJson = JSON.stringify(manifest);
    const signature = await signBody(new TextEncoder().encode(manifestJson));
    if (signature) headers.set('expo-signature', signature);
    headers.set('content-type', 'application/expo+json');

    return new Response(manifestJson, { status: 200, headers });
  };
}
