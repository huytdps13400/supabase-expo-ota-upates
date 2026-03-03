-- Migration: Add hot-updater inspired features
-- Created: 2026-02-06

-- ============================================
-- 1. UPDATE EXISTING TABLES
-- ============================================

-- Add force_update flag to ota_updates
ALTER TABLE ota_updates 
ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE;

-- Add rollout_percentage for gradual release (0-100)
ALTER TABLE ota_updates 
ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER DEFAULT 100 
CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100);

-- Add bundle_id for tracking (UUID format)
ALTER TABLE ota_updates 
ADD COLUMN IF NOT EXISTS bundle_id UUID DEFAULT gen_random_uuid();

-- Add message/changelog
ALTER TABLE ota_updates 
ADD COLUMN IF NOT EXISTS message TEXT;

-- Add semver app version for better version matching
ALTER TABLE ota_updates 
ADD COLUMN IF NOT EXISTS app_version TEXT;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_ota_updates_bundle_id ON ota_updates(bundle_id);
CREATE INDEX IF NOT EXISTS idx_ota_updates_rollout ON ota_updates(channel, platform, runtime_version, rollout_percentage);

-- ============================================
-- 2. CREATE DEVICE TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ota_device_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES ota_updates(id) ON DELETE CASCADE,
  device_id TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  bundle_id UUID,
  status TEXT CHECK (status IN ('pending', 'success', 'failed', 'downloading')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_updates_update_id ON ota_device_updates(update_id);
CREATE INDEX IF NOT EXISTS idx_device_updates_device_id ON ota_device_updates(device_id);

-- ============================================
-- 3. RPC FUNCTIONS (Giống hot-updater)
-- ============================================

-- Function: Get update info with signed URL support
CREATE OR REPLACE FUNCTION get_update_info(
  p_channel TEXT,
  p_platform TEXT,
  p_runtime_version TEXT,
  p_current_bundle_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  bundle_id UUID,
  runtime_version TEXT,
  launch_asset_url TEXT,
  launch_asset_hash TEXT,
  is_mandatory BOOLEAN,
  rollout_percentage INTEGER,
  message TEXT,
  should_update BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ou.id,
    ou.bundle_id,
    ou.runtime_version,
    ou.launch_asset_url,
    ou.launch_asset_hash,
    ou.is_mandatory,
    ou.rollout_percentage,
    ou.message,
    -- Check if should update (different bundle and active)
    (ou.bundle_id IS DISTINCT FROM p_current_bundle_id AND ou.is_active) as should_update,
    ou.is_active,
    ou.created_at
  FROM ota_updates ou
  WHERE ou.channel = p_channel
    AND ou.platform = p_platform
    AND ou.runtime_version = p_runtime_version
    AND ou.is_active = TRUE
  ORDER BY ou.created_at DESC
  LIMIT 1;
END;
$$;

-- Function: Check if device should receive update based on rollout percentage
CREATE OR REPLACE FUNCTION should_receive_update(
  p_device_id TEXT,
  p_update_id UUID,
  p_rollout_percentage INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_hash_value INTEGER;
BEGIN
  -- Use hash of device_id + update_id to deterministically decide
  -- This ensures same device always gets same result for same update
  SELECT ('x' || substr(md5(p_device_id || p_update_id::text), 1, 8))::bit(32)::int % 100
  INTO v_hash_value;
  
  RETURN v_hash_value < p_rollout_percentage;
END;
$$;

-- Function: Get update with rollout check
CREATE OR REPLACE FUNCTION get_update_with_rollout(
  p_channel TEXT,
  p_platform TEXT,
  p_runtime_version TEXT,
  p_device_id TEXT,
  p_current_bundle_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  bundle_id UUID,
  runtime_version TEXT,
  launch_asset_url TEXT,
  launch_asset_hash TEXT,
  launch_asset_key TEXT,
  launch_asset_content_type TEXT,
  is_mandatory BOOLEAN,
  message TEXT,
  should_update BOOLEAN,
  should_force_update BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_update RECORD;
  v_should_receive BOOLEAN;
BEGIN
  -- Get latest update
  SELECT * INTO v_update
  FROM get_update_info(p_channel, p_platform, p_runtime_version, p_current_bundle_id);
  
  -- If no update found, return empty
  IF v_update.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check rollout for this device
  v_should_receive := should_receive_update(p_device_id, v_update.id, v_update.rollout_percentage);
  
  -- Return update info with should_update modified by rollout
  RETURN QUERY
  SELECT 
    v_update.id,
    v_update.bundle_id,
    v_update.runtime_version,
    v_update.launch_asset_url,
    v_update.launch_asset_hash,
    ou.launch_asset_key,
    ou.launch_asset_content_type,
    v_update.is_mandatory,
    v_update.message,
    -- Only should_update if rollout allows
    (v_update.should_update AND v_should_receive) as should_update,
    -- Force update only if mandatory and should receive
    (v_update.is_mandatory AND v_should_receive) as should_force_update,
    v_update.created_at
  FROM ota_updates ou
  WHERE ou.id = v_update.id;
END;
$$;

-- Function: Record device update attempt
CREATE OR REPLACE FUNCTION record_device_update(
  p_update_id UUID,
  p_device_id TEXT,
  p_platform TEXT,
  p_bundle_id UUID,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ota_device_updates (update_id, device_id, platform, bundle_id, status)
  VALUES (p_update_id, p_device_id, p_platform, p_bundle_id, p_status)
  ON CONFLICT (update_id, device_id) 
  DO UPDATE SET 
    status = p_status,
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Function: Get update statistics
CREATE OR REPLACE FUNCTION get_update_stats(
  p_update_id UUID
)
RETURNS TABLE (
  total_devices BIGINT,
  successful_updates BIGINT,
  failed_updates BIGINT,
  pending_updates BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_devices,
    COUNT(*) FILTER (WHERE status = 'success')::BIGINT as successful_updates,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_updates,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending_updates
  FROM ota_device_updates
  WHERE update_id = p_update_id;
END;
$$;

-- ============================================
-- 4. TRIGGERS
-- ============================================

-- Auto-generate bundle_id if not provided
CREATE OR REPLACE FUNCTION set_bundle_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.bundle_id IS NULL THEN
    NEW.bundle_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_bundle_id ON ota_updates;
CREATE TRIGGER trigger_set_bundle_id
  BEFORE INSERT ON ota_updates
  FOR EACH ROW
  EXECUTE FUNCTION set_bundle_id();

-- ============================================
-- 5. RLS POLICIES (Security)
-- ============================================

-- Allow service role to manage device updates
ALTER TABLE ota_device_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage device updates"
ON ota_device_updates
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE ota_device_updates IS 'Tracks which devices have received updates';
COMMENT ON TABLE ota_updates IS 'OTA updates with support for force update and rollout percentage';
