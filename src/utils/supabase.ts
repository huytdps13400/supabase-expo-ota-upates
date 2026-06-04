import { encodePath } from './crypto';
import { sleep } from './files';
import type {
  OtaUpdatePayload,
  OtaAssetPayload,
  OtaUpdateRecord,
} from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

/** HTTP status codes that are safe to retry (transient server/network errors). */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504, 522]);

interface UploadResult {
  url: string;
}

/**
 * Perform a fetch with retry + exponential backoff on transient failures.
 *
 * Retries on thrown network errors and on retryable HTTP status codes
 * (5xx). Non-retryable responses (e.g. 4xx) are returned to the caller as-is
 * so it can inspect the status/body. Used by all REST/RPC helpers below so
 * retry behaviour is consistent instead of being duplicated per call.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; delayMs?: number } = {}
): Promise<Response> {
  const retries = opts.retries ?? MAX_RETRIES;
  const delayMs = opts.delayMs ?? RETRY_DELAY_MS;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);

      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(delayMs * attempt);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(delayMs * attempt);
        continue;
      }
      throw lastError;
    }
  }

  // Unreachable in practice (loop either returns or throws), but keeps the
  // type checker satisfied that we never fall through without a value.
  throw lastError ?? new Error('fetchWithRetry: exhausted retries');
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
  contentType: string,
  opts: { contentEncoding?: string } = {}
): Promise<UploadResult> {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodePath(
    storagePath
  )}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-upsert': 'true',
  };
  // When the stored bytes are compressed, Supabase Storage echoes this header
  // back so HTTP clients transparently decompress — the hash in the manifest
  // still matches the original (decompressed) bundle.
  if (opts.contentEncoding) {
    headers['content-encoding'] = opts.contentEncoding;
  }

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: fileBuffer as unknown as BodyInit,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed ${res.status}: ${body}`);
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

  const res = await fetchWithRetry(url, {
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
    const res = await fetchWithRetry(url, {
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

  const res = await fetchWithRetry(url, { headers });

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

  const res = await fetchWithRetry(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Update ota_updates failed ${res.status}: ${body}`);
  }
}

export interface UpdateStats {
  total_devices: number;
  applied: number;
  failed: number;
  pending: number;
}

/**
 * Get update stats (device update tracking).
 *
 * Normalizes the columns returned by the `get_update_stats` RPC
 * (`total_devices`, `successful_updates`, `failed_updates`,
 * `pending_updates`) into a stable shape. Returns null if the RPC is
 * unavailable or errors.
 */
export async function getUpdateStats(
  supabaseUrl: string,
  serviceKey: string,
  updateId: string
): Promise<UpdateStats | null> {
  const url = `${supabaseUrl}/rest/v1/rpc/get_update_stats`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
  };

  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_update_id: updateId }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const row = data?.[0];
    if (!row) return null;

    return {
      total_devices: Number(row.total_devices ?? 0),
      applied: Number(row.successful_updates ?? row.applied ?? 0),
      failed: Number(row.failed_updates ?? row.failed ?? 0),
      pending: Number(row.pending_updates ?? row.pending ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Insert a rollBackToEmbedded directive for one runtime version.
 *
 * Clients on the matching channel/platform/runtimeVersion will be instructed to
 * roll back to their embedded bundle until a newer update (or no active
 * directive) supersedes it.
 */
export async function insertRollbackDirective(
  supabaseUrl: string,
  serviceKey: string,
  target: {
    channel: string;
    platform: string;
    runtimeVersion: string;
    message?: string;
  }
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ota_directives`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
  };

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      channel: target.channel,
      platform: target.platform,
      runtime_version: target.runtimeVersion,
      type: 'rollBackToEmbedded',
      is_active: true,
      message: target.message ?? null,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Insert ota_directives failed ${res.status}: ${body}`);
  }
}

/**
 * Deactivate all active rollback directives for a channel/platform.
 */
export async function clearRollbackDirectives(
  supabaseUrl: string,
  serviceKey: string,
  channel: string,
  platform: string
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/ota_directives?channel=eq.${channel}&platform=eq.${platform}&is_active=eq.true`;
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'content-type': 'application/json',
  };

  const res = await fetchWithRetry(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ is_active: false }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clear ota_directives failed ${res.status}: ${body}`);
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
