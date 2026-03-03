import { encodePath } from './crypto';
import { sleep } from './files';
import type { OtaUpdatePayload, OtaAssetPayload } from '../types';

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
