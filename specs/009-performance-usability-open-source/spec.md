# Feature 009: Performance, Usability And Open-Source Release

**Status**: Implementation approved by the accepted roadmap and the Owner's 2026-07-20 instructions to complete the
project with controller verification where manual participants are unavailable and to make the provided 90 m2
smart-home content the default clean-profile experience.

## Goal

Finish the MVP as an auditable release candidate: open a useful smart-home reference project by default, prove the
existing domain-neutral contracts and release artifacts, execute reproducible performance and browser gates, and state
external evidence gaps honestly instead of converting controller tests into user or hardware claims.

## Evidence Classes

- **E0 Contract**: deterministic unit, schema, type and artifact checks.
- **E1 Controller**: automated or controller-operated browser/runtime evidence on the current machine.
- **E2 Reference environment**: evidence from the specified hardware or named real browser/device.
- **E3 External user**: evidence from a qualifying participant who is not the project author/controller.

An Owner Waiver may close a roadmap task with residual risk, but it MUST NOT relabel E0/E1 evidence as E2/E3.

## User Scenarios

### US-001 Open A Useful First Project

On a clean browser profile, Studio opens an authored 90 m2 smart-home project rather than an empty canvas. The scene
uses explicit asset IDs and transforms, has useful camera views, and remains editable with the existing SceneDocument
and project repository contracts.

### US-002 Observe Device State

The reference project exposes representative lighting, climate, media, access and cleaning targets. Run mode shows
normal, offline and alarm states from one Mock source using existing Binding/RuleSet semantics; runtime values never
enter the persisted document or asset GLBs.

### US-003 Measure A Fixed Release Fixture

The benchmark runner verifies its fixture shape before measuring it, records raw samples and environment identity, and
hard-fails unsupported renderers or incomplete loads. Software-rendered controller evidence remains supplemental.

### US-004 Exercise Supported Browser Engines

Chromium, Firefox and Playwright WebKit execute one shared critical flow with canonical document, Runtime snapshot,
Canvas and error evidence. WebKit on Linux is reported as WebKit, not Safari. Real Safari remains E2-only.

### US-005 Consume The Release Candidate

A clean consumer can install generated package tarballs, import public APIs, build a host and follow the documented
publish/embed path. Public docs, contribution/security policy, asset provenance and release limitations are explicit.

## Functional Requirements

- **FR-001**: Feature 009 MUST evaluate every Product, Contract, Runtime, UI, Performance, Assets and Open-source gate
  as `pass`, `blocked` or `waived`, with exact evidence and no silent omissions.
- **FR-002**: A clean Studio repository MUST bootstrap the smart-home starter; existing IndexedDB `documentJson` and asset
  blobs MUST remain byte-identical and MUST NOT be replaced or migrated. Existing last-opened/recent metadata semantics
  remain unchanged.
- **FR-003**: Explicit New Scene creation MUST retain the existing empty-project behavior unless a template is selected.
- **FR-004**: The starter MUST use current SceneDocument 1.4, ProjectRecord, archive 1.0.0 and repository shapes without
  adding template, room, device-state or asset-manifest fields to persisted contracts.
- **FR-005**: The starter archive and every included GLB MUST be content-addressed, reproducibly generated and verified
  before Studio saves the first project.
- **FR-006**: Only exact `SHIP` asset hashes with zero validator errors and an explicit redistribution license MAY enter
  the public starter. `NO-SHIP`, missing, stale or unknown-license assets MUST hard-fail generation.
- **FR-007**: Smart-home placement MUST use an explicit layout manifest keyed by asset ID; names, directory order,
  first-available assets and runtime bounding-box guesses MUST NOT determine semantic placement.
- **FR-008**: Device bindings MUST reuse exact asset node indices, stable Target IDs, Mock source, Binding and RuleSet
  contracts. Generation MUST resolve nodes from an explicit `assetHash + semanticTargetId -> nodeIndex` map; node names
  MAY only validate the mapped node and MUST NOT determine its index. Asset capability manifests remain generator input,
  not SceneDocument extensions.
- **FR-009**: The starter MUST demonstrate normal, application-level offline and alarm values on separate device pointers
  while the shared Mock source remains connected. It MUST NOT persist current state, connection, telemetry, selection or
  alarm instances.
- **FR-010**: The public starter MUST include at least living, dining, bedroom, kitchen, entry and climate/security device
  coverage plus authored camera views for whole-home and room-level inspection.
- **FR-011**: The fixed benchmark fixture MUST verify 300 entities, 150 Targets, 100 active Bindings, 180,000-200,000
  unique triangles, no more than 120 draw calls, 12-15 MB compressed assets, 200 Patch/s and 10 active alarms.
- **FR-012**: The benchmark MUST store raw frame, latency, activation, memory and disposal samples plus a deterministic
  summary bound to source, fixture and asset hashes.
- **FR-013**: Hardware/browser evidence MUST record CPU, GPU, RAM, OS, browser/version, viewport, DPR, power mode and
  renderer. SwiftShader/llvmpipe MUST NOT satisfy E2 performance gates.
- **FR-014**: The browser matrix MUST use explicit Chromium, Firefox and WebKit projects with engine-specific identities
  and shared Studio plus published-host critical flows; a Chrome descriptor MUST NOT be reused as Firefox/WebKit evidence.
- **FR-015**: Actual Safari support MUST require a stable Safari run on macOS or a recorded blocking ruling; Playwright
  WebKit MUST NOT be renamed Safari.
- **FR-016**: Controller workflow rehearsal MAY close an engineering task under the Owner Waiver, but MUST NOT be called
  participant substitute evidence. Product U-01-U-05 remain E3-unproven unless the exact qualifying participant mix,
  task matrix, timing, error paths, feedback, blocker fixes and retest evidence exist.
- **FR-017**: Library release packages MUST emit JavaScript and declarations, declare stable entry points/files and pass
  tarball-content plus clean-consumer install/build smoke tests.
- **FR-018**: Registry publication MUST require authenticated owner credentials. Local packs or GitHub artifacts MUST NOT
  be described as npm-published packages.
- **FR-019**: The repository MUST provide current README, architecture, data/asset contracts, quickstarts, contribution,
  security, code-of-conduct, changelog and release-candidate limitations.
- **FR-020**: The online Studio gate MUST use a public URL with health, asset-path, Canvas and critical-flow evidence, or
  record an explicit deployment blocker without claiming availability.
- **FR-021**: An asset audit MUST run Khronos glTF Validator and compare each included GLB with its manifest byte length,
  SHA-256, node/stat budget, generator/source record and license.
- **FR-022**: Release evidence MUST identify durable reports/checksums separately from transient screenshots/traces.
- **FR-023**: The final release status MUST be `production-ready` only if all required E2/E3 gates pass. Otherwise it MUST
  be `release candidate; external production claims blocked` with each residual risk named.
- **FR-024**: Package and application license audit MUST cover repository LICENSE, package tarball LICENSE/third-party
  notices, bundled fonts and runtime dependencies, not only GLB assets.
- **FR-025**: Pages deployment and GitHub Release MUST depend on the starter license and deterministic generation gates;
  unlicensed local bytes MUST never enter a public build or release artifact.

## Non-Functional Requirements

- **NFR-001**: Reference-device steady-state median FPS MUST be at least 60 and 1% low at least 30 over a fixed 60-second
  camera path after a five-second warm-up.
- **NFR-002**: Selection feedback and data-to-visible-effect p95 MUST each be below 100 ms.
- **NFR-003**: Warm-cache scene activation p95 MUST be below 2 seconds.
- **NFR-004**: The 30-minute run MUST show no positive post-warm-up trend in forced-GC JS heap, DOM node count, renderer
  geometry/texture counts or owned runtime resources. Raw heap and GPU estimates are supplemental where unavailable.
- **NFR-005**: Dispose MUST leave no owned RAF, adapter connection, ResizeObserver or listener according to runtime probes.
- **NFR-006**: Starter bootstrap failure MUST leave the repository consistent and expose an actionable diagnostic; it
  MUST NOT silently create a partial project.
- **NFR-007**: Repeated starter and release artifact generation from identical inputs MUST be byte-identical.
- **NFR-008**: Critical controller browser flows MUST produce zero uncaught page/console errors and a nonblank Canvas.
- **NFR-009**: No asset, package, documentation or public claim may have unknown provenance, license or evidence class.

## Success Criteria

- **SC-001**: Clean-profile Studio opens the smart-home starter and Run shows deterministic normal/offline/alarm state.
- **SC-002**: Existing project, JSON/ZIP round-trip and save semantics remain unchanged.
- **SC-003**: Benchmark fixture shape and raw/report determinism gates pass; unsupported renderer evidence is rejected.
- **SC-004**: Chromium, Firefox and WebKit controller matrices pass or have exact engine blockers; Safari remains distinct.
- **SC-005**: Package tarballs install and build in a clean consumer without workspace source resolution.
- **SC-006**: Included assets pass validator/hash/manifest/license checks; excluded assets and reasons are listed.
- **SC-007**: All release documentation and governance files are internally consistent and link-valid.
- **SC-008**: Final Critical review closes all P0-P2 findings and records pass/blocked/waived per release gate.

## Exclusions

- No account system, cloud collaboration, plugin marketplace, billing or device control.
- No smart-home fields in the domain model and no asset-capability runtime subsystem in this release.
- No claim that controller testing is external user research, Linux WebKit is Safari, or RTX/SwiftShader is Iris Xe.
- No npm publication without credentials and no public redistribution of local assets without an explicit license grant.
