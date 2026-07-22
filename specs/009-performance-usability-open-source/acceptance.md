# Acceptance: Performance, Usability And Open-Source Release

## Judgment

Feature 009 engineering is complete locally at implementation commit `a0222c8c9a05b2495303e7e37ea68624dcf39320`.
The Feature 009 source and acceptance baseline is pushed to `origin/main` through
`9839fe7`.
The result is not production-ready because required E2/E3, redistribution and publication gates remain unresolved.

> Release candidate; external production claims blocked.

Every gate below is `pass`, `blocked` or `waived`. A blocker ruling or Owner Waiver closes the engineering schedule only;
it never upgrades E0/E1 evidence to E2/E3.

## Gate Matrix

| Gate        | Status  | Evidence | Judgment and residual risk                                                                                                                                                                 |
| ----------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product     | waived  | E1/E3    | Controller critical flows and smart-home rehearsal pass. Five qualifying external participants are unavailable under Owner Waiver; external usability remains unproven.                    |
| Contract    | pass    | E0/E1    | SceneDocument 1.4, migration, JSON/ZIP/archive, existing-project, New Scene, IndexedDB and bootstrap atomicity tests pass with unchanged save semantics.                                   |
| Runtime     | pass    | E0/E1    | 300-entity fixture, 200 Patch/s, alarm/state flow and 22 zero-resource dispose probes pass. Performance thresholds are judged separately.                                                  |
| UI          | blocked | E1/E2    | Chromium 149 and Playwright Firefox 151 pass. Linux Playwright WebKit published host passes, but Studio Blob persistence is blocked; stable Firefox E2 and real Safari E2 are unavailable. |
| Performance | blocked | E1/E2    | SwiftShader is ineligible; FPS and selection/Patch p95 fail in software, forced-GC heap slope is `+0.054822 bytes/ms`, and the required Iris Xe run is unavailable.                        |
| Assets      | blocked | E0/E1    | Three tracked GLBs and font licenses pass. The local 38-asset smart-home archive is deterministic, but public redistribution authorization is unavailable.                                 |
| Open source | blocked | E0/E1    | Source is pushed and non-publishing CI passes. Pages, GitHub Release and npm publication remain blocked by license, credentials and explicit publication authorization.                    |

## Requirement Coverage

| Requirement | Status  | Evidence or blocker                                                                                                                                    |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-001      | pass    | All seven release gates are judged above with evidence class and residual risk.                                                                        |
| FR-002      | pass    | Existing projects open without starter fetch/save; clean repository bootstrap is atomic and covered by unit plus E2E lifecycle tests.                  |
| FR-003      | pass    | Explicit New Scene remains the existing empty project path.                                                                                            |
| FR-004      | pass    | Starter uses SceneDocument 1.4, archive 1.0.0 and ordinary repository snapshots; no room/template/device schema was added.                             |
| FR-005      | pass    | Descriptor length/SHA/project ID and every selected GLB are verified before first save; repeated archives are byte-identical.                          |
| FR-006      | pass    | Public generation fails without a hash-complete license record; `smart_toilet` and `recessed_downlight` are exact `NO-SHIP` exclusions.                |
| FR-007      | pass    | 61 external instances and five views use the explicit asset-ID layout; no name/order/bounds inference.                                                 |
| FR-008      | pass    | Five Targets use fixed asset-hash/semantic-target/node-index records; node names only assert the fixed index.                                          |
| FR-009      | pass    | One online Mock source produces three ready, one offline and one alarm binding value plus two alarms without persisting runtime state.                 |
| FR-010      | blocked | Local content covers all required rooms/devices, but the word `public` remains unsatisfied until redistribution is authorized.                         |
| FR-011      | pass    | Fixture validates 300 entities, 150 Targets, 100 enabled Bindings, 190,000 triangles, 100 draw calls, 12,373,416 GLB bytes, 200 Patch/s and 10 alarms. |
| FR-012      | pass    | Raw frame/selection/Patch/activation/memory/disposal samples and formulas are retained with source and fixture identity.                               |
| FR-013      | pass    | Report records CPU/RAM/OS/browser/viewport/DPR/renderer and rejects SwiftShader as E2; named reference power/hardware evidence remains blocked.        |
| FR-014      | pass    | Explicit Chromium, Firefox and WebKit projects share Studio/host semantic flows while preserving engine identity.                                      |
| FR-015      | pass    | Linux WebKit is never labeled Safari; real Safari has an explicit E2 blocker.                                                                          |
| FR-016      | pass    | Controller evidence is E1 and E3 is explicitly Owner-Waived, not substituted.                                                                          |
| FR-017      | pass    | Four `0.1.0-rc.1` packages emit ESM/declarations and pass deterministic pack plus clean-consumer builds.                                               |
| FR-018      | pass    | No npm publication claim or registry action occurred.                                                                                                  |
| FR-019      | pass    | README, architecture, protocols, tutorial, governance, changelog and release limitations are tracked and link-audited.                                 |
| FR-020      | pass    | Public deployment is explicitly blocked by the owner-asset redistribution gate; no online availability claim is made.                                  |
| FR-021      | pass    | Tracked-asset audit verifies SHA, bytes, license and Khronos validator `0 errors / 0 warnings`.                                                        |
| FR-022      | pass    | Canonical reports and checksums are listed below; screenshots/traces are labeled transient.                                                            |
| FR-023      | pass    | Final status uses the required release-candidate wording and names every unresolved gate.                                                              |
| FR-024      | pass    | Repository/package licenses, tarball notices, runtime dependencies and IBM Plex font OFL texts are verified.                                           |
| FR-025      | pass    | No deployment/release workflow or artifact includes local owner bytes; publish tasks remain blocked.                                                   |
| NFR-001     | blocked | Software result is 7.24 median FPS / 2.27 1% low and is not E2; Iris Xe is unavailable.                                                                |
| NFR-002     | blocked | Software selection p95 is 329.7 ms and Patch p95 is 219.6 ms; no qualifying E2 pass exists.                                                            |
| NFR-003     | pass    | Warm-cache activation p95 is 224.3 ms over 20 activations.                                                                                             |
| NFR-004     | blocked | DOM/geometry/texture/resource series are flat and heap final is bounded, but forced-GC heap slope is positive.                                         |
| NFR-005     | pass    | All 22 disposal probes report zero RAF, observer, listener, interval, adapter and renderer ownership.                                                  |
| NFR-006     | pass    | Failure/retry leaves 0 projects/0 assets, clears stale diagnostics and creates exactly one project after retry.                                        |
| NFR-007     | pass    | Two smart-home outputs, the benchmark fixture and each package tarball are byte-identical for identical inputs.                                        |
| NFR-008     | pass    | Accepted controller flows have zero application errors and nonblank Canvas evidence.                                                                   |
| NFR-009     | pass    | Unknown-license owner bytes remain local and blocked; every tracked/public asset and claim has provenance and evidence class.                          |
| SC-001      | pass    | Fresh Chromium opens `90 m2 Smart Home` and Run proves ready/offline/alarm state.                                                                      |
| SC-002      | pass    | Existing project, migration, save, JSON/ZIP/archive and recent/open semantics pass unchanged.                                                          |
| SC-003      | pass    | Fixture/determinism contracts pass and SwiftShader is rejected as a qualifying performance renderer.                                                   |
| SC-004      | pass    | Chromium/Firefox pass; WebKit/Safari limitations have exact engine-specific blockers.                                                                  |
| SC-005      | pass    | Framework-neutral and React consumers install/typecheck/build solely from packed tarballs.                                                             |
| SC-006      | pass    | Included tracked assets pass; smart toilet and recessed downlight are explicitly excluded with reasons and hashes.                                     |
| SC-007      | pass    | `verify:docs` checks 12 required files and 39 local links.                                                                                             |
| SC-008      | pass    | Critical review closes all implementation P0-P2 findings and retains blocked/waived release gates.                                                     |

## Durable Evidence

- Smart-home output A: `/home/cc/tmp/web3d-smart-home-final-20260721-a.OKfldy`; output B:
  `/home/cc/tmp/web3d-smart-home-final-20260721-b.313cMN`.
- Smart-home archive: `56e2de585df7a910015b73b146090c4f5df1f50ddefea5b474be8724599bdd24`, 13,594,283 bytes.
- Smart-home descriptor: `e13cf195c77af26ffbd1dcfe62fa93a8cfa4000783a8c064fbcb5c695ca0b9e7`.
- Smart-home report: `7891d694b15ef66ce805b917e3e3b8d614032ea28076dc234df22a1487fb0e6b`.
- Chromium smart-home E1 evidence: `/home/cc/tmp/web3d-smart-home-controller-20260721.xIKcQr/evidence.json`,
  SHA-256 `6c2a4e56dae364bcdf244820405d67edf0e2021c8c9d421ef665938e51db5187`.
- Performance report: `/home/cc/tmp/web3d-release-performance-canonical-e1-final/009-release-performance.report.json`,
  SHA-256 `5092e6948407ab26ad80a3621d478c8a8778cb99a8c7cc8c1c45902529694bb0`.
- Performance raw JSONL SHA-256: `bfdf2741f831308b98230e4497ff21b117321775e602dc17fc8626da36f1750b`;
  Canvas SHA-256: `12046b93b4f3a7f26390dd1f75e932674a493a284022fbcc17a5f0acb4288171`.
- Browser E1 directories: `/home/cc/tmp/playwright/feature009-chromium-firefox-final` and
  `/home/cc/tmp/playwright/feature009-webkit-final2`. Screenshots/traces are transient; exact browser identity/runtime
  JSON and the blocked WebKit Blob diagnostic are the semantic evidence.

## Verification

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build`: PASS.
- `pnpm test`: PASS, 124 files / 787 tests.
- `pnpm test:e2e`: PASS, 62 passed / 3 exact WebKit Studio skips, 65 tests using one worker.
- `pnpm verify:docs`, `verify:i18n`, `verify:assets`, `verify:topology`, `verify:design`, `verify:smart-home`: PASS.
- `pnpm verify:packages`: PASS, four deterministic tarballs plus framework-neutral/React clean consumers.
- GitHub Actions CI run `29888155657`: PASS, all repository gates green on `9839fe7`.

## Blocking Owner Actions

1. Provide redistribution authorization covering all 38 selected owner-asset hashes.
2. Run the benchmark on the specified Iris Xe reference device and resolve any failed performance gate.
3. Provide stable Firefox E2 and real Safari E2 environments.
4. Replace the E3 Owner Waiver with the specified qualifying participant evidence if production usability is claimed.
5. Explicitly authorize GitHub Release, npm and Pages publication and provide the required credentials only after the
   preceding gates allow release.
