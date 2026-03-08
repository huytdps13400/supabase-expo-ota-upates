## ADDED Requirements

### Requirement: withSupabaseOta Plugin
The package SHALL export an Expo config plugin named `withSupabaseOta`.

#### Scenario: Apply basic plugin config
- **GIVEN** a valid Expo config
- **WHEN** user configures plugin with `{ url, channel }`
- **THEN** the plugin SHALL set `updates.url` and `updates.channel`.
- **AND** set `updates.checkAutomatically` to `NEVER` when not provided.
- **AND** set `runtimeVersion.policy` to `nativeVersion` by default.

#### Scenario: Channel normalization and validation
- **GIVEN** the user sets `channel: 'production'`
- **WHEN** plugin runs
- **THEN** channel SHALL be normalized to `PRODUCTION`.
- **AND** channel SHALL reject values with spaces or special characters.

### Requirement: Advanced Plugin Options
The plugin SHALL support runtime and security options used by Expo Updates.

#### Scenario: Policy and check behavior
- **WHEN** user sets `runtimeVersionPolicy` and `checkAutomatically`
- **THEN** the plugin SHALL set the corresponding Expo updates values.

#### Scenario: Fingerprint runtime version policy
- **WHEN** user sets `runtimeVersionPolicy` to `'fingerprint'` or `'fingerprintExperimental'`
- **THEN** the plugin SHALL set `runtimeVersion.policy` to the specified value.

#### Scenario: Code signing fields
- **WHEN** user passes `codeSigningCertificate` or `codeSigningMetadata`
- **THEN** the plugin SHALL pass those fields into the final `updates` config.

### Requirement: Plugin Disable Switch
The plugin SHALL support `enabled: false`.

#### Scenario: Disabled plugin
- **WHEN** user passes `enabled: false`
- **THEN** plugin SHALL return the existing config unchanged.
