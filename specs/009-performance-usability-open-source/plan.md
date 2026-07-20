# Plan: Performance, Usability And Open-Source Release

## Boundaries

Feature 009 is a release-quality layer. Runtime, SceneDocument 1.4, ProjectRecord, archive and save meanings remain
unchanged. The smart-home content is a reference template assembled through existing contracts, not a new domain model.

## Evidence Lanes

1. **Starter and assets**: audit `/mnt/e/data/model/smart_home_90sqm`, freeze exact licensed SHIP inputs, generate an
   explicit layout/archive, bootstrap only an empty repository and verify three state classes.
2. **Performance**: generate the fixed 009 fixture, verify its shape, collect raw controller/hardware samples and reject
   unsupported renderer claims.
3. **Browsers and UI**: add explicit Chromium/Firefox/WebKit projects and one shared semantic flow; keep actual Safari as
   a separate E2 gate.
4. **Packages and public project**: emit consumable library packages, pack/install smoke, governance/docs, Pages and
   release-candidate artifacts.
5. **Acceptance**: evaluate validation-plan gates with evidence-class labels, Owner Waivers and a final Critical review.

## Smart-Home Starter Architecture

- `scripts/smart-home/` owns source-manifest parsing, allowlisted asset IDs, exact hash/license checks and deterministic
  archive generation.
- `specs/009-*/contracts/smart-home-starter.md` owns placements, device/Target/Binding semantics and exclusions.
- Generated public bytes live under `apps/studio/public/starter/` only after the asset distribution gate passes.
- A dedicated domain-neutral `starter-bootstrap` service owns archive fetch, content-hash verification, archive import,
  cancellation and the all-or-nothing repository snapshot. `useStudioWorkspace` and `initializeRepository` only invoke
  that service and persist its ordinary snapshot when IndexedDB has no project. Existing repositories and explicit New
  Scene retain current behavior.
- Generator input uses an explicit `assetHash + semanticTargetId -> nodeIndex` map. Exact node names are validation
  assertions only and never select the index. Runtime continues to consume canonical Target IDs/node indices; it never
  reads the external capability manifest.
- Starter fetch/import/save is atomic from the workspace perspective: any failure creates no partial persisted project
  and reports one stable diagnostic.
- Device payloads use a generic `multi-status-cycle` Studio scenario with independent `/channels/<id>/status` values.
  The shared source stays online; `offline` is a device value interpreted by rules, not a per-binding connection outage.
- Bootstrap tests cover React StrictMode double effects, unmount cancellation, two-tab initialization authority, fetch,
  archive/hash/quota failure, retry, and delete-all-then-reload. Existing record open metadata continues to update.

## Performance Oracle

- Validate fixture counts, hashes, compressed size and renderer statistics before collecting samples.
- Warm for 5 seconds, then follow one deterministic 60-second camera path.
- `medianFps = 1000 / median(frameDeltaMs)` and `onePercentLowFps = 1000 / p99(frameDeltaMs)` with no rounding before the
  gate comparison. Warm-up samples are excluded. The report separately records warm-up refresh cadence and timer jitter;
  it never rounds a near-60 result into a pass.
- Correlate selection and Patch sequence IDs on one `performance.now()` clock to the first render-state probe and Canvas
  pixel frame that proves the selection outline or rule effect is visible; calculate nearest-rank p95.
- Repeat cached activation at least 20 times and calculate nearest-rank p95 from `load()` start to ready.
- For 30-minute evidence, sample once per minute after warm-up. Gate the forced-GC JS heap with a non-positive Theil-Sen
  slope and final delta <= max(8 MiB, 5% of the post-warm-up baseline). DOM nodes, renderer geometries/textures and owned
  runtime resources each require a non-positive slope and final value no higher than baseline. Raw heap/GPU estimates are
  reported but cannot override a failing named series.
- Dispose probes count owned RAF, adapter connections, ResizeObserver and registered listeners; every count must reach 0.
- Compressed asset size is the exact sum of unique Runtime-loaded referenced GLB bytes. The referenced, resolved and
  loaded hash sets must be equal; padding and unreferenced files are forbidden. Draw calls and unique triangles come from
  renderer statistics after the verified scene reaches ready.

## Browser Oracle

Each engine runs a Studio flow covering import, selection, transform, Undo/Redo, binding, Run and Export at 1280x720,
1440x900 and 1920x1080, plus the published-host flow covering Viewer/API selection, focus and trusted content. Both prove
canonical document/Runtime state, keyboard paths, nonblank Canvas and zero captured page/console errors. The report records
actual engine/UA. Playwright Firefox/WebKit remain E1 unless run as an accepted E2 stable-browser environment; Linux
WebKit is never labeled Safari. Stable Firefox E2 and real Safari E2 are separate gates; each must pass in its named
browser environment or retain an explicit blocker.

## Release Packaging

- Build each public package to `dist/` with ESM JavaScript and declarations.
- Freeze one release-candidate version/tag across packages. Package metadata uses explicit `exports`, `types`, `files`,
  rewritten non-workspace dependency ranges, repository/license/engines and side-effect declarations.
- Generate tarballs in a clean artifacts directory; install them into a temporary non-workspace consumer and build one
  framework-neutral plus one React import surface. Repeated tarballs must be byte-identical and include LICENSE plus
  required third-party notices, including bundled font licenses.
- Registry publication and semantic version are a separate owner-authenticated action. Until then, publish a GitHub
  release candidate with checksums and exact limitations.

## Contract Risk

No persisted schema change is approved or required. If implementation appears to require a template field, asset state
manifest, room model or altered save payload, stop and redesign the adapter/template layer instead of changing contracts.

## External Blockers

- E3 five-person usability remains unproven under the Owner Waiver.
- E2 Iris Xe reference performance requires the named hardware.
- E2 Safari requires stable Safari on macOS or a browser service.
- npm registry publication requires owner credentials and package-name decision.
- Public smart-home bytes require an explicit redistribution license for the selected local assets.
