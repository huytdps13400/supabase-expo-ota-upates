# supabase-expo-ota-updates

Minimal OTA tooling for Expo apps using Supabase.

## Install

```bash
npm install supabase-expo-ota-updates
# or
yarn add supabase-expo-ota-updates
# or
bun add supabase-expo-ota-updates
```

## Quick Setup

### 1) Add plugin to Expo config

```js
// app.config.js
module.exports = {
  expo: {
    plugins: [
      [
        'supabase-expo-ota-updates/plugin',
        {
          url: process.env.EXPO_PUBLIC_OTA_URL,
          channel: process.env.EXPO_PUBLIC_ENV || 'DEV',
          runtimeVersionPolicy: 'nativeVersion',
          checkAutomatically: 'ON_LOAD',
        },
      ],
    ],
  },
};
```

### 2) Run one-command init

```bash
# login once if needed
supabase login

SUPABASE_URL=https://your-project.supabase.co npx supabase-expo-ota-updates init
```

### 3) Create and fill environment file

```bash
cp .env.example .env
```

Required values:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_OTA_URL`
- `EXPO_PUBLIC_ENV`
- `VERSION_NUMBER`
- `IOS_BUILD_NUMBER`
- `ANDROID_BUILD_NUMBER`

### 4) Validate

```bash
npx supabase-expo-ota-updates doctor
```

### 5) Publish

```bash
# iOS
npx supabase-expo-ota-updates publish --platform ios --channel DEV

# Android
npx supabase-expo-ota-updates publish --platform android --channel STAGING

# Dry run
npx supabase-expo-ota-updates publish --platform ios --dry-run
```

## Existing Supabase Project

If your project is already configured, use:

```bash
SUPABASE_URL=https://your-project.supabase.co npx supabase-expo-ota-updates init --skip-migrations --skip-functions
```

## Commands

- `init`: one-command bootstrap
- `setup`: advanced/manual scaffolding mode
- `doctor`: environment and config validation
- `publish`: publish OTA updates
- `cleanup`: remove old OTA updates
- `info`: print current config

```bash
npx supabase-expo-ota-updates --help
```

## Notes

- `--channel` supports custom channel names.
- Advanced publish flags (`--force-update`, `--rollout`, `--message`, `--app-version`) require matching backend setup.

## Docs

- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)

## License

MIT
