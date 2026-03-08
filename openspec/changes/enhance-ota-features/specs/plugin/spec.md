## MODIFIED Requirements

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
