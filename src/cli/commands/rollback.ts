import {
  loadConfig,
  getSupabaseUrl,
  getServiceRoleKey,
  normalizeChannel,
  getDefaultChannel,
} from '../../utils/config';
import { listOtaUpdates, updateOtaUpdate } from '../../utils/supabase';
import type { RollbackOptions } from '../../types';

function parseArgs(args: string[]): RollbackOptions {
  const options: Partial<RollbackOptions> = {};

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
    } else if (arg === '--config') {
      options.config = args[++i];
    } else if (arg === '--to') {
      options.to = args[++i];
    }
  }

  if (!options.platform) {
    throw new Error('Missing required --platform (ios|android)');
  }

  return options as RollbackOptions;
}

export async function rollbackCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  const serviceKey = getServiceRoleKey(config ?? undefined);

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const channel = options.channel ?? getDefaultChannel(config ?? undefined);
  if (!channel) {
    throw new Error(
      'Missing or invalid channel. Use --channel or EXPO_PUBLIC_ENV'
    );
  }

  console.log(
    `Rolling back ${options.platform} updates on channel ${channel}...`
  );

  // Get active updates
  const activeUpdates = await listOtaUpdates(supabaseUrl, serviceKey, {
    channel,
    platform: options.platform,
    isActive: true,
    limit: 5,
  });

  if (activeUpdates.length === 0) {
    console.log('No active updates found. Nothing to rollback.');
    return;
  }

  const latestUpdate = activeUpdates[0]!;

  // Deactivate latest update
  console.log(`\nDeactivating update: ${latestUpdate.id.slice(0, 8)}...`);
  console.log(`  Runtime: ${latestUpdate.runtime_version}`);
  console.log(`  Created: ${new Date(latestUpdate.created_at).toISOString()}`);

  await updateOtaUpdate(supabaseUrl, serviceKey, latestUpdate.id, {
    is_active: false,
  });
  console.log('  Deactivated.');

  // Activate target update
  if (options.to) {
    // Activate specific update
    console.log(`\nActivating target update: ${options.to.slice(0, 8)}...`);
    await updateOtaUpdate(supabaseUrl, serviceKey, options.to, {
      is_active: true,
    });
    console.log('  Activated.');
  } else {
    // Find and activate previous update
    const allUpdates = await listOtaUpdates(supabaseUrl, serviceKey, {
      channel,
      platform: options.platform,
      limit: 10,
    });

    // Find the next most recent inactive update (excluding the one we just deactivated)
    const previousUpdate = allUpdates.find((u) => u.id !== latestUpdate.id);

    if (previousUpdate) {
      console.log(
        `\nActivating previous update: ${previousUpdate.id.slice(0, 8)}...`
      );
      console.log(`  Runtime: ${previousUpdate.runtime_version}`);
      console.log(
        `  Created: ${new Date(previousUpdate.created_at).toISOString()}`
      );

      await updateOtaUpdate(supabaseUrl, serviceKey, previousUpdate.id, {
        is_active: true,
      });
      console.log('  Activated.');
    } else {
      console.log(
        '\nNo previous update found to reactivate. Devices will use the embedded bundle.'
      );
    }
  }

  console.log('\nRollback complete.');
}
