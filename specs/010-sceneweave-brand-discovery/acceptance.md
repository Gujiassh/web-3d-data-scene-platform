# Acceptance: SceneWeave Brand And Repository Discovery

## Status

Accepted.

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

### GitHub delivery

- Brand implementation commit: `5a26dafc6487e9a70f95e37bce6e81ec4735068f`.
- Brand implementation commit title: `Brand the platform as SceneWeave`.
- GitHub repository: `Gujiassh/sceneweave`; local `origin` uses
  `https://github.com/Gujiassh/sceneweave.git`.
- GitHub description matches the accepted SceneWeave descriptor, homepage is intentionally empty, and all 12 accepted
  topics are present: `threejs`, `webgl`, `react`, `typescript`, `3d`, `scene-editor`, `digital-twin`, `iot`,
  `data-visualization`, `gltf`, `self-hosted`, and `open-source`.
- The old `Gujiassh/web-3d-data-scene-platform` URL returns HTTP 301 to `Gujiassh/sceneweave`; the new URL returns 200.
- Local, upstream, and remote `main` matched `5a26dafc6487e9a70f95e37bce6e81ec4735068f` after the implementation push.
- The public README resolves at the new slug. Its tracked Studio image returns `image/png`, is 1440x900, and matches the
  local SHA-256 `51020fe4cef8042a250e10c64f5a57f13c13569b85e7ff986573c0f91d6f8af4`.
- GitHub Actions CI run `29890454790` passed all 18 verification steps on the implementation commit, including format,
  lint, typecheck, unit, build, docs, i18n, asset, topology, design, package-consumer, and clean-runner smart-home gates.
