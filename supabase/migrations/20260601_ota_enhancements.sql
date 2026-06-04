-- Migration: OTA enhancements
-- Created: 2026-06-01
--   1. Fix device-update tracking (unique constraint + success inference)
--   2. rollBackToEmbedded directive support

-- ============================================
-- 1. DEVICE UPDATE TRACKING FIXES
-- ============================================

-- record_device_update uses ON CONFLICT (update_id, device_id) but no matching
-- unique constraint existed, so every call errored. Add it. NULL device_ids are
-- treated as distinct, which is fine (anonymous requests are not deduplicated).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_device_updates_update_device
  ON ota_device_updates (update_id, device_id);

-- Mark a device's pending delivery as successful once it reports running the
-- update's bundle. Called from the manifest function when x-bundle-id matches a
-- known update bundle, giving real applied/failed stats without a client round-trip.
CREATE OR REPLACE FUNCTION mark_device_update_applied(
  p_device_id TEXT,
  p_current_bundle_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE ota_device_updates du
  SET status = 'success', updated_at = NOW()
  FROM ota_updates ou
  WHERE du.update_id = ou.id
    AND ou.bundle_id = p_current_bundle_id
    AND du.device_id = p_device_id
    AND du.status IN ('pending', 'downloading');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================
-- 2. ROLLBACK-TO-EMBEDDED DIRECTIVES
-- ============================================

-- An active directive instructs clients (via the Expo Updates protocol) to roll
-- back to the embedded bundle. A directive only takes effect while it is newer
-- than the newest active update for the same target, so publishing a fix
-- automatically supersedes it.
CREATE TABLE IF NOT EXISTS ota_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  runtime_version TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'rollBackToEmbedded'
    CHECK (type IN ('rollBackToEmbedded')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_ota_directives_lookup
  ON ota_directives (channel, platform, runtime_version, created_at DESC)
  WHERE is_active;

ALTER TABLE ota_directives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage directives" ON ota_directives;
CREATE POLICY "Service role can manage directives"
ON ota_directives
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE ota_directives IS 'Expo Updates protocol directives (e.g. rollBackToEmbedded)';
