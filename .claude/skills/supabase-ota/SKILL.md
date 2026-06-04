---
name: supabase-ota
description: >-
  Publish, roll back, and inspect Expo OTA updates backed by Supabase using the
  supabase-expo-ota-updates CLI. Use when the user wants to ship an OTA update,
  promote a build to a channel (DEV/STAGING/PRODUCTION), do a gradual rollout,
  force a mandatory update, roll back to a previous bundle or the embedded
  bundle, list/inspect updates, or validate the OTA setup.
---

# Supabase Expo OTA Updates

Drive the `supabase-expo-ota-updates` CLI to manage over-the-air updates.

## Before anything: validate

Always confirm the environment is wired up before publishing:

```bash
npx supabase-expo-ota-updates doctor
```

Required env vars (CLI side): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`EXPO_PUBLIC_OTA_URL`, `EXPO_PUBLIC_ENV`, `VERSION_NUMBER`, and
`IOS_BUILD_NUMBER` / `ANDROID_BUILD_NUMBER`.

## Publish

```bash
# Single platform
npx supabase-expo-ota-updates publish --platform ios --channel PRODUCTION

# Both platforms in one run
npx supabase-expo-ota-updates publish --platform all --channel PRODUCTION

# Gradual rollout + changelog
npx supabase-expo-ota-updates publish --platform all --channel PRODUCTION \
  --rollout 25 --message "Fix login crash"

# Mandatory (force) update
npx supabase-expo-ota-updates publish --platform ios --channel PRODUCTION -f

# Target a semver app-version range (see README caveat on x-app-version)
npx supabase-expo-ota-updates publish --platform ios --channel PRODUCTION \
  --target-app-version ">=1.2.0 <2.0.0"
```

**Critical safety rule:** the channel you publish to should match
`EXPO_PUBLIC_ENV`, because `babel-preset-expo` inlines `EXPO_PUBLIC_*` values
into the bundle at export time. The CLI warns on mismatch — do not silence the
warning with `--skip-env-check` unless the user explicitly intends a decoupled
channel. When in doubt, set `EXPO_PUBLIC_ENV` to the target channel first.

Use `--dry-run` to preview without uploading. The build always runs
`expo export --clear` to avoid stale inlined env vars.

## Roll back

```bash
# Reactivate the previous update on the channel
npx supabase-expo-ota-updates rollback --platform ios --channel PRODUCTION

# Activate a specific update id
npx supabase-expo-ota-updates rollback --platform ios --channel PRODUCTION --to <update-id>

# Roll all devices back to the embedded (store) bundle via a protocol directive
npx supabase-expo-ota-updates rollback --platform ios --channel PRODUCTION --to-embedded
```

`--to-embedded` is the strongest rollback: it issues a `rollBackToEmbedded`
directive per active runtime version. Publishing a newer update later
automatically supersedes the directive.

## Inspect

```bash
# List updates (table or json)
npx supabase-expo-ota-updates list --platform ios --channel PRODUCTION --active
npx supabase-expo-ota-updates list --format json --limit 50

# Interactive terminal dashboard
npx supabase-expo-ota-updates console

# Current configuration
npx supabase-expo-ota-updates info
```

## Cleanup

```bash
# Remove old updates (retention)
npx supabase-expo-ota-updates cleanup
```

## When something fails

- 403 from the manifest endpoint → channel header missing/disallowed.
- 204 (no update) when one is expected → check platform, runtime version, channel
  spelling (channels are upper-cased), and `is_active`.
- Wrong env values in a shipped bundle → almost always an `EXPO_PUBLIC_ENV` vs
  channel mismatch; re-publish with the correct env set.
