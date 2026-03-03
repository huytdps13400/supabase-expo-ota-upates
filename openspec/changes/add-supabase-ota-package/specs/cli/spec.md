## ADDED Requirements

### Requirement: CLI Setup Command
The CLI SHALL provide a `setup` command that initializes Supabase infrastructure including database tables, storage bucket, and edge functions.

#### Scenario: Setup with Supabase CLI
- **GIVEN** the user has Supabase CLI installed
- **AND** has valid Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- **WHEN** the user runs `npx supabase-expo-ota-updates setup`
- **THEN** the CLI checks for Supabase CLI installation
- **AND** creates migration files in `supabase/migrations/`
- **AND** creates edge functions in `supabase/functions/`
- **AND** creates seed file for storage bucket
- **AND** creates `.env.local` file
- **AND** outputs instructions for linking and deploying

#### Scenario: Setup with missing Supabase CLI
- **GIVEN** Supabase CLI is not installed
- **WHEN** the user runs `npx supabase-expo-ota-updates setup`
- **THEN** the CLI displays error message with installation instructions
- **AND** exits with code 1

#### Scenario: Setup force overwrite
- **GIVEN** migration files already exist
- **WHEN** the user runs `npx supabase-expo-ota-updates setup --force`
- **THEN** the CLI overwrites existing files

#### Scenario: Auto-detect linked project
- **GIVEN** the user has already run `supabase link --project-ref <id>`
- **AND** `supabase/config.toml` contains a valid `project_id`
- **WHEN** the user runs `npx supabase-expo-ota-updates setup`
- **THEN** the CLI detects the linked project from config.toml
- **AND** displays `✓ Auto-detected linked project: <project-id>`
- **AND** skips the "Link to your Supabase project" step in output

#### Scenario: Warn on project ID mismatch
- **GIVEN** config.toml has project_id "abc123"
- **AND** the user provides SUPABASE_URL with project_id "xyz789"
- **WHEN** the user runs `npx supabase-expo-ota-updates setup`
- **THEN** the CLI shows a warning about the mismatch
- **AND** continues with the setup

### Requirement: CLI Init Command
The CLI SHALL provide an `init` command that creates a configuration file.

#### Scenario: Initialize with TypeScript config
- **WHEN** the user runs `npx supabase-expo-ota-updates init --format ts`
- **THEN** a `supabase-ota.config.ts` file is created with TypeScript template
- **AND** an `.env.example` file is created with required environment variables

#### Scenario: Initialize with JSON config
- **WHEN** the user runs `npx supabase-expo-ota-updates init --format json`
- **THEN** a `supabase-ota.config.json` file is created with JSON template

### Requirement: CLI Publish Command
The CLI SHALL provide a `publish` command that builds and uploads OTA bundles.

#### Scenario: Full publish flow
- **GIVEN** valid environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- **AND** a valid config file or CLI flags
- **WHEN** the user runs `npx supabase-expo-ota-updates publish --platform ios --channel DEV`
- **THEN** the CLI runs `expo export` for the specified platform
- **AND** uploads the bundle and assets to Supabase Storage at path `<channel>/<platform>/<runtimeVersion>/<timestamp>/`
- **AND** inserts a row into `ota_updates` table
- **AND** inserts rows into `ota_assets` table for each asset
- **AND** outputs the update ID on success

#### Scenario: Publish with dry-run
- **GIVEN** all required configuration
- **WHEN** the user runs `npx supabase-expo-ota-updates publish --platform ios --dry-run`
- **THEN** the CLI prints what would be uploaded without making any changes
- **AND** exits with code 0

#### Scenario: Publish with no-build flag
- **GIVEN** a pre-built dist directory exists
- **WHEN** the user runs `npx supabase-expo-ota-updates publish --platform ios --no-build`
- **THEN** the CLI skips the `expo export` step
- **AND** uses the existing dist directory

### Requirement: CLI Cleanup Command
The CLI SHALL provide a `cleanup` command to prune old OTA updates.

#### Scenario: Call cleanup edge function
- **GIVEN** the ota-cleanup edge function is deployed
- **WHEN** the user runs `npx supabase-expo-ota-updates cleanup`
- **THEN** the CLI calls the ota-cleanup edge function
- **AND** displays the number of pruned updates

### Requirement: CLI Cron Command
The CLI SHALL provide a `cron` command to output SQL for automated cleanup.

#### Scenario: Output pg_cron SQL
- **WHEN** the user runs `npx supabase-expo-ota-updates cron`
- **THEN** the CLI outputs a SQL snippet using pg_cron and pg_net
- **AND** the snippet calls the ota-cleanup edge function on a schedule

### Requirement: CLI Doctor Command
The CLI SHALL provide a `doctor` command to validate configuration.

#### Scenario: Validate environment and config
- **GIVEN** environment variables may or may not be set
- **WHEN** the user runs `npx supabase-expo-ota-updates doctor`
- **THEN** the CLI checks for required env vars
- **AND** validates the config file syntax
- **AND** tests the manifest fetch endpoint with headers
- **AND** reports any issues found

### Requirement: CLI Info Command
The CLI SHALL provide an `info` command to display current configuration.

#### Scenario: Show current config
- **GIVEN** environment variables are set
- **WHEN** the user runs `npx supabase-expo-ota-updates info`
- **THEN** the CLI displays:
  - Current runtimeVersion (derived from VERSION_NUMBER and build numbers)
  - Current channel (from EXPO_PUBLIC_ENV or config)
  - Storage bucket and base path
  - Supabase URL

### Requirement: CLI Environment Variable Support
The CLI SHALL support configuration via environment variables.

#### Scenario: Default channel from env
- **GIVEN** the CLI requires a default channel
- **THEN** it reads EXPO_PUBLIC_ENV or config.channel
- **AND** normalizes the channel to uppercase (e.g., 'production' → 'PRODUCTION')
- **AND** validates that channel contains only letters, numbers, underscores, and hyphens

### Requirement: CLI Flag Support
The CLI SHALL support common flags across commands.

#### Scenario: Global flags
- **WHEN** the user provides CLI flags
- **THEN** `--platform` accepts "ios" or "android"
- **AND** `--channel` accepts any string (normalized to uppercase, validated for alphanumeric + underscore + hyphen)
- **AND** `--runtime-version` overrides auto-derived version
- **AND** `--bucket` specifies the storage bucket (default: "ota-bundles")
- **AND** `--dist` specifies the build output directory
- **AND** `--timestamp` specifies the timestamp for the path
- **AND** `--dry-run` simulates without making changes
- **AND** `--no-build` skips the expo export step

#### Scenario: Custom channel support
- **GIVEN** the user wants to publish to a custom channel
- **WHEN** the user runs `npx supabase-expo-ota-updates publish --platform ios --channel production`
- **THEN** the channel is normalized to "PRODUCTION"
- **AND** the update is published with that channel identifier
- **AND** apps configured with channel "PRODUCTION" can receive the update
