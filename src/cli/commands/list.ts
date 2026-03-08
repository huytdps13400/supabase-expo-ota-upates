import {
  loadConfig,
  getSupabaseUrl,
  getServiceRoleKey,
  normalizeChannel,
} from '../../utils/config';
import { listOtaUpdates } from '../../utils/supabase';
import type { ListOptions } from '../../types';

function parseArgs(args: string[]): ListOptions {
  const options: ListOptions = {};

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
    } else if (arg === '--limit') {
      options.limit = parseInt(args[++i]!, 10);
    } else if (arg === '--offset') {
      options.offset = parseInt(args[++i]!, 10);
    } else if (arg === '--active') {
      options.active = true;
    } else if (arg === '--format') {
      const value = args[++i];
      if (value === 'json' || value === 'table') {
        options.format = value;
      }
    } else if (arg === '--config') {
      options.config = args[++i];
    }
  }

  return options;
}

function padEnd(str: string, len: number): string {
  return str.length >= len
    ? str.slice(0, len)
    : str + ' '.repeat(len - str.length);
}

function formatTable(updates: any[]): void {
  if (updates.length === 0) {
    console.log('No updates found.');
    return;
  }

  const header = `${padEnd('ID', 10)}| ${padEnd('Created', 21)}| ${padEnd(
    'Platform',
    10
  )}| ${padEnd('Channel', 13)}| ${padEnd('Version', 13)}| ${padEnd(
    'Rollout',
    9
  )}| ${padEnd('Status', 10)}| Message`;
  const divider = '-'.repeat(header.length + 10);

  console.log(header);
  console.log(divider);

  for (const u of updates) {
    const id = padEnd((u.id || '').slice(0, 8), 10);
    const created = padEnd(
      new Date(u.created_at).toISOString().replace('T', ' ').slice(0, 19),
      21
    );
    const platform = padEnd(u.platform || '', 10);
    const channel = padEnd(u.channel || '', 13);
    const version = padEnd(u.runtime_version || '', 13);
    const rollout = padEnd(`${u.rollout_percentage ?? 100}%`, 9);
    const status = padEnd(u.is_active ? 'active' : 'inactive', 10);
    const message = (u.message || '-').slice(0, 40);

    console.log(
      `${id}| ${created}| ${platform}| ${channel}| ${version}| ${rollout}| ${status}| ${message}`
    );
  }

  console.log(`\nTotal: ${updates.length} update(s)`);
}

export async function listCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  const serviceKey = getServiceRoleKey(config ?? undefined);

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const updates = await listOtaUpdates(supabaseUrl, serviceKey, {
    channel: options.channel ?? undefined,
    platform: options.platform ?? undefined,
    isActive: options.active ?? undefined,
    limit: options.limit ?? 20,
    offset: options.offset ?? undefined,
  });

  if (options.format === 'json') {
    console.log(JSON.stringify(updates, null, 2));
  } else {
    console.log('');
    formatTable(updates);
    console.log('');
  }
}
