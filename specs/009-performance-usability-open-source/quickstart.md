# Release-Candidate Quickstart

## Studio

```bash
corepack pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4173`. On a clean browser profile, the first project is the smart-home starter after its asset
license and generated archive gates are complete. Existing profiles continue to open their latest project.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Feature 009 adds dedicated asset, package, browser and performance commands as their tasks land. Controller results are
reported as E1. Do not describe them as external-user, real Safari or reference-Iris-Xe evidence.

## Release Status

Until every E2/E3 gate passes, use this exact status:

> Release candidate; external production claims blocked.
