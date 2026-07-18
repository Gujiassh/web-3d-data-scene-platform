# Critical Design Review: Hotspots And Declarative Interactions

**Date**: 2026-07-17; calibration closure 2026-07-18
**Direction reviewer session**: `019f647f-ef1c-7a51-9833-f0ac1acedbfb`
**Calibration reviewer session**: `019f6412-5bac-78d2-8c95-e7613e684fc2` (reused for finding and re-review)
**Scope**: Product UX, accessibility, SceneDocument 1.4 proposal, migration/save contract, Runtime boundaries and
performance evolution
**Final status**: PASS through CHK031; explicit user implementation approval closed CHK032 on 2026-07-18

## Semantic Oracle

1. Authors create and edit through Canvas-first direct manipulation without coordinates, IDs, normals, content keys or
   Action JSON.
2. Preview/cancel makes zero persistent changes; one confirmed intent creates one command and one Undo step.
3. Surface identity is exact and no Target/node/surface is guessed.
4. Every valid legacy document migrates without inventing old offset meaning or losing values.
5. Runtime owns geometric interaction; Studio owns DOM/editor and command state; authority transitions close both before
   the next mode/source is interactive.
6. WebGL marker actions have a real accessible DOM path.
7. Schema production work starts only after direction approval, calibration, calibrated plan review and final approval.

## Initial Findings And Closure

| ID  | Severity | Initial finding                                                                   | Closure                                                                                                                              |
| --- | -------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | P0       | A 200-document cap and trimmed title could not migrate all valid 1.3 data         | 200 now limits Surface anchors only; legacy counts and title bytes remain valid; command boundary rejects new whitespace-only titles |
| F2  | P1       | Migration invented a Target-local coordinate frame for underdefined `localOffset` | Legacy anchor now preserves opaque `targetId/localOffset`, renders no marker and converts only through explicit Reposition           |
| F3  | P1       | Runtime was asked to clean Studio DOM state without an executable ownership order | Session IDs, Runtime invalidation/notification, Studio matching close/ack and transition gate are explicit                           |
| F4  | P1       | Three.js markers had no real keyboard focus model                                 | Visible markers have colocated DOM button proxies with roving focus and shared activation                                            |
| F5  | P1       | Checklist implied direction approval could unfreeze production 1.3                | Only CHK032 final implementation approval can unfreeze production schema/code                                                        |
| F6  | P2       | Morph/BatchedMesh exclusions disagreed across artifacts                           | All artifacts exclude SkinnedMesh, morph-target Mesh, InstancedMesh and BatchedMesh                                                  |
| F7  | P2       | Canvas commit moved focus unexpectedly to the left list                           | Canvas commit focuses colocated marker proxy; list-initiated work retains list focus                                                 |
| F8  | P1       | Calibration runner failed root typecheck under `exactOptionalPropertyTypes`       | Type-only CDP event shape fix, full hardware rerun, refreshed source-bound artifacts and passing root/workspace typecheck            |

## Final Review Matrix

| Area                        | Status | Evidence                                                                                            |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Goal alignment              | pass   | Direct placement, adjacent title editor, compact actions and no technical fields                    |
| UX flow/timing              | pass   | Single-shot state model, exact commit/cancel rules and measurable usability targets                 |
| Accessibility               | pass   | DOM marker proxies, list parity, focus restoration, live regions and reduced motion                 |
| Data/save contract          | pass   | Closed anchor/content/action unions, complete commands and no runtime state persistence             |
| Migration/archive/IndexedDB | pass   | Opaque legacy mapping, frozen validators, atomic rewrite and current-only export                    |
| Runtime boundaries          | pass   | Dedicated controllers/indexes, session cancellation handshake and thin viewport forwarding          |
| Performance/evolution       | pass   | No product count cap; 200-visible baseline requires calibration and preserves Feature 008 ownership |

## Evidence

- `pnpm verify:design`: PASS.
- `pnpm exec prettier --check specs/007-hotspots-interactions`: PASS.
- `git diff --check`: PASS.
- Spec point extraction: 52 definitions (`33 FR`, `10 NFR`, `9 SC`), zero duplicate definitions and zero orphan
  references.
- No production source, schema, archive, IndexedDB or Runtime code changed in this design slice.

## Calibration Re-Review

The final accepted run used Windows Chrome 150, RTX 3090/ANGLE D3D11, 1440x900 DPR1. The benchmark report is
`acceptanceEligible=true` and binds the fixture, raw sidecars and all five harness source files by SHA-256.

- 200-marker CPU p95 `1.40ms`; zero-marker p95 `0.40ms`; delta `1.00ms`.
- RAF interval p95 `16.80ms`; GPU p95 `2.16576ms`; zero intervals above `25ms`; zero long tasks.
- Projection/occlusion p95 `0.40ms`; DOM/marker update p95 `0.70ms`.
- Pick p95 `0.10ms`, 300/300 exact; wrong entity/hash/node probes remain unresolved with no proxy or pick.
- 330 unique sequential pointer mark/Paint rows persist; after 30 warmups, 300 samples independently reproduce median
  `1.817ms`, p95 `2.681ms` and max `6.199ms` exactly.
- Five create/update/dispose cycles restore scene/DOM/geometry/texture baselines; listener/session/RAF counts and GC heap
  delta are zero.
- Fixture SHA `3958d1fb5060a36a9e0db7374a6361abdc61770f74114c296418fab047485e4a`; samples SHA
  `284b35fe6f5b6a3e6af2f0d4ac825e99933ab7571d41a3ea6f555c9bcee7776b`; trace-events SHA
  `8ea704a8c643ad9c0427c9ebc7abe1346397e3508b50b6e00a4409eee79d29d9`; runner SHA
  `85fb5f552461c0ee94eff266c498fc870ec3d292265cf2f3b3eeec742d6b4e22`.

| Critical area                              | Status         | Evidence                                                               |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------- |
| Goal alignment and non-production scope    | pass           | Candidate remains isolated from production/schema code                 |
| User flow and pointer timing semantics     | pass           | Real pointer input and retained Chrome Paint correlations              |
| Architecture and runtime/persistence split | pass           | Dedicated candidate boundaries; zero runtime-only persisted state      |
| Data/save implementation                   | not applicable | SceneDocument 1.3 remains production authority                         |
| Type safety and unresolved identifiers     | pass           | Root, E2E and all workspace typechecks pass                            |
| Exact identity, picking and occlusion      | pass           | Positive/negative identity, nearest overlap and opaque-policy evidence |
| Performance and accessibility              | pass           | CPU/GPU/RAF/projection/DOM proxy gates pass                            |
| Cleanup and memory lifecycle               | pass           | Five cycles, listener/session/RAF cleanup and zero GC heap delta       |
| Artifact/source provenance                 | pass           | Fixture, source and raw sidecar hashes independently match             |
| Documentation and SSoT alignment           | pass           | Calibrated values and gate state match current artifacts               |
| SceneDocument 1.4 implementation           | not applicable | No production implementation exists                                    |
| CHK032 implementation approval             | pass           | Explicit user approval received on 2026-07-18                          |

Final verification: benchmark test 1 file/5 tests; repository tests 92 files/560 tests; typecheck, lint, build, i18n,
topology, design, Prettier and diff checks all pass. The existing build chunk-size warning is unrelated to this
non-production slice.

## Approval Closure

The user explicitly approved the reviewed calibrated implementation package on 2026-07-18, closing CHK032. Production
implementation may proceed in the approved order. SceneDocument 1.3 remains production authority until the approved
migration is implemented and accepted.
