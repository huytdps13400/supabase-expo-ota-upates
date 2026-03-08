## ADDED Requirements

### Requirement: List Command
The CLI SHALL expose a `list` command to display OTA updates with filtering and formatting options.

#### Scenario: List all updates
- **WHEN** user runs `npx supabase-expo-ota-updates list`
- **THEN** the command SHALL display up to 20 recent updates in table format with columns: ID, Created, Platform, Channel, Version, Rollout, Status, Message.

#### Scenario: List with filters
- **WHEN** user runs `npx supabase-expo-ota-updates list --platform ios --channel PROD --active --limit 10`
- **THEN** the command SHALL display only matching updates.

#### Scenario: List as JSON
- **WHEN** user runs `npx supabase-expo-ota-updates list --format json`
- **THEN** the command SHALL output results as formatted JSON.

### Requirement: Rollback Command
The CLI SHALL expose a `rollback` command to revert to a previous OTA update.

#### Scenario: Rollback latest
- **GIVEN** an active update exists for the specified platform and channel
- **WHEN** user runs `npx supabase-expo-ota-updates rollback --platform ios --channel PROD`
- **THEN** the command SHALL deactivate the latest active update and activate the previous one.

#### Scenario: Rollback to specific update
- **WHEN** user runs `npx supabase-expo-ota-updates rollback --platform ios --channel PROD --to <update-id>`
- **THEN** the command SHALL deactivate the latest active update and activate the specified update.

#### Scenario: No active updates
- **GIVEN** no active updates exist
- **WHEN** user runs rollback
- **THEN** the command SHALL display a message that there is nothing to rollback.

### Requirement: Console Command
The CLI SHALL expose a `console` command providing an interactive terminal dashboard.

#### Scenario: Launch console
- **WHEN** user runs `npx supabase-expo-ota-updates console`
- **THEN** the command SHALL display an interactive menu with options to list, activate, deactivate, and inspect updates.

#### Scenario: Console operations
- **GIVEN** the console is running
- **WHEN** user selects an operation (list, activate, deactivate, filter, view details)
- **THEN** the console SHALL execute the operation and display results inline.

#### Scenario: Console quit
- **WHEN** user types `q`, `quit`, or `exit`
- **THEN** the console SHALL close gracefully.

### Requirement: Interactive Init
The CLI `init` command SHALL support interactive mode when run without flags on a TTY.

#### Scenario: Interactive prompts
- **GIVEN** stdin is a TTY and no flags are provided
- **WHEN** user runs `npx supabase-expo-ota-updates init`
- **THEN** the command SHALL prompt for Supabase URL, service role key, default channel, config format, and deploy confirmation.

#### Scenario: Non-interactive fallback
- **GIVEN** stdin is not a TTY (e.g., CI/CD pipeline)
- **WHEN** user runs `npx supabase-expo-ota-updates init` without flags
- **THEN** the command SHALL fall through to existing flag-based behavior.

## MODIFIED Requirements

### Requirement: CLI Command Set
The CLI SHALL expose commands: `init`, `setup`, `publish`, `cleanup`, `cron`, `doctor`, `info`, `list`, `rollback`, and `console`.

#### Scenario: Show help
- **WHEN** user runs `npx supabase-expo-ota-updates --help`
- **THEN** the output SHALL list all available commands including `list`, `rollback`, and `console`.

#### Scenario: Unknown command
- **WHEN** user runs `npx supabase-expo-ota-updates unknown`
- **THEN** the CLI SHALL show an unknown command error and help output.

### Requirement: Publish Command
The CLI SHALL provide a `publish` command that publishes OTA bundles and asset metadata.

#### Scenario: Publish full flow
- **GIVEN** valid config/env and valid `--platform`
- **WHEN** user runs `npx supabase-expo-ota-updates publish --platform ios --channel DEV`
- **THEN** the command SHALL:
  - derive runtime version from config/env (async, supporting fingerprint strategy)
  - run `npx expo export` unless `--no-build`
  - parse `dist/<platform>` output (supports `metadata.json` and legacy layout)
  - upload bundle and assets to Supabase storage (assets uploaded in parallel, concurrency 5)
  - insert one row into `ota_updates` and related rows into `ota_assets`
  - output update ID.

#### Scenario: Publish with options
- **WHEN** user provides `--message`, `--force-update`, `--rollout`, `--app-version`, `--runtime-version`, `--dist`, `--bucket`, `--timestamp`
- **THEN** these values SHALL be reflected in publish behavior and persisted payload fields (`is_mandatory`, `rollout_percentage`, `message`, `app_version`).

#### Scenario: Publish dry run
- **WHEN** user runs `npx supabase-expo-ota-updates publish --platform ios --dry-run`
- **THEN** the command SHALL not upload files and SHALL log intended bundle/assets paths and intended DB inserts.
