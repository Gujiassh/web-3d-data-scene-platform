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

- 200-marker CPU p95 `1.00ms`; zero-marker p95 `0.30ms`; delta `0.70ms`.
- RAF interval p95 `16.80ms`; GPU p95 `1.709056ms`; zero intervals above `25ms`; zero long tasks.
- Projection and opaque occlusion p95 `0.70ms`; DOM/marker update p95 `0.70ms`.
- Pick p95 `0.10ms`, 300/300 exact; wrong entity/hash/node probes remain unresolved with no proxy or pick.
- 330 unique sequential pointer mark/Paint rows persist; after 30 warmups, 300 samples independently reproduce median
  `0.617ms`, p95 `0.836ms` and max `1.525ms` exactly.
- Five create/update/dispose cycles restore scene/DOM/geometry/texture baselines; listener/session/RAF counts and GC heap
  delta are zero.
- Fixture SHA `3958d1fb5060a36a9e0db7374a6361abdc61770f74114c296418fab047485e4a`; samples SHA
  `f3564d978fa4c30f0f9c101fc1e32c9a9e58b2c3a8318255fcc5bd206d209f91`; trace-events SHA
  `7f64ab57f877c5f7f3c5863de2a7927dbd188a0a4adf0f72616134aa5a71d1a7`; runner SHA
  `9fc77098389deded1fdc03d06837e4f1e02f4d2c228d9589b2a3de25aeee6a2d`.

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

## Document And Persistence Implementation Review

The approved T010-T015 production slice was implemented and independently reviewed on 2026-07-18. The P0 oracle was:

1. Valid 1.0-1.3 input reaches current 1.4 through every frozen stage and preserves every 1.3 Annotation value.
2. A valid current 1.4 ProjectRecord remains byte-identical, including non-canonical JSON and all eight fields.
3. Any read, parse, intermediate, current-validation or write failure leaves every ProjectRecord unchanged.
4. JSON/ZIP import accepts raw 1.0-1.4, export emits only 1.4, manifest comparison uses the raw pre-migration version,
   and archive/database/ProjectRecord shapes remain unchanged.
5. Annotation commands, locks, no-ops, stale snapshots, history, redo, cascades and duplicate behavior match the
   approved complete-snapshot contract.

The first independent review reported ambiguous URL wording and a weak current-byte fixture. Re-review against the
calibrated approval record withdrew the URL finding: the approved oracle requires the exact lower-case `https://`
prefix, accepts non-canonical `https://example.com`, and Runtime reuses the Document helper. The human-readable
contract now states that rule explicitly. The original IndexedDB owner replaced the current seed with valid,
non-canonical 1.4 JSON using reordered keys, four-space formatting and a legal Unicode escape, then proved that no
`projects.put` occurs and all bytes and fields remain exact.

Controller verification after rework: Document 9 files/138 tests, IndexedDB 1 file/12 tests, standalone current and
1.0-1.3 validators, Document typecheck, scoped ESLint, Prettier and diff checks pass. The frozen 1.3 schema is
byte-identical to the prior production schema; the current schema changes only `schemaVersion` and Annotation shape;
IndexedDB remains version 1 with the same three stores and the archive container remains 1.0.0. Native-browser
IndexedDB evidence remains part of final T040/T042 acceptance rather than this fake-indexeddb unit gate.

Independent Critical re-review status: **PASS** with no open findings. Residual risk is limited to non-exhaustive JSON
lexical variants in unit tests; the version-equality no-write branch plus a representative non-canonical current
fixture provide the required P0 evidence.

## Runtime And React Implementation Review

Controller review of the initial T020-T030 Runtime/React delivery opened these findings and returned them to the
original Runtime owner:

| ID  | Severity | Finding                                                                                       | Required oracle                                                                                                      |
| --- | -------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R1  | P1       | Multi-primitive glTF nodes put `nodes` on the parent Group and primitive identity on children | Every primitive Mesh inherits the explicit formal node mapping; nested formal nodes override it; no runtime guessing |
| R2  | P1       | Three.js raycasting includes Object3D instances hidden by self or ancestor visibility         | Hidden hits cannot receive placement or block a visible rear surface                                                 |
| R3  | P1       | Resolved annotations on hidden nodes could retain Canvas markers and Run activation           | Resolution remains available, but hidden node/ancestor state removes marker/proxy activation until visible again     |
| R4  | P1       | Unsupported foreground hits could fall through to a supported rear surface                    | Foreground unsupported surfaces reject without fallback and emit a bounded non-technical typed reason                |
| R5  | P1       | Non-interactive ghost IDs entered proxy focus order and button reconciliation was quadratic   | Ghosts have no DOM/focus/activation entry; stable marker reconciliation remains linear                               |
| R6  | P1       | Runtime-local string sorting could diverge from the localized Studio list order               | React forwards a controlled ordered-ID list; proxy roving order matches it without persistence                       |
| R7  | P1       | Stable renders performed projection/occlusion twice and reconciled DOM structure every frame  | One projection update per frame; DOM identity/order changes reconcile only when marker metadata changes              |

The rework refined only transient Runtime/React placement outcomes and controlled accessibility order. It did not
change SceneDocument, ProjectRecord, archive, save semantics or persisted anchor/action meaning.

Controller verification closed R1-R7 with 12 focused Runtime/React files and 114 tests, Runtime and React typecheck,
scoped ESLint, Prettier and diff checks. The controller then added the bounded transient `HotspotViewState` and client
CSS-pixel screen-anchor API required by Studio without exposing overlay DOM or adding a second projection pass; the
expanded focused set passes 12 files and 116 tests.

Independent Critical reviewer session `019f75ef-cf6b-7ad0-bb28-c6f17dd57332` returned **PASS** with no P0-P2
findings. It independently checked R1-R7, failed-load authority restoration, rejected pointerup propagation, StrictMode,
disposal and unresolved TS imports. Residual risk is the pending production hardware performance rerun in T043; the
existing `authoring-scene-viewer.test.ts` is also over 2,000 lines, so hotspot tests remain in dedicated files.

## Studio And Browser Implementation Review

Controller review rejected the first Studio delivery and real Chromium run. The original implementation session was no
longer resumable when work continued on 2026-07-19, so the main controller took over the bounded rework and retained the
findings here rather than opening a second overlapping implementation lane.

| ID  | Severity | Finding                                                                                | Closure oracle                                                                                 |
| --- | -------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| S1  | P1       | Keyboard placement did not match the frozen visible-reticle protocol                   | `H`, visible reticle, `8/32` CSS-pixel steps, Enter accept and Escape byte-identical cancel    |
| S2  | P1       | Marker reposition was not proven as direct manipulation with the exact drag threshold  | Under `4px` remains a click; `4px` starts one preview; one valid release creates one Undo step |
| S3  | P1       | Lock, list keyboard and Inspector paths lacked complete pre-mutation evidence          | Locked rename/reposition/delete are unavailable; list roves; Inspector stays read-only         |
| S4  | P1       | Detached RAF defaults lost their browser receiver and emitted Runtime page errors      | Default RAF/cancel methods are invocation-safe and StrictMode disposal leaves zero page errors |
| S5  | P1       | Initial E2E could pass business assertions while ignoring page/console errors          | Every hotspot and IndexedDB browser test records and rejects `pageerror` and console error     |
| S6  | P1       | Keyboard constants and their tests drifted to `1/10` after the first rework            | Runtime, unit and Chromium evidence use the approved `8/32` constants                          |
| S7  | P1       | Inspector counted UTF-16 code units instead of the approved Unicode scalar-value limit | One non-BMP scalar counts once and valid 2,000-scalar content commits exactly                  |
| S8  | P2       | A trusted-content E2E assertion matched both selected display value and list option    | The test asserts the exact semantic option with `aria-selected=true`                           |
| S9  | P1       | Studio trimmed authored title bytes and counted its 160 limit as UTF-16 code units     | Trim rejects blanks only; accepted bytes stay exact and one non-BMP scalar counts once         |
| S10 | P1       | Rejected Add/rename commands still closed the title editor and reported completion     | Rejection preserves editor/draft context and announces one localized error without mutation    |
| S11 | P1       | Studio used a random UUID where the approved creation projection required a stable ID  | Lowest-free `annotation-n` scans the complete document namespace only at confirmed Add         |

S1-S11 are closed. None changed SceneDocument, ProjectRecord, archive, database, anchor, action or save semantics.
Runtime remains the geometric/session authority; Studio remains the command/editor/list/Inspector authority.

Controller evidence on 2026-07-19:

- focused hotspot regression: 17 files / 158 tests passed after S11, including the document-wide deterministic ID
  allocator;
- full repository gate: 109 files / 728 tests, typecheck, lint, build, i18n, design, topology, Prettier and diff check
  passed sequentially; the pre-existing Vite chunk-size warning remains non-blocking;
- dedicated Chromium hotspot suite: 21/21 passed at 1280x720 and 1440x900 across English/Chinese, light/dark and
  reduced motion, including deterministic IDs, keyboard, direct drag, Run actions and zero page/console errors;
- native Chromium IndexedDB: 4/4 passed for mixed 1.0-1.3 migration, current 1.4 exact bytes/no put, invalid-record
  rollback and an enqueued-write rollback, with zero page/console errors;
- production benchmark wiring: 1 file / 5 tests passed; the retained Windows Chrome 150 / RTX 3090 report is
  `acceptanceEligible=true` and all five source hashes plus raw sidecar hashes match the current files;
- nine hotspot screenshots under `artifacts/e2e/` are retained by the repository ignore policy; their exact hashes are
  listed in `e2e-artifacts.sha256`.

Independent Critical reverse review returned **PASS** with no open P0-P2 findings. The reviewer independently bound the
post-S11 21/21 Chromium result and judged goal alignment, user-visible timing, architecture boundaries, persistence/save
contracts, unresolved TypeScript imports, browser-test honesty, S10 rejection context, S11 deterministic IDs and the
Feature 008 handoff boundary as passing. T046 is closed.

| Final Critical area                  | Status | Evidence                                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------------------------- |
| Goal alignment and user-visible flow | pass   | Frozen Canvas-first create/manage/Run semantics and post-S11 Chromium     |
| Architecture and timing boundaries   | pass   | Runtime geometry/session authority; Studio command/editor authority       |
| Persistence and save contracts       | pass   | No S1-S11 change to document, database, archive, anchor or action meaning |
| Type/import integrity                | pass   | Project typechecks plus unresolved identifier/import review               |
| Browser-test honesty                 | pass   | 21/21 hotspot and 4/4 IndexedDB tests reject page/console errors          |
| S10 and S11                          | pass   | Rejection context retained; document-wide lowest-free ID is deterministic |
| Feature 008 handoff                  | pass   | Reuse 1.4, Runtime controllers and four-action interpreter                |
| Feature 007 completion               | waived | Owner accepted the explicitly unproven T044 usability risk                |

## T044 Owner Waiver

On 2026-07-19 the project owner confirmed that five representative participants cannot be supplied and explicitly
approved an Owner Waiver. No participant data, completion rate or task time is fabricated. NFR-001, NFR-002, SC-001
and SC-002 remain unproven residual risks and must not be described as empirically passing. Feature 009 retains the
external target-developer usability gate before release claims.

Controller status: implementation, automated acceptance and Critical reverse review **PASS**. T044 is administratively
closed by the explicit Owner Waiver, so Feature 007 is complete and Feature 008 may begin.

## Delivery Ledger

- Source branch/ref: `main` at `9149cd9`, equal to `origin/main` when Feature 007 implementation began.
- Repair branch: `main`; the approved implementation and S1-S11 rework were committed as `43e11f2` and pushed to
  `origin/main` on 2026-07-19.
- Symptom/root cause record: Document/Persistence, Runtime/React and Studio findings are preserved above as the P0
  current-byte fixture correction, R1-R7 and S1-S11 with their closure oracles.
- Changed scope: SceneDocument 1.4 migration/commands/archive/IndexedDB; Runtime/React hotspot controllers and lifecycle;
  Studio authoring/Run UX; E2E, production benchmark and acceptance documentation.
- Verification: 17/158 focused, 109/728 full Vitest, 21/21 hotspot Chromium, 4/4 native IndexedDB, 5/5 production wiring,
  accepted hardware calibration, nine checked screenshot hashes and all sequential repository gates.
- Downstream target: `main`, already integrated by the direct push above; no merge or cherry-pick remains. The T044
  Owner Waiver clears the documented Feature 008 start gate without asserting usability evidence.

## Approval And Implementation Closure

The user explicitly approved the reviewed calibrated implementation package on 2026-07-18, closing CHK032. The
approved migration and automated production acceptance now pass, so SceneDocument 1.4 is the production authority.
T044 is owner-waived and T046/T047 are closed. Feature 007 is complete with the missing real-user evidence retained as
an explicit release-stage risk.
