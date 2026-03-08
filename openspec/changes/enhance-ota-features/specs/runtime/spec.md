## ADDED Requirements

### Requirement: useOtaUpdate Hook
The package SHALL export a React hook `useOtaUpdate` that wraps expo-updates APIs for checking, downloading, and applying OTA updates.

#### Scenario: Check for update
- **WHEN** `checkForUpdate()` is called
- **THEN** the hook SHALL call `Updates.checkForUpdateAsync()` and set `isUpdateAvailable` to `true` when an update exists.
- **AND** extract `isForceUpdate`, `message`, `rolloutPercentage` from manifest extra field into `updateInfo`.

#### Scenario: Download update with progress
- **WHEN** `downloadUpdate()` is called
- **THEN** the hook SHALL call `Updates.fetchUpdateAsync()` and track `progress` (0 to 1).
- **AND** set `isUpdateReady` to `true` when download completes.

#### Scenario: Apply update
- **WHEN** `applyUpdate()` is called
- **THEN** the hook SHALL mark the update as pending via `RollbackManager` and call `Updates.reloadAsync()`.

#### Scenario: Auto mode
- **WHEN** `checkOnMount`, `autoDownload`, and `autoApply` options are all `true`
- **THEN** the hook SHALL automatically check, download, and apply updates on mount.

#### Scenario: Status lifecycle
- **GIVEN** the hook is in use
- **THEN** `status` SHALL transition through: `idle` -> `checking` -> `idle`/`downloading` -> `ready`/`error`.

### Requirement: OtaUpdater HOC
The package SHALL export an `OtaUpdater.wrap()` higher-order component for wrapping app components with update support.

#### Scenario: Auto update mode
- **WHEN** `OtaUpdater.wrap({ updateMode: 'auto' })(App)` is used
- **THEN** the HOC SHALL display a fallback component during checking/downloading and auto-apply when ready.

#### Scenario: Manual update mode
- **WHEN** `OtaUpdater.wrap({ updateMode: 'manual' })(App)` is used
- **THEN** the HOC SHALL call `onUpdateAvailable` callback without showing fallback or auto-applying.

#### Scenario: Custom fallback
- **WHEN** `fallback` component is provided
- **THEN** the HOC SHALL render the custom fallback with `{ status, progress, error }` props during update.

#### Scenario: Default fallback
- **WHEN** no `fallback` is provided
- **THEN** the HOC SHALL render a default overlay with ActivityIndicator and progress bar.

### Requirement: RollbackManager
The package SHALL export a `RollbackManager` class for crash detection and automatic rollback.

#### Scenario: Initialize rollback detection
- **WHEN** `RollbackManager.initialize()` is called at app startup
- **THEN** it SHALL check crash count and perform rollback if threshold (3 crashes) is exceeded.

#### Scenario: Mark update pending
- **WHEN** `markUpdatePending(updateId)` is called before applying an update
- **THEN** the manager SHALL persist the pending update state.

#### Scenario: Confirm success
- **WHEN** `confirmUpdateSuccess()` is called after app loads successfully
- **THEN** the manager SHALL reset crash count and pending state.

#### Scenario: Storage fallback
- **GIVEN** `@react-native-async-storage/async-storage` is not installed
- **WHEN** the manager is used
- **THEN** it SHALL fall back to in-memory storage without throwing errors.

### Requirement: Runtime Package Export
The package SHALL export the runtime module via `supabase-expo-ota-updates/runtime`.

#### Scenario: Import runtime components
- **WHEN** user imports `from 'supabase-expo-ota-updates/runtime'`
- **THEN** `useOtaUpdate`, `OtaUpdater`, and `RollbackManager` SHALL be available.
