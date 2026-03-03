# Library Release

Auto-increment version and publish to npm:

```bash
# full checks + patch bump + publish
bun run publish:lib:patch

# minor / major
bun run publish:lib:minor
bun run publish:lib:major

# check flow only (no bump, no publish)
bun run publish:lib:dry-run -- --skip-auth

# publish + auto commit/tag + push to remote
bun run publish:lib:patch -- --git-push --yes
```

By default, publish script will create a release commit and tag locally after successful npm publish.
