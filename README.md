# supabase-expo-ota-updates

Self-hosted OTA updates for Expo apps powered by Supabase. Ship updates instantly without app store review.

- **CLI** for publishing, managing, and rolling back updates
- **Expo Config Plugin** to wire `expo-updates` to your Supabase backend
- **React Native Runtime** with update hook, HOC wrapper, progress UI, and auto-rollback on crash
- **Supabase Backend** with Edge Functions, Postgres schema, and Storage

## Demo

https://github.com/user-attachments/assets/9c39ef74-abe6-4cd9-b298-35cae3cbc10b

## Install

```bash
npm install supabase-expo-ota-updates
```

Peer dependencies: `expo` (>=50), `expo-updates` (>=0.24)

## Quick Start

### 1. Initialize

```bash
# Interactive setup (prompts for URL, key, channel, etc.)
npx supabase-expo-ota-updates init

# Or non-interactive
SUPABASE_URL=https://your-project.supabase.co \
npx supabase-expo-ota-updates init
```

This scaffolds migrations, edge functions, config files, and optionally deploys everything.

### 2. Add Plugin to Expo Config

```js
// app.config.js
module.exports = {
  expo: {
    plugins: [
      [
        'supabase-expo-ota-updates/plugin',
        {
          url: process.env.EXPO_PUBLIC_OTA_URL,
          channel: process.env.EXPO_PUBLIC_ENV || 'PRODUCTION',
          runtimeVersionPolicy: 'nativeVersion', // or 'fingerprint'
          checkAutomatically: 'ON_LOAD',
        },
      ],
    ],
  },
};
```

### 3. Add In-App Updates (Optional)

#### Option A: Wrap your app (simplest)

```tsx
import { OtaUpdater } from 'supabase-expo-ota-updates/runtime';

function App() {
  return <YourApp />;
}

export default OtaUpdater.wrap({
  updateMode: 'auto',
  fallback: ({ status, progress }) => (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{status === 'downloading' ? `${Math.round(progress * 100)}%` : 'Checking for updates...'}</Text>
    </View>
  ),
})(App);
```

#### Option B: Use the hook (full control)

```tsx
import { useOtaUpdate } from 'supabase-expo-ota-updates/runtime';

function App() {
  const {
    status,
    progress,
    isUpdateAvailable,
    isUpdateReady,
    updateInfo,
    checkForUpdate,
    downloadUpdate,
    applyUpdate,
  } = useOtaUpdate({ checkOnMount: true });

  if (isUpdateReady) {
    return (
      <View>
        <Text>Update ready: {updateInfo?.message}</Text>
        <Button title="Restart to update" onPress={applyUpdate} />
      </View>
    );
  }

  return <YourApp />;
}
```

### 4. Set Environment Variables

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (CLI only, never bundled) |
| `EXPO_PUBLIC_OTA_URL` | Yes | Manifest endpoint URL |
| `EXPO_PUBLIC_ENV` | Yes | Channel name (e.g., `PRODUCTION`) |
| `VERSION_NUMBER` | Yes | App version (e.g., `1.0.0`) |
| `IOS_BUILD_NUMBER` | Yes | iOS build number |
| `ANDROID_BUILD_NUMBER` | Yes | Android version code |

### 5. Validate & Publish

```bash
# Validate setup
npx supabase-expo-ota-updates doctor

# Publish iOS update
npx supabase-expo-ota-updates publish --platform ios --channel PRODUCTION

# Publish with options
npx supabase-expo-ota-updates publish --platform android \
  --channel PRODUCTION \
  --message "Bug fix for login" \
  --force-update \
  --rollout 50
```

## CLI Reference

```
npx supabase-expo-ota-updates <command> [options]
```

| Command | Description |
|---------|-------------|
| `init` | Interactive bootstrap (setup + deploy) |
| `setup` | Scaffold Supabase infrastructure |
| `publish` | Build and publish OTA update |
| `list` | List OTA updates with filters |
| `rollback` | Rollback to previous update |
| `console` | Interactive dashboard |
| `cleanup` | Remove old updates |
| `cron` | Generate SQL for scheduled cleanup |
| `doctor` | Validate configuration |
| `info` | Show current configuration |

### publish

```bash
npx supabase-expo-ota-updates publish --platform ios [options]
```

| Flag | Description |
|------|-------------|
| `--platform <ios\|android\|all>` | Target platform (`all` publishes both) (required) |
| `--channel <name>` | Channel name |
| `--force-update, -f` | Mark as mandatory update |
| `--rollout <0-100>` | Gradual rollout percentage |
| `--message, -m <text>` | Update changelog |
| `--app-version <semver>` | App version for matching |
| `--runtime-version <ver>` | Override runtime version |
| `--no-build` | Skip `expo export` step |
| `--compress` | Gzip the JS bundle before upload (experimental) |
| `--skip-env-check` | Don't warn when `EXPO_PUBLIC_ENV` differs from `--channel` |
| `--dry-run` | Simulate without changes |

> **Environment safety:** `babel-preset-expo` inlines `EXPO_PUBLIC_*` values into
> the bundle at export time. `publish` warns if `EXPO_PUBLIC_ENV` does not match
> the target `--channel`, since a mismatch (or a stale Metro cache) can ship the
> wrong environment's config. The build always runs `expo export --clear` to
> avoid stale inlined values.

### list

```bash
npx supabase-expo-ota-updates list [options]
```

| Flag | Description |
|------|-------------|
| `--platform <ios\|android>` | Filter by platform |
| `--channel <name>` | Filter by channel |
| `--active` | Show only active updates |
| `--limit <n>` | Number of results (default: 20) |
| `--format <table\|json>` | Output format |

### rollback

```bash
# Reactivate the previous update for the channel
npx supabase-expo-ota-updates rollback --platform ios --channel PROD

# Activate a specific update
npx supabase-expo-ota-updates rollback --platform ios --channel PROD --to <update-id>

# Roll all devices back to the embedded (store) bundle via a protocol directive
npx supabase-expo-ota-updates rollback --platform ios --channel PROD --to-embedded
```

`--to-embedded` issues an Expo `rollBackToEmbedded` directive for each active
runtime version. The directive applies only while it is newer than the latest
update, so publishing a fix afterwards automatically supersedes it.

### console

Interactive terminal dashboard for managing updates:

```bash
npx supabase-expo-ota-updates console
```

## Plugin Options

```ts
interface PluginOptions {
  url: string;                        // Manifest endpoint URL (required)
  channel: string;                    // Channel name (required)
  enabled?: boolean;                  // Enable/disable plugin (default: true)
  runtimeVersionPolicy?: string;      // 'nativeVersion' | 'fingerprint' | 'appVersion' | 'sdkVersion'
  checkAutomatically?: string;        // 'ON_LOAD' | 'NEVER' | 'ON_ERROR_RECOVERY' | 'WIFI_ONLY'
  codeSigningCertificate?: string;    // Path to code signing certificate
  codeSigningMetadata?: {             // Code signing metadata
    keyid: string;
    alg: string;
  };
}
```

## Runtime API

### `useOtaUpdate(options?)`

```ts
const {
  status,           // 'idle' | 'checking' | 'downloading' | 'ready' | 'error'
  progress,         // 0 to 1
  error,            // Error | null
  updateInfo,       // { id, message, isForceUpdate, rolloutPercentage }
  isUpdateAvailable,
  isUpdateReady,
  checkForUpdate,   // () => Promise<boolean>
  downloadUpdate,   // () => Promise<boolean>
  applyUpdate,      // () => Promise<void>
} = useOtaUpdate({
  checkOnMount: true,     // Check on component mount
  autoDownload: false,    // Auto-download when found
  autoApply: false,       // Auto-apply when downloaded (reloads app)
  onUpdateAvailable: (info) => {},
  onUpdateReady: (info) => {},
  onError: (error) => {},
});
```

### `OtaUpdater.wrap(config)`

```ts
export default OtaUpdater.wrap({
  updateMode: 'auto',          // 'auto' | 'manual'
  checkOnMount: true,
  fallback: CustomLoadingComponent,
  onUpdateAvailable: (info) => {},
  onError: (error) => {},
})(App);
```

### `RollbackManager`

Auto-rollback when the app crashes repeatedly after an update:

```ts
import { RollbackManager } from 'supabase-expo-ota-updates/runtime';

// Call at app startup (automatic in useOtaUpdate)
await RollbackManager.initialize();

// Manually confirm update success
await RollbackManager.confirmUpdateSuccess();

// Check rollback state
const state = await RollbackManager.getState();
```

## Fingerprint Runtime Version

Use `@expo/fingerprint` to automatically detect native code changes:

```bash
npm install @expo/fingerprint --save-dev
```

```js
// app.config.js
['supabase-expo-ota-updates/plugin', {
  url: process.env.EXPO_PUBLIC_OTA_URL,
  channel: 'PRODUCTION',
  runtimeVersionPolicy: 'fingerprint',
}]
```

When `@expo/fingerprint` is not installed, the CLI falls back to hashing key config files (`package.json`, `app.json`, Podfile.lock, etc.).

## Supabase Backend

The `init`/`setup` commands create:

- **Database**: `ota_updates` and `ota_assets` tables with indexes and RPC functions
- **Storage**: `ota-bundles` bucket with public read access
- **Edge Functions**: `ota-manifest` (serves Expo Updates Protocol v1) and `ota-cleanup` (retention cleanup)

### Advanced Features

- **Gradual Rollout**: Deterministic hash-based rollout using device ID
- **Mandatory Updates**: Force users to update before using the app
- **Device Tracking**: Track update delivery per device (delivery success is
  inferred when a device reports running the new bundle — no client call needed)
- **Signed URLs**: Optional signed storage URLs for private buckets
- **Rollback Directives**: `rollBackToEmbedded` support via the `ota_directives` table
- **Scheduled Cleanup**: `pg_cron` integration for automatic old update removal

The three `ota-manifest*` edge functions share a single handler
(`supabase/functions/_shared/manifest.ts`); the channel-specific ones just pin a
channel, so there is one place to maintain the protocol logic.

### Code Signing

Expo Updates can verify that manifests come from you. Configure the certificate
on the client via the plugin (`codeSigningCertificate` / `codeSigningMetadata`),
then give the manifest function the matching private key so it can sign responses:

```bash
# Set on the Supabase project (Edge Function secrets)
supabase secrets set EXPO_OTA_CODE_SIGNING_PRIVATE_KEY="$(cat private-key.pem)"
supabase secrets set EXPO_OTA_CODE_SIGNING_KEY_ID=main   # must match codeSigningMetadata.keyid
```

When the key is present, manifests (and rollback directives) carry an
`expo-signature` header signed with `rsa-v1_5-sha256`. When it is absent, signing
is skipped and updates are served unsigned (default).

## Existing Supabase Project

If your project already has Supabase configured:

```bash
npx supabase-expo-ota-updates init --skip-migrations --skip-functions
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
