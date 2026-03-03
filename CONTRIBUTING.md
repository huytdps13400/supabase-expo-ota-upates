# Contributing

Contributions are welcome.

Please read the [Code of Conduct](./CODE_OF_CONDUCT.md) first.

## Requirements

- Node.js `>=18`
- Bun (recommended in this repository)

## Local Setup

```bash
bun install
```

## Common Commands

```bash
# Build artifacts used for publish
bun run prepare

# Type check
bun run typecheck

# Run tests
bun test

# Lint
bun run lint
```

## Example App

```bash
cd example
bun install
bun start
```

## Notes

- Keep API docs in `README.md` aligned with the implementation.
- Add or update tests when changing CLI behavior, plugin behavior, or configuration handling.
- Prefer small, focused pull requests.
