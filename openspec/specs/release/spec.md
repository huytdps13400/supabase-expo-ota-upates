## ADDED Requirements

### Requirement: Library Release Scripts
The package SHALL provide npm scripts for automated release and version bumping.

#### Scenario: Patch/minor/major release
- **WHEN** a maintainer runs:
  - `bun run publish:lib:patch`
  - `bun run publish:lib:minor`
  - `bun run publish:lib:major`
- **THEN** the script SHALL run checks (lint, typecheck, test, prepare), bump the requested version, publish to npm, and create a release commit/tag locally.

### Requirement: Dry-run release flow
The library SHALL support validating release checks without versioning.

#### Scenario: Dry run
- **WHEN** user runs `bun run publish:lib:dry-run -- --skip-auth`
- **THEN** the command SHALL run checks without bumping or publishing and exit successfully when checks pass.

### Requirement: CI-friendly flags
The release script SHALL support non-interactive and dirty-tree behavior controls.

#### Scenario: Non-interactive push
- **WHEN** user runs `bun run publish:lib:patch -- --git-push --yes`
- **THEN** publish flow SHALL proceed without manual prompts and push commit/tag/refs to remote.

#### Scenario: Skip checks or auth
- **WHEN** user passes `--skip-checks` or `--skip-auth`
- **THEN** the script SHALL skip the relevant validation/auth step.
