create extension if not exists "pgcrypto";

create table if not exists ota_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('DEV', 'STAGING')),
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

create index if not exists ota_updates_lookup
  on ota_updates (channel, platform, runtime_version, created_at desc);

create index if not exists ota_updates_active_lookup
  on ota_updates (channel, platform, runtime_version, created_at desc)
  where is_active;

create index if not exists ota_assets_update_id
  on ota_assets (update_id);

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
