import { encodePath } from './crypto';
import { sleep } from './files';
import type {
  OtaUpdatePayload,
  OtaAssetPayload,
  OtaUpdateRecord,
} from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

interface UploadResult {
  url: string;
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  storagePath: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<UploadResult> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodePath(
    storagePath
  )}`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-upsert': 'true',
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: fileBuffer as unknown as BodyInit,
      });

      if (!res.ok) {
        const body = await res.text();
        const message = `Upload failed ${res.status}: ${body}`;

        // Retry on server errors
        if (
          [500, 502, 503, 504, 522].includes(res.status) &&
          attempt < MAX_RETRIES
        ) {
          lastError = new Error(message);
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }

        throw new Error(message);
      }

      return {
        url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodePath(
          storagePath
        )}`,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw lastError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return {
    url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodePath(
      storagePath
    )}`,
  };
}

/**
 * Insert OTA update record
 */
export async function insertOtaUpdate(
  supabaseUrl: string,
  serviceKey: string,
  payload: OtaUpdatePayload
): Promise<string> {
  const url = `${supabaseUrl}/rest/v1/ota_updates`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
    'Prefer': 'return=representation',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Insert ota_updates failed ${res.status}: ${body}`);
  }

  const rows = await res.json();
  const updateId = rows[0]?.id;

  if (!updateId) {
    throw new Error('Insert ota_updates did not return id');
  }

  return updateId;
}

/**
 * Insert OTA asset records
 */
export async function insertOtaAssets(
  supabaseUrl: string,
  serviceKey: string,
  assets: OtaAssetPayload[]
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ota_assets`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
  };

  // Insert in batches of 200
  const batches: OtaAssetPayload[][] = [];
  for (let i = 0; i < assets.length; i += 200) {
    batches.push(assets.slice(i, i + 200));
  }

  for (const batch of batches) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Insert ota_assets failed ${res.status}: ${body}`);
    }
  }
}

/**
 * Call cleanup edge function
 */
export async function callCleanupEdgeFunction(
  supabaseUrl: string,
  serviceKey: string,
  cleanupPath: string = 'ota-cleanup'
): Promise<{
  prunedUpdates: number;
  retainedCount: number;
  retentionDays: number;
  maxBatch?: number;
}> {
  const url = `${supabaseUrl}/functions/v1/${cleanupPath}`;
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cleanup failed ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * List OTA updates with filters
 */
export async function listOtaUpdates(
  supabaseUrl: string,
  serviceKey: string,
  filters: {
    channel?: string;
    platform?: string;
    runtimeVersion?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<OtaUpdateRecord[]> {
  const params = new URLSearchParams();
  params.set(
    'select',
    'id,created_at,channel,platform,runtime_version,is_active,is_mandatory,rollout_percentage,message,app_version,bundle_id,launch_asset_key'
  );
  params.set('order', 'created_at.desc');

  if (filters.channel) params.set('channel', `eq.${filters.channel}`);
  if (filters.platform) params.set('platform', `eq.${filters.platform}`);
  if (filters.runtimeVersion)
    params.set('runtime_version', `eq.${filters.runtimeVersion}`);
  if (filters.isActive !== undefined)
    params.set('is_active', `eq.${filters.isActive}`);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));

  const url = `${supabaseUrl}/rest/v1/ota_updates?${params}`;
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`List ota_updates failed ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Update an OTA update record
 */
export async function updateOtaUpdate(
  supabaseUrl: string,
  serviceKey: string,
  updateId: string,
  patch: Partial<{ is_active: boolean }>
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ota_updates?id=eq.${updateId}`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
    'Prefer': 'return=representation',
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update ota_updates failed ${res.status}: ${body}`);
  }
}

/**
 * Get update stats (device update tracking)
 */
export async function getUpdateStats(
  supabaseUrl: string,
  serviceKey: string,
  updateId: string
): Promise<{
  total_devices: number;
  pending: number;
  applied: number;
  failed: number;
} | null> {
  const url = `${supabaseUrl}/rest/v1/rpc/get_update_stats`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_update_id: updateId }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Test manifest endpoint
 */
export async function testManifestEndpoint(
  otaUrl: string,
  platform: string,
  runtimeVersion: string,
  channel: string
): Promise<{ success: boolean; status: number; error?: string }> {
  try {
    const url = new URL(otaUrl);

    const headers = new Headers({
      'expo-platform': platform,
      'expo-runtime-version': runtimeVersion,
      'expo-channel-name': channel,
    });

    const res = await fetch(url.toString(), { headers });

    return {
      success: res.ok || res.status === 204,
      status: res.status,
    };
  } catch (err) {
    return {
      success: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
