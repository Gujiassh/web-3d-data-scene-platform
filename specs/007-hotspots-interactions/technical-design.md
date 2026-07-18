# Technical Design: Hotspots And Declarative Interactions

**Date**: 2026-07-18

**Status**: Calibrated design approved for SceneDocument 1.4 implementation on 2026-07-18

**Production authority**: SceneDocument 1.3.0

## Purpose

This design turns the approved Canvas-first hotspot direction into bounded implementation modules. It freezes the
calibrated marker, projection, occlusion, picking and input protocol without placing any proposed 1.4 type, migration or
compatibility branch in production.

## Calibrated Architecture

### Runtime Surface Index

`hotspot-surface-index` owns exact runtime lookup from Asset entity ID, approved asset hash and glTF node index to one
current rigid Object3D. It also owns reverse object/node identity for placement hits and rejects SkinnedMesh,
morph-capable Mesh, InstancedMesh and BatchedMesh surfaces. It never remaps by name, traversal order, nearest triangle or
first available object.

The index converts node-local anchor position/normal to world values from the current node matrix on each required
render. Resolution failure returns a typed unavailable result; it never fabricates a world point.

### Hotspot Overlay Controller

`hotspot-overlay-controller` owns:

- one dynamically sized InstancedMesh marker batch per visual marker style;
- stable instance-index to Annotation ID mapping for pointer picking;
- camera-facing marker matrices and bounded screen-space marker size;
- one colocated DOM button proxy per visible resolved marker;
- projection, frustum, occlusion, focus retention and complete resource disposal.

Two hundred is not a capacity. Runtime grows batch capacity geometrically when required and renders every valid visible
Surface hotspot. It must not truncate markers or DOM proxies by count. Capacity growth may retain unused GPU slots, but
the active instance count and DOM eligibility remain exact.

The DOM proxy overlay belongs to framework-neutral Runtime because it is part of Viewer accessibility. Studio owns the
adjacent title editor, popover and Inspector DOM. Runtime never owns authored command/history state.

### Occlusion Policy

V1 marker and DOM-proxy occlusion uses visible opaque depth-writing model geometry. Materials with `transparent=true`,
positive transmission, `depthWrite=false`, zero opacity or invisible material state do not hide a marker. This matches
the marker depth contract without pretending translucent ordering is an opaque surface.

Occlusion runs only when a render-relevant camera, rigid-node, visibility or marker change occurs. Placement/reposition
surface raycasts run only while the corresponding authoring session is active. Idle Edit, placement-disabled and Run
must not start model-surface placement raycasts.

### Hotspot Interaction Controller

`hotspot-interaction-controller` owns one transient session at a time:

- pointer and reticle placement;
- supported-surface hit validation;
- draft marker projection;
- pointer/keyboard reposition preview;
- marker pointer activation in Run;
- synchronous invalidation on Run, source, revision, project, context-loss or dispose.

Every callback carries the session ID and exact document/revision evidence. Runtime invalidates and notifies first;
Studio closes matching editor/popover state and acknowledges before the next authority becomes interactive. Late
callbacks from invalid sessions are ignored.

### Action Interpreter

`hotspot-action-interpreter` executes the closed action set only after direct activation:

- show plain/trusted-host content;
- focus the current hotspot world point;
- focus an existing Target;
- open a revalidated absolute HTTPS link.

Every success or recoverable failure emits the Annotation ID and bounded typed result. It stores no host route,
callback, result, selection or camera state in SceneDocument.

### Viewport, React And Studio Boundaries

`three-scene-viewport.ts` remains the authority for source/mode ordering and render requests, but only constructs,
forwards to and disposes dedicated hotspot controllers. It must not absorb anchor, action, editor or command policy.

React forwards stable controlled mode/tool state, transient Runtime events and narrow placement/reposition/focus
methods. Studio owns command construction, selected hotspot ID, title/editor/popover/Inspector state, list focus and
localized feedback. The Hotspots list is separate from SceneTree.

## Document And Persistence Boundary

The complete proposed 1.4 contract remains in [data-model.md](data-model.md) and
[contracts/scene-document-1.4.md](contracts/scene-document-1.4.md). After final approval, implementation must land as one
current-contract migration program:

1. frozen raw/intermediate validation through 1.3;
2. deterministic 1.3 Annotation to opaque Legacy anchor migration;
3. complete current 1.4 validation;
4. one-transaction rewrite of every ProjectRecord or none;
5. current-only JSON/ZIP export and null export revision for rewritten records.

No Runtime, React or Studio legacy compatibility branch is permitted. ProjectRecord shape, database version/store and
archive container remain unchanged unless implementation evidence proves a separately approved change is necessary.

## Calibration Protocol

The non-production candidate is under `benchmarks/007-hotspot-calibration`. It models the proposed dedicated overlay
boundary without importing SceneDocument 1.4 or production persistence code.

Fixture and browser:

- fixture SHA-256: `3958d1fb5060a36a9e0db7374a6361abdc61770f74114c296418fab047485e4a`;
- Windows Chrome 150, RTX 3090, ANGLE D3D11;
- 1440x900 CSS pixels, DPR1;
- one fixed camera and rigid opaque surface;
- exact zero-marker and 200-visible-marker states in one Canvas/context;
- 30 warm-up plus 300 serial measured samples per primary timing path.

Calibrated gates:

| Evidence                                                                                             |  Final implementation gate | Calibrated result |
| ---------------------------------------------------------------------------------------------------- | -------------------------: | ----------------: |
| Full CPU frame work: resolve, projection, occlusion, DOM writes, marker update and render submission |               p95 <=16.7ms |            1.40ms |
| 200-marker CPU p95 delta versus zero                                                                 |                      <=2ms |            1.00ms |
| Presented RAF interval on the fixed 60Hz browser                                                     |               p95 <=17.5ms |           16.80ms |
| Dropped interval                                                                                     |               0 above 25ms |                 0 |
| GPU timer query                                                                                      |               p95 <=16.7ms |            2.17ms |
| Projection/occlusion phase                                                                           |                  p95 <=2ms |            0.40ms |
| DOM/marker update phase                                                                              |                  p95 <=2ms |            0.70ms |
| Marker pick                                                                                          | p95 <=2ms, 300/300 correct |   0.10ms, 300/300 |
| Real pointer event to following Chrome Paint                                                         |                 p95 <=50ms |            2.68ms |
| DOM proxy center error                                                                               |                 <=1 CSS px |          <0.001px |

The 17.5ms presentation threshold is an additional 60Hz cadence oracle, not a relaxation of the 16.7ms CPU-work gate;
Chrome 150 reports 16.6-16.8ms RAF intervals at 0.1ms timer granularity.

Correctness evidence also proves exact entity/hash/node resolution plus three negative identity probes; 200/200 exact
markers, DOM proxies and Canvas pixel locations; 50 opaque
visible/occluded pairs; 300-frame zero flicker; rigid-occluder and camera-motion updates; transparent material
exclusion; exact-overlap nearest picking; one trusted activation; unique accessible names; focus retention; three
two-second idle windows with zero placement raycasts; zero long tasks; and bounded Chrome style/layout/paint/composite
trace counts. Five create/update/dispose cycles restore exact scene/DOM/geometry/texture baselines, clear transient
listener/session/RAF state and retain zero post-GC heap delta. The report binds the fixture, raw sidecars and all five
harness source files by SHA-256. The raw trace sidecar retains 330 unique mark/Paint correlation rows; removing the first
30 warm-ups reproduces the reported 300-sample `2.681ms` p95.

Artifacts:

- `artifacts/performance/007-hotspot-calibration.json`
- `artifacts/performance/007-hotspot-calibration-fixture.json`
- `artifacts/performance/007-hotspot-calibration-samples.jsonl`
- `artifacts/performance/007-hotspot-calibration-trace.json`
- `artifacts/performance/007-hotspot-calibration-trace-events.jsonl`
- `artifacts/performance/007-hotspot-calibration-zero.png`
- `artifacts/performance/007-hotspot-calibration-canvas.png`

The final production task must replace the benchmark-local candidate with production controllers while retaining the
same fixture and executable gates. Calibration is not final production performance acceptance.

## Verification Oracles

1. Zero persistent mutation before title confirmation or during any canceled/rejected preview.
2. One accepted author intent equals one complete command, revision and Undo entry.
3. Exact entity/hash/node resolution only; unresolved means unavailable, not guessed.
4. WebGL marker, DOM proxy and Hotspots-list identity/visibility agree after each completed frame.
5. Hidden, offscreen, opaque-occluded and unresolved markers cannot activate from Canvas.
6. Run cannot reach a document mutation route.
7. Migration preserves every legacy value and storage rewrite is all-or-nothing.
8. No product count cap or silent truncation exists.

## Approval Gate

CHK031 closed on 2026-07-18 after the same Critical reviewer verified the retained pointer mark/Paint correlations,
source provenance, exact identity probes, cleanup and refreshed hardware evidence with no remaining findings. The user
explicitly approved the calibrated complete contract and plan on 2026-07-18, closing CHK032. Production implementation
may proceed in the approved order. Any change to the approved persistence meaning, save semantics, archive container,
ProjectRecord shape, anchor contract, action set or count-cap policy requires a new explicit decision before coding.
