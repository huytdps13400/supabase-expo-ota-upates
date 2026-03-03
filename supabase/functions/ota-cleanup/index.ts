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

const RETAIN_COUNT = Number(Deno.env.get('OTA_RETAIN_COUNT') ?? '3');
const RETAIN_DAYS = Number(Deno.env.get('OTA_RETAIN_DAYS') ?? '7');
const MAX_UPDATES = Number(Deno.env.get('OTA_CLEANUP_MAX') ?? '50');
const CRON_SECRET = Deno.env.get('OTA_CLEANUP_SECRET');

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  if (CRON_SECRET) {
    const provided = req.headers.get('x-cron-secret');
    if (provided !== CRON_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);

  const { data: candidates, error } = await supabase.rpc(
    'ota_cleanup_candidates',
    {
      p_retain_count: RETAIN_COUNT,
      p_cutoff: cutoff.toISOString(),
    }
  );

  if (error) {
    console.error('ota-cleanup: failed to load candidates', error);
    return new Response('Server Error', { status: 500 });
  }

  const updates = (candidates ?? []).slice(0, MAX_UPDATES);

  if (updates.length === 0) {
    return new Response(
      JSON.stringify({
        prunedUpdates: 0,
        retainedCount: RETAIN_COUNT,
        retentionDays: RETAIN_DAYS,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  let pruned = 0;

  for (const update of updates) {
    const updateId = update.update_id as string | undefined;
    const launchBucket = update.launch_bucket as string | undefined;
    const launchPath = update.launch_path as string | undefined;

    if (!updateId) {
      continue;
    }

    const { data: assets, error: assetsError } = await supabase
      .from('ota_assets')
      .select('storage_bucket, storage_path')
      .eq('update_id', updateId);

    if (assetsError) {
      console.error('ota-cleanup: failed to load assets', assetsError);
      continue;
    }

    const bucketMap = new Map<string, string[]>();

    for (const asset of assets ?? []) {
      if (!asset.storage_bucket || !asset.storage_path) {
        continue;
      }
      const paths = bucketMap.get(asset.storage_bucket) ?? [];
      paths.push(asset.storage_path);
      bucketMap.set(asset.storage_bucket, paths);
    }

    if (launchBucket && launchPath) {
      const paths = bucketMap.get(launchBucket) ?? [];
      paths.push(launchPath);
      bucketMap.set(launchBucket, paths);
    }

    let storageFailed = false;

    for (const [bucket, paths] of bucketMap.entries()) {
      for (const chunk of chunkArray(paths, 1000)) {
        const { error: storageError } = await supabase.storage
          .from(bucket)
          .remove(chunk);
        if (storageError) {
          console.error('ota-cleanup: storage delete failed', storageError);
          storageFailed = true;
          break;
        }
      }
      if (storageFailed) {
        break;
      }
    }

    if (storageFailed) {
      continue;
    }

    const { error: assetDeleteError } = await supabase
      .from('ota_assets')
      .delete()
      .eq('update_id', updateId);

    if (assetDeleteError) {
      console.error('ota-cleanup: failed to delete assets', assetDeleteError);
      continue;
    }

    const { error: updateDeleteError } = await supabase
      .from('ota_updates')
      .delete()
      .eq('id', updateId);

    if (updateDeleteError) {
      console.error('ota-cleanup: failed to delete update', updateDeleteError);
      continue;
    }

    pruned += 1;
  }

  return new Response(
    JSON.stringify({
      prunedUpdates: pruned,
      retainedCount: RETAIN_COUNT,
      retentionDays: RETAIN_DAYS,
      maxBatch: MAX_UPDATES,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
});
