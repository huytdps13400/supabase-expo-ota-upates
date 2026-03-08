## Purpose
`supabase-expo-ota-updates` is an Expo-focused npm package that provides:
- an Expo config plugin (`supabase-expo-ota-updates/plugin`) to wire OTA updates to Supabase
- a CLI for OTA lifecycle operations (`init`, `setup`, `publish`, `cleanup`, `cron`, `doctor`, `info`)
- a minimal, self-service Supabase setup flow for backend tables, storage bucket, and edge functions.

## Tech Stack
- TypeScript, Node.js 18+
- Bun for local scripts and package workflow
- Expo config plugins + `expo-updates`
- Supabase Postgres + Supabase Storage + Edge Functions

## Project Conventions

### Code Style
- Formatting follows the project Prettier config: 2 spaces, single quotes, semicolons preserved by formatter.
- Prefer small modules with explicit utility boundaries (`cli/commands`, `utils`, `plugin`, `types`).
- Keep API surface changes explicit in `src/index.tsx`, `src/plugin.ts`, and package exports.

### Architecture Patterns
- Command orchestration in `src/cli` maps one file per command to keep behavior easy to review.
- Configuration is loaded from `supabase-ota.config.{ts,js,json}` when present, with fallback to environment variables.
- OTA publishing pipeline: build dist -> upload bundle/assets -> insert `ota_updates`/`ota_assets` rows -> return update ID.

### Testing Strategy
- Unit tests live under `src/__tests__` using Jest.
- Keep changes covered by tests for parse, validation, plugin behavior, and file/encoding helpers.
- Type-level changes are validated through `bun run typecheck`.

### Git Workflow
- Conventional release flow is driven by `scripts/publish-library.sh` with `npm version` + `npm publish`.
- Release checks: lint, typecheck, test, prepare.
- Release commits and tags are created automatically unless disabled by flags.

## Domain Context
- This package is intended for Expo OTA updates backed by Supabase.
- Typical usage: configure Expo app with plugin in `app.config`, then publish updates via CLI and consume updates through Supabase manifest endpoint.
- Backend requires matching schema/indexes and optional retention cleanup for old updates.

## Important Constraints
- Publishing requires:
  - `SUPABASE_URL` or `EXPO_PUBLIC_OTA_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - build version variables for runtime version derivation
- Channels are case-normalized to uppercase and must match `/^[A-Z0-9_-]+$/`.
- `publish` requires `--platform ios|android`.

## External Dependencies
- Supabase CLI (for setup/deploy flows)
- Supabase project (Postgres + Storage + Functions)
- Expo CLI (`npx expo export`)
- Optional: Google Chat webhook via external downstream integrations
