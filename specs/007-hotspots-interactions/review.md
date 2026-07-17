# Critical Design Review: Hotspots And Declarative Interactions

**Date**: 2026-07-17
**Reviewer session**: `019f647f-ef1c-7a51-9833-f0ac1acedbfb` (reused for initial review and re-review)
**Scope**: Product UX, accessibility, SceneDocument 1.4 proposal, migration/save contract, Runtime boundaries and
performance evolution
**Final status**: PASS for user direction approval; production implementation remains blocked

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

## Remaining Gates

- CHK031: non-production marker/performance calibration.
- CHK032: reviewed calibrated implementation plan/tasks and explicit final implementation approval.

SceneDocument 1.3 remains the only production authority until CHK032 closes.
