# Change: Enhance OTA features with runtime components, new CLI commands, and DX improvements

## Why
Users need a complete in-app update experience (progress UI, auto-rollback on crash) and better CLI tooling (rollback, list, interactive console, interactive prompts). The library also lacks fingerprint-based runtime versioning and parallel asset uploads, both of which are standard in competing solutions like hot-updater.

## What Changes
- Add React Native runtime module: `useOtaUpdate` hook, `OtaUpdater.wrap()` HOC, `RollbackManager`
- Add CLI commands: `rollback`, `list`, `console`
- Add interactive prompts to `init` command (no-flag TTY mode)
- Add `fingerprint` runtime version policy support
- Parallel asset uploads in `publish` (concurrency of 5)
- New package export `supabase-expo-ota-updates/runtime`

## Impact
- New spec: `runtime/spec.md`
- Modified specs: `cli/spec.md`, `plugin/spec.md`
- New files: `src/runtime/`, `src/cli/commands/{rollback,list,console}.ts`, `src/utils/{prompt,fingerprint}.ts`
- Modified files: `src/cli/index.ts`, `src/cli/commands/{init,publish}.ts`, `src/utils/{config,supabase}.ts`, `src/types/index.ts`, `src/plugin/index.ts`, `src/index.tsx`, `package.json`
