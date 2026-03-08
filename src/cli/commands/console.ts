import * as readline from 'readline';
import {
  loadConfig,
  getSupabaseUrl,
  getServiceRoleKey,
  getDefaultChannel,
} from '../../utils/config';

interface ConsoleState {
  supabaseUrl: string;
  serviceKey: string;
  channel: string | null;
}

function parseArgs(args: string[]): { config?: string } {
  const options: { config?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config') {
      options.config = args[++i];
    }
  }
  return options;
}

async function fetchUpdates(
  state: ConsoleState,
  filters: {
    platform?: string;
    channel?: string;
    limit?: number;
    isActive?: boolean;
  }
) {
  const params = new URLSearchParams();
  params.set(
    'select',
    'id,created_at,channel,platform,runtime_version,is_active,is_mandatory,rollout_percentage,message,app_version'
  );
  params.set('order', 'created_at.desc');
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.channel) params.set('channel', `eq.${filters.channel}`);
  if (filters.platform) params.set('platform', `eq.${filters.platform}`);
  if (filters.isActive !== undefined)
    params.set('is_active', `eq.${filters.isActive}`);

  const res = await fetch(
    `${state.supabaseUrl}/rest/v1/ota_updates?${params}`,
    {
      headers: {
        Authorization: `Bearer ${state.serviceKey}`,
        apikey: state.serviceKey,
      },
    }
  );

  if (!res.ok) throw new Error(`Failed to fetch updates: ${res.status}`);
  return res.json();
}

async function toggleUpdate(
  state: ConsoleState,
  updateId: string,
  isActive: boolean
) {
  const res = await fetch(
    `${state.supabaseUrl}/rest/v1/ota_updates?id=eq.${updateId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${state.serviceKey}`,
        'apikey': state.serviceKey,
        'content-type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ is_active: isActive }),
    }
  );

  if (!res.ok) throw new Error(`Failed to update: ${res.status}`);
  return res.json();
}

function padEnd(str: string, len: number): string {
  return str.length >= len
    ? str.slice(0, len)
    : str + ' '.repeat(len - str.length);
}

function formatTable(updates: any[]) {
  if (updates.length === 0) {
    console.log('  No updates found.\n');
    return;
  }

  const header = `  ${padEnd('ID', 10)}| ${padEnd('Created', 21)}| ${padEnd(
    'Platform',
    10
  )}| ${padEnd('Channel', 9)}| ${padEnd('Version', 13)}| ${padEnd(
    'Rollout',
    9
  )}| ${padEnd('Status', 10)}| Message`;
  const divider = '  ' + '-'.repeat(header.length - 2);
  console.log(header);
  console.log(divider);

  for (const u of updates) {
    const id = padEnd((u.id || '').slice(0, 8), 10);
    const created = padEnd(
      new Date(u.created_at).toISOString().replace('T', ' ').slice(0, 19),
      21
    );
    const platform = padEnd(u.platform || '', 10);
    const channel = padEnd(u.channel || '', 9);
    const version = padEnd(u.runtime_version || '', 13);
    const rollout = padEnd(`${u.rollout_percentage ?? 100}%`, 9);
    const status = padEnd(u.is_active ? 'active' : 'inactive', 10);
    const message = (u.message || '-').slice(0, 30);
    console.log(
      `  ${id}| ${created}| ${platform}| ${channel}| ${version}| ${rollout}| ${status}| ${message}`
    );
  }
  console.log('');
}

export async function consoleCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig(options.config);

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  const serviceKey = getServiceRoleKey(config ?? undefined);

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const state: ConsoleState = {
    supabaseUrl,
    serviceKey,
    channel: getDefaultChannel(config ?? undefined),
  };

  console.log('\nSupabase OTA Updates Console\n');
  console.log(`  URL:     ${supabaseUrl}`);
  console.log(`  Channel: ${state.channel || 'all'}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

  const showMenu = () => {
    console.log('Commands:');
    console.log('  [1] List recent updates');
    console.log('  [2] List active updates');
    console.log('  [3] Deactivate an update');
    console.log('  [4] Activate an update');
    console.log('  [5] Filter by platform');
    console.log('  [6] Filter by channel');
    console.log('  [7] View update details');
    console.log('  [q] Quit\n');
  };

  let platformFilter: string | undefined;
  let channelFilter: string | undefined = state.channel || undefined;

  showMenu();

  while (true) {
    const choice = await ask('> ');

    try {
      switch (choice) {
        case '1': {
          const updates = await fetchUpdates(state, {
            platform: platformFilter,
            channel: channelFilter,
            limit: 20,
          });
          formatTable(updates);
          break;
        }
        case '2': {
          const updates = await fetchUpdates(state, {
            platform: platformFilter,
            channel: channelFilter,
            limit: 20,
            isActive: true,
          });
          formatTable(updates);
          break;
        }
        case '3': {
          const id = await ask('  Update ID to deactivate: ');
          if (id) {
            await toggleUpdate(state, id, false);
            console.log(`  Update ${id.slice(0, 8)} deactivated\n`);
          }
          break;
        }
        case '4': {
          const id = await ask('  Update ID to activate: ');
          if (id) {
            await toggleUpdate(state, id, true);
            console.log(`  Update ${id.slice(0, 8)} activated\n`);
          }
          break;
        }
        case '5': {
          const p = await ask('  Platform (ios/android/all): ');
          platformFilter = p === 'all' ? undefined : p || undefined;
          console.log(`  Filter: platform=${platformFilter || 'all'}\n`);
          break;
        }
        case '6': {
          const c = await ask('  Channel (or "all"): ');
          channelFilter =
            c === 'all' ? undefined : c.toUpperCase() || undefined;
          console.log(`  Filter: channel=${channelFilter || 'all'}\n`);
          break;
        }
        case '7': {
          const id = await ask('  Update ID: ');
          if (id) {
            const res = await fetch(
              `${state.supabaseUrl}/rest/v1/ota_updates?id=eq.${id}&select=*`,
              {
                headers: {
                  Authorization: `Bearer ${state.serviceKey}`,
                  apikey: state.serviceKey,
                },
              }
            );
            const updates = await res.json();
            if (updates.length > 0) {
              console.log(JSON.stringify(updates[0], null, 2));
              console.log('');
            } else {
              console.log('  Update not found\n');
            }
          }
          break;
        }
        case 'q':
        case 'quit':
        case 'exit': {
          rl.close();
          return;
        }
        case 'help':
        case 'h':
        case '?': {
          showMenu();
          break;
        }
        default: {
          if (choice)
            console.log('  Unknown command. Type "help" for options.\n');
          break;
        }
      }
    } catch (err) {
      console.error(
        `  Error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }
}
