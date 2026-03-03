#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BUMP_TYPE="patch"
DIST_TAG="latest"
DRY_RUN="false"
SKIP_CHECKS="false"
SKIP_AUTH="false"
ASSUME_YES="false"
ENABLE_GIT="true"
GIT_PUSH="false"
ALLOW_DIRTY="false"

usage() {
  cat <<'USAGE'
Usage: scripts/publish-library.sh [options]

Options:
  --type <patch|minor|major>  Version bump type (default: patch)
  --tag <tag>                 npm dist-tag (default: latest)
  --dry-run                   Run checks only, do not bump/publish
  --skip-checks               Skip lint/test/typecheck/build checks
  --skip-auth                 Skip npm whoami check
  --no-git                    Skip git commit/tag after publish
  --git-push                  Push release commit and tag to remote
  --allow-dirty               Allow running with dirty git working tree
  --yes                       Skip confirmation prompt
  --help                      Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --type)
      BUMP_TYPE="${2:-}"
      shift 2
      ;;
    --tag)
      DIST_TAG="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS="true"
      shift
      ;;
    --skip-auth)
      SKIP_AUTH="true"
      shift
      ;;
    --no-git)
      ENABLE_GIT="false"
      shift
      ;;
    --git-push)
      GIT_PUSH="true"
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY="true"
      shift
      ;;
    --yes)
      ASSUME_YES="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo "Invalid --type: $BUMP_TYPE (use patch|minor|major)" >&2
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "Current version: $CURRENT_VERSION"

if [[ "$GIT_PUSH" == "true" && "$ENABLE_GIT" != "true" ]]; then
  echo "--git-push requires git mode. Remove --no-git or --git-push." >&2
  exit 1
fi

if [[ "$SKIP_CHECKS" != "true" ]]; then
  echo "Running pre-publish checks..."
  bun run lint
  bun run typecheck
  bun test
  bun run prepare
  npm pack --dry-run --cache /tmp/npm-cache >/dev/null
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry run completed. No version bump and no publish."
  exit 0
fi

if [[ "$ENABLE_GIT" == "true" ]]; then
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Git repository not found. Use --no-git to publish without commit/tag." >&2
    exit 1
  fi

  if [[ "$ALLOW_DIRTY" != "true" ]]; then
    if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
      echo "Git working tree is dirty. Commit/stash changes first, or use --allow-dirty." >&2
      exit 1
    fi
  fi
fi

if [[ "$SKIP_AUTH" != "true" ]]; then
  echo "Checking npm authentication..."
  npm whoami >/dev/null
fi

if [[ "$ASSUME_YES" != "true" ]]; then
  echo "Ready to publish supabase-expo-ota-updates ($BUMP_TYPE) with npm dist-tag '$DIST_TAG'."
  if [[ "$ENABLE_GIT" == "true" ]]; then
    if [[ "$GIT_PUSH" == "true" ]]; then
      echo "Post-publish: create git commit + tag and push to remote."
    else
      echo "Post-publish: create git commit + tag locally."
    fi
  else
    echo "Post-publish: git commit/tag disabled."
  fi
  read -r -p "Continue? [y/N] " answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "Publish cancelled."
    exit 1
  fi
fi

echo "Bumping version ($BUMP_TYPE)..."
NEW_VERSION="$(npm version "$BUMP_TYPE" --no-git-tag-version)"
NEW_VERSION="${NEW_VERSION#v}"
echo "Version updated: $CURRENT_VERSION -> $NEW_VERSION"

echo "Publishing to npm..."
npm publish --access public --tag "$DIST_TAG"

if [[ "$ENABLE_GIT" == "true" ]]; then
  RELEASE_TAG="v$NEW_VERSION"

  if git rev-parse --verify "$RELEASE_TAG" >/dev/null 2>&1; then
    echo "Git tag already exists: $RELEASE_TAG" >&2
    exit 1
  fi

  echo "Creating release commit and tag..."
  git add package.json

  for lock_file in package-lock.json bun.lockb bun.lock yarn.lock pnpm-lock.yaml; do
    if [[ -f "$lock_file" ]]; then
      git add "$lock_file"
    fi
  done

  if git diff --cached --quiet; then
    echo "No staged changes for release commit." >&2
    exit 1
  fi

  git commit -m "chore(release): $RELEASE_TAG"
  git tag "$RELEASE_TAG"

  if [[ "$GIT_PUSH" == "true" ]]; then
    echo "Pushing release commit and tag..."
    git push
    git push origin "$RELEASE_TAG"
  fi
fi

echo "Publish completed: supabase-expo-ota-updates@$NEW_VERSION"
