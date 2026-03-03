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

const baseHeaders = () =>
  new Headers({
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
    'expo-manifest-filters': EMPTY_SFV_DICTIONARY,
    'expo-server-defined-headers': EMPTY_SFV_DICTIONARY,
    'cache-control': 'private, max-age=0',
  });

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const platform = req.headers.get('expo-platform');
  const runtimeVersion = req.headers.get('expo-runtime-version');

  console.log('[OTA DEV] Request:', {
    platform,
    runtimeVersion,
    headers: Object.fromEntries(req.headers.entries()),
  });

  if (!platform || !runtimeVersion) {
    return new Response(
      'Missing required headers: expo-platform, expo-runtime-version',
      { status: 400 }
    );
  }

  if (!ALLOWED_PLATFORMS.has(platform)) {
    return new Response('Invalid platform', { status: 400 });
  }

  const { data: update, error } = await supabase
    .from('ota_updates')
    .select(
      'id, created_at, runtime_version, launch_asset_url, launch_asset_key, launch_asset_hash, launch_asset_content_type, metadata, extra'
    )
    .eq('channel', 'DEV')
    .eq('platform', platform)
    .eq('runtime_version', runtimeVersion)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[OTA DEV] Query failed:', error);
    return new Response('Server Error', { status: 500 });
  }

  console.log('[OTA DEV] Result:', { found: !!update, updateId: update?.id });

  const headers = baseHeaders();

  if (!update) {
    return new Response(null, { status: 204, headers });
  }

  const { data: assets, error: assetsError } = await supabase
    .from('ota_assets')
    .select('hash, key, content_type, file_extension, url')
    .eq('update_id', update.id);

  if (assetsError) {
    console.error('[OTA DEV] Assets query failed:', assetsError);
    return new Response('Server Error', { status: 500 });
  }

  const manifest = {
    id: update.id,
    createdAt: new Date(update.created_at).toISOString(),
    runtimeVersion: update.runtime_version,
    launchAsset: {
      hash: update.launch_asset_hash ?? undefined,
      key: update.launch_asset_key,
      contentType: update.launch_asset_content_type,
      url: update.launch_asset_url,
    },
    assets: (assets ?? []).map((asset) => ({
      hash: asset.hash ?? undefined,
      key: asset.key,
      contentType: asset.content_type,
      fileExtension: asset.file_extension ?? undefined,
      url: asset.url,
    })),
    metadata: update.metadata ?? {},
    extra: update.extra ?? {},
  };

  headers.set('content-type', 'application/expo+json');

  return new Response(JSON.stringify(manifest), { status: 200, headers });
});
