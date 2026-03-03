# Change: Add supabase-expo-ota-updates npm package

## Why
We need a unified npm package that provides both a CLI for publishing OTA (Over-The-Air) updates to Supabase and an Expo config plugin to configure expo-updates. Currently, the publish script is a standalone Node.js file that users must copy and adapt manually, leading to inconsistent setups and version drift.

## What Changes
- Create single npm package `supabase-expo-ota-updates` (TypeScript, no native code)
- CLI with commands: `init`, `publish`, `cleanup`, `cron`, `doctor`, `info`
- Expo config plugin `withSupabaseOta` for wiring expo-updates configuration
- Support for DEV/STAGING channels with runtimeVersion policy "nativeVersion"
- Integration with existing Supabase schema (ota_updates, ota_assets tables, ota-bundles bucket)
- Dry-run support for CI/CD pipelines
- Comprehensive README with quickstart guide

## Impact
- New package structure with bin entry and exports
- New specs: cli/spec.md, plugin/spec.md
- Affected code: package.json, src/, README.md
