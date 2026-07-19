# Quickstart: Publish And Embed Development

**Status**: Specification complete; implementation pending

## Review Order

1. Read [spec.md](spec.md) for requirements and exclusions.
2. Read [technical-design.md](technical-design.md) for ownership and semantic oracles.
3. Read [contracts/publish-manifest.md](contracts/publish-manifest.md) for the artifact contract.
4. Execute [tasks.md](tasks.md) in order and update evidence after each accepted slice.

## Required Gates

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify:design
pnpm verify:topology
pnpm format:check
git diff --check
```

Dedicated publish and minimal-host commands will be added by the implementation tasks and recorded here before T046.
