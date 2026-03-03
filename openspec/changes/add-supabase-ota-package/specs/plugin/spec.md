## ADDED Requirements

### Requirement: withSupabaseOta Plugin
The package SHALL export an Expo config plugin `withSupabaseOta`.

#### Scenario: Basic plugin configuration
- **GIVEN** an Expo app.config.js file
- **WHEN** the user adds `withSupabaseOta` with `{ url, channel }`
- **THEN** the plugin sets `updates.url` to the provided URL
- **AND** sets `updates.channel` to the provided channel (normalized to uppercase)
- **AND** sets `runtimeVersion.policy` to "nativeVersion"

#### Scenario: Custom channel configuration
- **GIVEN** an Expo app.config.js file
- **WHEN** the user adds `withSupabaseOta` with `{ url: 'https://example.com/ota', channel: 'production' }`
- **THEN** the plugin normalizes channel to 'PRODUCTION'
- **AND** the plugin accepts any channel name containing letters, numbers, underscores, and hyphens
- **AND** different channels can point to different URLs

#### Scenario: Plugin with all options
- **GIVEN** an Expo app.config.js file
- **WHEN** the user adds `withSupabaseOta` with all options
- **THEN** the plugin configures:
  - `updates.url`: The OTA manifest endpoint URL
  - `updates.channel`: The channel (DEV or STAGING)
  - `updates.checkAutomatically`: "ON_LOAD" or "NEVER" (default)
  - `runtimeVersion.policy`: The runtime version policy
  - `updates.codeSigningCertificate`: Optional code signing certificate path
  - `updates.codeSigningMetadata`: Optional code signing metadata

#### Scenario: Plugin disabled
- **GIVEN** an Expo app.config.js file
- **WHEN** the user sets `enabled: false` in plugin options
- **THEN** the plugin returns the config unchanged

### Requirement: Plugin TypeScript Support
The plugin SHALL provide TypeScript type definitions.

#### Scenario: TypeScript autocomplete
- **GIVEN** a TypeScript Expo config file
- **WHEN** the user imports `withSupabaseOta` from `supabase-expo-ota-updates/plugin`
- **THEN** TypeScript provides autocomplete for plugin options
- **AND** type checking validates required and optional fields
