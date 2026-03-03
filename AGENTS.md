<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## Library Release

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

By default, publish script creates a release commit and tag locally after successful npm publish.
