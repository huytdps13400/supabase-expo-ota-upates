import { loadConfig, getSupabaseUrl } from '../../utils/config';
import type { CronOptions } from '../../types';

function parseArgs(args: string[]): CronOptions {
  const options: CronOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--schedule') {
      options.schedule = args[++i];
    } else if (arg === '--cleanup-url') {
      options.cleanupUrl = args[++i];
    }
  }

  return options;
}

export async function cronCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const config = await loadConfig();

  const supabaseUrl = getSupabaseUrl(config ?? undefined);
  const cleanupUrl =
    options.cleanupUrl ?? `${supabaseUrl}/functions/v1/ota-cleanup`;
  const schedule = options.schedule ?? '0 2 * * *'; // Daily at 2 AM

  console.log(`
# Supabase OTA Cleanup Cron Job
# Add this SQL to your Supabase project to schedule automatic cleanup

# Enable required extensions (if not already enabled)
create extension if not exists "pg_cron";
create extension if not exists "pg_net";

# Create a function to call the cleanup edge function
create or replace function public.cleanup_ota_updates()
returns void
language plpgsql
security definer
as $$
begin
  perform
    net.http_post(
      url := '${cleanupUrl}',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
        'apikey', current_setting('app.settings.service_role_key', true)
      )
    );
end;
$$;

# Schedule the cleanup job (runs ${schedule})
-- For pg_cron versions that support timezone:
select cron.schedule(
  'ota-cleanup',           -- job name
  '${schedule}',           -- cron expression
  'select public.cleanup_ota_updates();'
);

# To unschedule:
-- select cron.unschedule('ota-cleanup');

# To view scheduled jobs:
-- select * from cron.job;

# Alternative: Using Supabase Edge Function with cron
# You can also set up a cron job via the Supabase Dashboard:
# 1. Go to Database -> Cron Jobs
# 2. Create a new job with the SQL above
# 3. Or use a simple HTTP trigger to the edge function
`);

  console.log(
    '\nTo set up cleanup, run the SQL above in your Supabase SQL Editor.'
  );
  console.log('The default schedule is daily at 2 AM UTC.');
  console.log(
    '\nNote: You may need to enable the pg_cron extension in your Supabase dashboard.'
  );
}
