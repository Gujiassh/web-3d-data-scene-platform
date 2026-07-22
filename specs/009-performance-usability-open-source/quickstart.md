# Release-Candidate Quickstart

Feature 009 is locally complete as a release candidate. The default smart-home bytes are owner-provided validation
artifacts and are intentionally not tracked, deployed or released without redistribution authorization.

## Studio

```bash
corepack pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4173`. Existing profiles continue to open their latest project. To enable the local clean-profile
smart-home default when the owner source is available:

```bash
node scripts/smart-home/generate.mjs \
  --mode local-validation \
  --source /mnt/e/data/model/smart_home_90sqm \
  --output /home/cc/tmp/web3d-smart-home-starter
ln -sfn /home/cc/tmp/web3d-smart-home-starter apps/studio/public/starter
pnpm dev
```

The generated archive/report must stay below `/home/cc/tmp`. Public generation requires a hash-bound license record and
fails closed otherwise. Explicit New Scene remains empty and existing IndexedDB projects are untouched.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm verify:docs
pnpm verify:i18n
pnpm verify:assets
pnpm verify:topology
pnpm verify:design
pnpm verify:smart-home
pnpm verify:packages
```

The standard E2E command runs one worker for deterministic IndexedDB/revision behavior and reports `62 passed / 3
exact WebKit Studio skips` in the current Linux environment. Controller results are E1. Do not describe them as
external-user, real Safari or reference-Iris-Xe evidence. The canonical software performance command is
`pnpm bench:release-009`; its SwiftShader result is non-gating E1.

## Release Status

Until every E2/E3 gate passes, use this exact status:

> Release candidate; external production claims blocked.

## Current Blockers

- Redistribution authorization for the 38 selected owner GLB hashes is missing.
- Iris Xe E2 performance, stable Firefox E2 and real Safari E2 environments are unavailable.
- Five qualifying E3 participants are unavailable; the Owner Waiver does not prove usability.
- Source push is complete. npm/GitHub Release/Pages publication credentials and explicit publication authorization are
  not present.
