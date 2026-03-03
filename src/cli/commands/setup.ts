import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  createConfigContent,
  createEnvExample,
  findConfigFile,
} from '../../utils/config';

const MIGRATION_SQL = `-- Enable pgcrypto extension
create extension if not exists "pgcrypto";

-- Create ota_updates table
-- Note: Channel can be any custom value (e.g., 'production', 'staging', 'beta')
-- You can add a CHECK constraint if you want to limit allowed channels:
-- CHECK (channel in ('PRODUCTION', 'STAGING', 'BETA'))
create table if not exists ota_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel text not null,
  platform text not null check (platform in ('ios', 'android')),
  runtime_version text not null,
  launch_asset_url text not null,
  launch_asset_key text not null,
  launch_asset_hash text,
  launch_asset_content_type text not null default 'application/javascript',
  launch_asset_storage_bucket text not null,
  launch_asset_storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  is_active boolean not null default true
);

-- Create ota_assets table
create table if not exists ota_assets (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references ota_updates(id) on delete cascade,
  hash text,
  key text not null,
  content_type text not null,
  file_extension text,
  url text not null,
  storage_bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Create indexes for efficient lookups
create index if not exists ota_updates_lookup
  on ota_updates (channel, platform, runtime_version, created_at desc);

create index if not exists ota_updates_active_lookup
  on ota_updates (channel, platform, runtime_version, created_at desc)
  where is_active;

create index if not exists ota_assets_update_id
  on ota_assets (update_id);

-- Create cleanup function
create or replace function ota_cleanup_candidates(
  p_retain_count int,
  p_cutoff timestamptz
) returns table (
  update_id uuid,
  launch_bucket text,
  launch_path text
) language sql stable as $$
  with ranked as (
    select
      id,
      launch_asset_storage_bucket as launch_bucket,
      launch_asset_storage_path as launch_path,
      created_at,
      row_number() over (
        partition by channel, platform, runtime_version
        order by created_at desc
      ) as rn
    from ota_updates
  )
  select id, launch_bucket, launch_path
  from ranked
  where rn > p_retain_count
    and created_at < p_cutoff;
$$;
`;

const OTA_MANIFEST_FUNCTION = `import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Configure allowed channels here
// Set to null to allow any channel, or use a Set for specific channels:
// const ALLOWED_CHANNELS = new Set(["PRODUCTION", "STAGING", "BETA"]);
const ALLOWED_CHANNELS: Set<string> | null = null;

// Helper to validate channels
const isValidChannel = (channel: string | null): boolean => {
  if (!channel) return false;
  if (ALLOWED_CHANNELS === null) return true;
  return ALLOWED_CHANNELS.has(channel);
};
const ALLOWED_PLATFORMS = new Set(["ios", "android"]);
const EMPTY_SFV_DICTIONARY = "";

const baseHeaders = () =>
  new Headers({
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
    "expo-manifest-filters": EMPTY_SFV_DICTIONARY,
    "expo-server-defined-headers": EMPTY_SFV_DICTIONARY,
    "cache-control": "private, max-age=0",
  });

const normalizeChannel = (raw: string | null) =>
  raw ? raw.trim().toUpperCase() : null;

serve(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  
  const platform = req.headers.get("expo-platform") || url.searchParams.get("platform");
  const runtimeVersion = req.headers.get("expo-runtime-version") || url.searchParams.get("runtimeVersion");
  const channelRaw = req.headers.get("expo-channel-name") || url.searchParams.get("channel");
  const channel = normalizeChannel(channelRaw);

  console.log("[OTA Request]", {
    platform,
    runtimeVersion,
    channel,
    headers: Object.fromEntries(req.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
  });

  if (!platform || !runtimeVersion) {
    console.log("[OTA] Error: Missing required headers", { platform, runtimeVersion });
    return new Response("Missing required headers: expo-platform, expo-runtime-version", { status: 400 });
  }

  if (!ALLOWED_PLATFORMS.has(platform)) {
    return new Response("Invalid platform", { status: 400 });
  }

  if (!channel || !isValidChannel(channel)) {
    console.log("[OTA] Invalid or forbidden channel:", channel);
    return new Response("Forbidden", { status: 403 });
  }

  const { data: update, error } = await supabase
    .from("ota_updates")
    .select(
      "id, created_at, runtime_version, launch_asset_url, launch_asset_key, launch_asset_hash, launch_asset_content_type, metadata, extra"
    )
    .eq("channel", channel)
    .eq("platform", platform)
    .eq("runtime_version", runtimeVersion)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("ota-manifest: update lookup failed", error);
    return new Response("Server Error", { status: 500 });
  }

  console.log("[OTA Query Result]", { 
    found: !!update, 
    updateId: update?.id,
    query: { channel, platform, runtimeVersion }
  });

  const headers = baseHeaders();

  if (!update) {
    return new Response(null, { status: 204, headers });
  }

  const { data: assets, error: assetsError } = await supabase
    .from("ota_assets")
    .select("hash, key, content_type, file_extension, url")
    .eq("update_id", update.id);

  if (assetsError) {
    console.error("ota-manifest: assets lookup failed", assetsError);
    return new Response("Server Error", { status: 500 });
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

  headers.set("content-type", "application/expo+json");

  return new Response(JSON.stringify(manifest), { status: 200, headers });
});
`;

const OTA_CLEANUP_FUNCTION = `import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const RETAIN_COUNT = Number(Deno.env.get("OTA_RETAIN_COUNT") ?? "3");
const RETAIN_DAYS = Number(Deno.env.get("OTA_RETAIN_DAYS") ?? "7");
const MAX_UPDATES = Number(Deno.env.get("OTA_CLEANUP_MAX") ?? "50");
const CRON_SECRET = Deno.env.get("OTA_CLEANUP_SECRET");

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000);

  const { data: candidates, error } = await supabase.rpc(
    "ota_cleanup_candidates",
    {
      p_retain_count: RETAIN_COUNT,
      p_cutoff: cutoff.toISOString(),
    }
  );

  if (error) {
    console.error("ota-cleanup: failed to load candidates", error);
    return new Response("Server Error", { status: 500 });
  }

  const updates = (candidates ?? []).slice(0, MAX_UPDATES);

  if (updates.length === 0) {
    return new Response(
      JSON.stringify({
        prunedUpdates: 0,
        retainedCount: RETAIN_COUNT,
        retentionDays: RETAIN_DAYS,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
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
      .from("ota_assets")
      .select("storage_bucket, storage_path")
      .eq("update_id", updateId);

    if (assetsError) {
      console.error("ota-cleanup: failed to load assets", assetsError);
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
          console.error("ota-cleanup: storage delete failed", storageError);
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
      .from("ota_assets")
      .delete()
      .eq("update_id", updateId);

    if (assetDeleteError) {
      console.error("ota-cleanup: failed to delete assets", assetDeleteError);
      continue;
    }

    const { error: updateDeleteError } = await supabase
      .from("ota_updates")
      .delete()
      .eq("id", updateId);

    if (updateDeleteError) {
      console.error("ota-cleanup: failed to delete update", updateDeleteError);
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
    { status: 200, headers: { "content-type": "application/json" } }
  );
});
`;

function checkSupabaseCLI(): boolean {
  try {
    execSync('supabase --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getProjectId(supabaseUrl: string): string | null {
  try {
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Read project_id from supabase/config.toml
 */
function readConfigToml(): { projectId?: string; isLinked: boolean } {
  const configPath = path.resolve(process.cwd(), 'supabase', 'config.toml');

  if (!fs.existsSync(configPath)) {
    return { isLinked: false };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');

    // Parse project_id from config.toml
    // Format: project_id = "abc123xyz"
    const projectIdMatch = content.match(/project_id\s*=\s*"([^"]+)"/);
    const projectId = projectIdMatch?.[1];

    // Check if project is linked (has a valid project_id that's not empty)
    const isLinked =
      !!projectId &&
      projectId.length > 0 &&
      !projectId.includes('your-project');

    return { projectId, isLinked };
  } catch {
    return { isLinked: false };
  }
}

interface SetupOptions {
  supabaseUrl?: string;
  serviceKey?: string;
  force?: boolean;
  skipMigrations?: boolean;
  skipFunctions?: boolean;
  skipLink?: boolean;
  skipConfig?: boolean;
  deploy?: boolean;
  skipDeploy?: boolean;
}

function parseArgs(args: string[]): SetupOptions {
  const options: SetupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--supabase-url') {
      options.supabaseUrl = args[++i];
    } else if (arg === '--service-key') {
      options.serviceKey = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--skip-migrations') {
      options.skipMigrations = true;
    } else if (arg === '--skip-functions') {
      options.skipFunctions = true;
    } else if (arg === '--skip-link') {
      options.skipLink = true;
    } else if (arg === '--skip-config') {
      options.skipConfig = true;
    } else if (arg === '--deploy') {
      options.deploy = true;
    } else if (arg === '--skip-deploy') {
      options.skipDeploy = true;
    }
  }

  return options;
}

export async function setupCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const shouldDeploy = options.deploy === true && options.skipDeploy !== true;

  console.log('🚀 Setting up Supabase OTA Infrastructure\n');

  // Check Supabase CLI
  if (!checkSupabaseCLI()) {
    console.error('❌ Supabase CLI is not installed.');
    console.log('\nPlease install it first:');
    console.log('  npm install -g supabase');
    console.log(
      '\nOr visit: https://supabase.com/docs/guides/cli/getting-started'
    );
    process.exit(1);
  }
  console.log('✓ Supabase CLI detected');

  // Get Supabase credentials
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const serviceKey =
    options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ Missing Supabase URL.');
    console.log('\nPlease set:');
    console.log('  - SUPABASE_URL environment variable');
    console.log('\nOr pass as flags:');
    console.log('  --supabase-url <url>');
    process.exit(1);
  }

  if (!serviceKey) {
    console.log(
      '\n⚠️  SUPABASE_SERVICE_ROLE_KEY not provided. Setup can continue, but publish/doctor will fail until you set it.'
    );
  }

  const projectId = getProjectId(supabaseUrl);
  if (!projectId) {
    console.error('❌ Invalid Supabase URL format.');
    console.log('Expected: https://<project-id>.supabase.co');
    process.exit(1);
  }

  console.log(`✓ Project ID from URL: ${projectId}`);

  // Check if already initialized and linked
  const supabaseDir = path.resolve(process.cwd(), 'supabase');
  const isInitialized = fs.existsSync(path.join(supabaseDir, 'config.toml'));
  const configToml = readConfigToml();

  // Auto-detect linked project
  if (configToml.isLinked && configToml.projectId) {
    console.log(`✓ Auto-detected linked project: ${configToml.projectId}`);

    if (configToml.projectId !== projectId) {
      console.log(
        '\n⚠️  Warning: Config.toml project ID differs from URL project ID'
      );
      console.log(`   Config.toml: ${configToml.projectId}`);
      console.log(`   URL:         ${projectId}`);
      console.log("\n   This is okay if you know what you're doing.");
    }
  }

  if (!isInitialized) {
    console.log('\n📁 Initializing Supabase project...');
    try {
      execSync('supabase init', { stdio: 'inherit' });
    } catch {
      console.error('❌ Failed to initialize Supabase project.');
      process.exit(1);
    }
  } else {
    console.log('✓ Supabase project already initialized');

    if (!configToml.isLinked) {
      console.log('\n⚠️  Project not linked yet. Please run:');
      console.log(`   supabase link --project-ref ${projectId}`);
    }
  }

  // Create migrations
  if (!options.skipMigrations) {
    console.log('\n🗄️  Setting up database migrations...');

    const migrationsDir = path.join(supabaseDir, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const migrationFile = path.join(
      migrationsDir,
      '20260205000000_ota_setup.sql'
    );

    if (fs.existsSync(migrationFile) && !options.force) {
      console.log('  Migration file already exists. Use --force to overwrite.');
    } else {
      fs.writeFileSync(migrationFile, MIGRATION_SQL, 'utf-8');
      console.log(`  ✓ Created: ${migrationFile}`);
    }

    // Create seed file for storage bucket
    const seedFile = path.join(supabaseDir, 'seed.sql');
    const bucketSql = `
-- Create OTA storage bucket if not exists
insert into storage.buckets (id, name, public)
values ('ota-bundles', 'ota-bundles', true)
on conflict (id) do nothing;

-- Allow public read access
CREATE POLICY IF NOT EXISTS "Public Read Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'ota-bundles');

-- Allow service role to upload
CREATE POLICY IF NOT EXISTS "Service Role Uploads" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'ota-bundles');

-- Allow service role to delete
CREATE POLICY IF NOT EXISTS "Service Role Deletes" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'ota-bundles');
`;

    if (!fs.existsSync(seedFile) || options.force) {
      fs.writeFileSync(seedFile, bucketSql, 'utf-8');
      console.log(`  ✓ Created: ${seedFile}`);
    }
  }

  // Create edge functions
  if (!options.skipFunctions) {
    console.log('\n⚡ Setting up Edge Functions...');

    const functionsDir = path.join(supabaseDir, 'functions');

    // ota-manifest function
    const manifestDir = path.join(functionsDir, 'ota-manifest');
    if (!fs.existsSync(manifestDir)) {
      fs.mkdirSync(manifestDir, { recursive: true });
    }
    const manifestFile = path.join(manifestDir, 'index.ts');
    if (!fs.existsSync(manifestFile) || options.force) {
      fs.writeFileSync(manifestFile, OTA_MANIFEST_FUNCTION, 'utf-8');
      console.log(`  ✓ Created: supabase/functions/ota-manifest/index.ts`);
    }

    // ota-cleanup function
    const cleanupDir = path.join(functionsDir, 'ota-cleanup');
    if (!fs.existsSync(cleanupDir)) {
      fs.mkdirSync(cleanupDir, { recursive: true });
    }
    const cleanupFile = path.join(cleanupDir, 'index.ts');
    if (!fs.existsSync(cleanupFile) || options.force) {
      fs.writeFileSync(cleanupFile, OTA_CLEANUP_FUNCTION, 'utf-8');
      console.log(`  ✓ Created: supabase/functions/ota-cleanup/index.ts`);
    }
  }

  // Create .env file for local development
  const envFile = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile) || options.force) {
    const envContent = `# Supabase Local Development
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey ?? 'your-service-role-key'}
EXPO_PUBLIC_OTA_URL=${supabaseUrl}/functions/v1/ota-manifest

# Optional: Cleanup settings
OTA_RETAIN_COUNT=3
OTA_RETAIN_DAYS=7
OTA_CLEANUP_MAX=50
`;
    fs.writeFileSync(envFile, envContent, 'utf-8');
    console.log(`\n✓ Created: .env.local`);
  }

  // Create app-level config and env template so users can publish immediately
  if (!options.skipConfig) {
    const existingConfig = findConfigFile();
    const configFile = path.resolve(process.cwd(), 'supabase-ota.config.ts');
    const envExampleFile = path.resolve(process.cwd(), '.env.example');
    const otaUrl = `${supabaseUrl}/functions/v1/ota-manifest`;
    const channel = process.env.EXPO_PUBLIC_ENV ?? 'DEV';

    if (existingConfig && !options.force) {
      console.log(
        `\nℹ️  Config already exists (${path.basename(
          existingConfig
        )}). Use --force to overwrite.`
      );
    } else {
      const configContent = createConfigContent('ts', { otaUrl, channel });
      fs.writeFileSync(configFile, configContent, 'utf-8');
      console.log(`✓ Created: supabase-ota.config.ts`);
    }

    if (!fs.existsSync(envExampleFile) || options.force) {
      const envExample = createEnvExample({
        supabaseUrl,
        supabaseServiceRoleKey: serviceKey ?? 'your-service-role-key',
        otaUrl,
        channel,
      });
      fs.writeFileSync(envExampleFile, envExample, 'utf-8');
      console.log(`✓ Created: .env.example`);
    }
  }

  if (shouldDeploy) {
    console.log('\n🚀 Running auto-deploy steps...');

    const needsLink =
      !configToml.isLinked ||
      (!!configToml.projectId && configToml.projectId !== projectId);

    if (needsLink && options.skipLink) {
      console.error(
        '❌ Cannot auto deploy because project is not linked (or linked to a different project) and --skip-link was provided.'
      );
      process.exit(1);
    }

    if (needsLink) {
      console.log(`\n🔗 Linking project ${projectId}...`);
      try {
        execSync(`supabase link --project-ref ${projectId}`, {
          stdio: 'inherit',
        });
      } catch {
        console.error('❌ Failed to link Supabase project.');
        process.exit(1);
      }
    } else {
      console.log('✓ Supabase project already linked');
    }

    if (!options.skipMigrations) {
      console.log('\n🗄️  Pushing database migrations...');
      try {
        execSync('supabase db push', { stdio: 'inherit' });
      } catch {
        console.error('❌ Failed to push database migrations.');
        process.exit(1);
      }
    } else {
      console.log('ℹ️  Skipping database push (--skip-migrations)');
    }

    if (!options.skipFunctions) {
      console.log('\n⚡ Deploying edge functions...');
      try {
        execSync('supabase functions deploy ota-manifest', {
          stdio: 'inherit',
        });
        execSync('supabase functions deploy ota-cleanup', {
          stdio: 'inherit',
        });
      } catch {
        console.error('❌ Failed to deploy edge functions.');
        process.exit(1);
      }
    } else {
      console.log('ℹ️  Skipping edge function deploy (--skip-functions)');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Setup complete!\n');
  console.log('Next steps:');
  console.log('');

  let step = 1;

  if (!shouldDeploy) {
    // Only show link step if not already linked
    if (!configToml.isLinked) {
      console.log(`${step}. Link to your Supabase project:`);
      console.log(`   supabase link --project-ref ${projectId}`);
      console.log('');
      step++;
    }

    console.log(`${step}. Push database migrations:`);
    console.log('   supabase db push');
    console.log('');
    step++;

    console.log(`${step}. Deploy edge functions:`);
    console.log('   supabase functions deploy ota-manifest');
    console.log('   supabase functions deploy ota-cleanup');
    console.log('');
    step++;
  } else {
    console.log(`${step}. Auto-deploy completed by setup`);
    console.log('');
    step++;
  }

  if (!options.skipConfig) {
    console.log(`${step}. Review generated config/env files:`);
    console.log('   supabase-ota.config.ts and .env.example');
    console.log('');
    step++;
  }

  console.log(`${step}. Fill your .env values (especially service role key)`);
  console.log('   cp .env.example .env');
  console.log('');
  step++;

  console.log(`${step}. Test the setup:`);
  console.log('   npx supabase-expo-ota-updates doctor');
  console.log('');
  console.log('='.repeat(60));
}
