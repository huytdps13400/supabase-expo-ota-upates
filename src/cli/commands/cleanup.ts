import {
  loadConfig,
  getSupabaseUrl,
  getServiceRoleKey,
} from '../../utils/config';
import { callCleanupEdgeFunction } from '../../utils/supabase';
import type { CleanupOptions } from '../../types';

function parseArgs(args: string[]): CleanupOptions {
  const options: CleanupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--cleanup-url') {
      options.cleanupUrl = args[++i];
    } else if (arg === '--retain-count') {
      const nextArg = args[++i];
      if (nextArg) {
        const value = parseInt(nextArg, 10);
        if (!isNaN(value)) {
          options.retainCount = value;
        }
      }
    } else if (arg === '--retain-days') {
      const nextArg = args[++i];
      if (nextArg) {
        const value = parseInt(nextArg, 10);
        if (!isNaN(value)) {
          options.retainDays = value;
        }
      }
    } else if (arg === '--config') {
      options.config = args[++i];
    }
  }

  return options;
}

export async function cleanupCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or EXPO_PUBLIC_OTA_URL');
  }

  const serviceKey = getServiceRoleKey(config ?? undefined);
  if (!serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }

  console.log('Running OTA cleanup...');

  const result = await callCleanupEdgeFunction(
    supabaseUrl,
    serviceKey,
    options.cleanupUrl ?? 'ota-cleanup'
  );

  console.log('\nCleanup complete:');
  console.log(`  Pruned updates: ${result.prunedUpdates}`);
  console.log(`  Retained count: ${result.retainedCount}`);
  console.log(`  Retention days: ${result.retentionDays}`);
  if (result.maxBatch !== undefined) {
    console.log(`  Max batch: ${result.maxBatch}`);
  }
}
