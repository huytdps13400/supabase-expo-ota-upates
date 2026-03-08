## 1. Runtime Components

- [x] 1.1 Create `src/runtime/rollbackManager.ts` - Crash detection and auto-rollback
- [x] 1.2 Create `src/runtime/useOtaUpdate.ts` - React hook wrapping expo-updates
- [x] 1.3 Create `src/runtime/OtaUpdater.tsx` - HOC with fallback UI and progress bar
- [x] 1.4 Create `src/runtime/index.ts` - Re-exports
- [x] 1.5 Add `./runtime` export path in package.json
- [x] 1.6 Re-export runtime types/components from `src/index.tsx`

## 2. New CLI Commands

- [x] 2.1 Create `src/cli/commands/rollback.ts` - Deactivate latest, activate previous
- [x] 2.2 Create `src/cli/commands/list.ts` - Table/JSON listing with filters
- [x] 2.3 Create `src/cli/commands/console.ts` - Interactive terminal dashboard
- [x] 2.4 Add `listOtaUpdates`, `updateOtaUpdate`, `getUpdateStats` to `src/utils/supabase.ts`
- [x] 2.5 Add `OtaUpdateRecord`, `RollbackOptions`, `ListOptions` to `src/types/index.ts`
- [x] 2.6 Register new commands in `src/cli/index.ts`

## 3. Interactive CLI Prompts

- [x] 3.1 Create `src/utils/prompt.ts` - readline-based prompts (no dependencies)
- [x] 3.2 Add interactive flow to `init` command when no flags + TTY

## 4. Fingerprint Strategy

- [x] 4.1 Create `src/utils/fingerprint.ts` - @expo/fingerprint with fallback
- [x] 4.2 Add `deriveRuntimeVersionAsync` to `src/utils/config.ts`
- [x] 4.3 Update `RuntimeVersionPolicy` type with `fingerprint` | `fingerprintExperimental`
- [x] 4.4 Update plugin to accept fingerprint policies
- [x] 4.5 Update publish command to use async runtime version derivation

## 5. Performance

- [x] 5.1 Parallel asset uploads in publish (concurrency 5)

## 6. Validation

- [x] 6.1 TypeScript type checking passes (0 errors)
- [x] 6.2 All existing tests pass (102 tests)
- [x] 6.3 Update openspec specs to reflect new features
