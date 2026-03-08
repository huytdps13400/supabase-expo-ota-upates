## 1. Implementation

- [x] 1.1 Create OpenSpec change proposal (proposal.md, tasks.md, spec.md)
- [x] 1.2 Create package source structure
  - [x] 1.2.1 Create src/cli/ directory with command handlers
  - [x] 1.2.2 Create src/plugin/ directory with withSupabaseOta
  - [x] 1.2.3 Create src/types/ directory for shared types
  - [x] 1.2.4 Create src/utils/ directory for helpers
- [x] 1.3 Implement CLI commands
  - [x] 1.3.1 `init` - Create config file (ts/js/json) + env example
  - [x] 1.3.2 `setup` - Initialize Supabase infrastructure (DB, storage, edge functions)
  - [x] 1.3.3 `publish` - Build, upload to Storage, insert DB rows
  - [x] 1.3.4 `cleanup` - Call ota-cleanup edge function
  - [x] 1.3.5 `cron` - Output SQL for automated cleanup
  - [x] 1.3.6 `doctor` - Validate env/config and manifest test
  - [x] 1.3.7 `info` - Show runtime and config summary
- [x] 1.4 Implement withSupabaseOta plugin
  - [x] 1.4.1 Accept config options and modify app.config
  - [x] 1.4.2 Set updates.url, updates.channel, runtimeVersion policy
  - [x] 1.4.3 Support code signing fields passthrough
- [x] 1.5 Create bin entry point (bin/supabase-expo-ota-updates.js)
- [x] 1.6 Update package.json exports and dependencies
- [x] 1.7 Add setup command for Supabase CLI integration
- [x] 1.8 Auto-detect linked project from supabase/config.toml

## 2. Documentation

- [x] 2.1 Write README.md
  - [x] 2.1.1 Quickstart section
  - [x] 2.1.2 Supabase setup instructions
  - [x] 2.1.3 CLI reference
  - [x] 2.1.4 Plugin configuration reference
- [x] 2.2 Create example .env.example file

## 3. Testing

- [x] 3.1 Add config parsing tests
- [ ] 3.2 Add publish dry-run tests
- [x] 3.3 Add plugin configuration tests

## 4. Validation

- [ ] 4.1 Run TypeScript type checking
- [ ] 4.2 Run linting
- [ ] 4.3 Validate CLI works end-to-end
