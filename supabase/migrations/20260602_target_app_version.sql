-- Migration: optional semver app-version targeting
-- Created: 2026-06-02
--
-- target_app_version holds a semver range (e.g. '>=1.2.0 <2.0.0', '1.x',
-- '^1.4.0'). NULL means "any app version". The manifest function only applies
-- the filter when the client supplies an x-app-version header, so existing
-- clients are unaffected.

ALTER TABLE ota_updates
  ADD COLUMN IF NOT EXISTS target_app_version TEXT;

COMMENT ON COLUMN ota_updates.target_app_version IS
  'Optional semver range the client app version must satisfy (NULL = any).';
