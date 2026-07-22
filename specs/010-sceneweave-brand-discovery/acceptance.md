# Acceptance: SceneWeave Brand And Repository Discovery

## Status

In progress.

## Contract Oracle

This feature changes discovery and display identity only. `@web3d/*` imports, SceneDocument/archive bytes, save payloads,
IndexedDB/storage keys, deterministic fixture generator strings, asset hashes, and runtime behavior remain unchanged.

## Evidence

### Implemented locally

- README names SceneWeave in the first viewport, states the literal category and supported use cases, and links the
  real tracked Studio screenshot.
- `artifacts/e2e/publish-parity-studio-run-1440x900.png` was regenerated from the deterministic CC0 factory fixture.
  The publish-parity E2E passed and the screenshot visibly includes `SceneWeave` without owner smart-home assets.
- Root and public-package metadata point at `Gujiassh/sceneweave`; the `@web3d/*` package names remain unchanged.
- Studio HTML metadata, browser titles, English/Chinese catalog entries, and the first-viewport toolbar use SceneWeave.
- Focused docs, brand, and toolbar verification passed: 3 files / 15 tests.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed. Vitest covered 124
  files / 789 tests.
- `pnpm verify:docs`, `pnpm verify:i18n`, `pnpm verify:design`, `pnpm verify:topology`, and
  `pnpm verify:assets` passed. The docs audit covered 15 files / 31 local links; the asset audit retained the frozen CC0
  hashes.
- `pnpm verify:packages` passed for four deterministic `0.1.0-rc.1` tarballs in framework-neutral and React clean
  consumers. Package names and exports remain unchanged; repository discovery metadata accounts for the new tarball
  hashes.
- The publish-parity browser scenario passed at 1440x900 with no runtime errors and canonical Studio/host document
  parity.
- `pnpm verify:smart-home` passed 7 of 9 tests and correctly failed the two owner-source integration cases before
  generation because the local excluded `recessed_downlight` changed from frozen SHA-256 `2b538d...` to `01723e...`.
  Feature 010 does not update that frozen exclusion or ship the owner bytes.

### Pending

- Commit, GitHub repository rename, remote and discovery metadata update, push, redirect/SHA verification, and final CI.
