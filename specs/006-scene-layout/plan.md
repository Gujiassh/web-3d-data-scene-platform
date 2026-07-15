# Implementation Plan: Scene Layout

**Branch**: `main` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

## Summary

Deliver a focused scene-layout slice inside the single Studio: stable tree/Canvas multi-selection, Group
creation, explicit world-pose-preserving reparent, deterministic align/distribute, atomic offset
duplication, interactive grid/angle/scale snap, transient bounds anchors and spatial feedback. All
persistent output is expressed through existing `SceneEntity.parentId` and `SceneEntity.transform`
fields. The feature adds authoring commands and the approved Viewer/React authoring API, but does not add
or reshape any SceneDocument, archive, ProjectRecord, IndexedDB or save field.

## Technical Context

**Language/Version**: TypeScript 6.0, React 19

**Primary Dependencies**: Three.js 0.185, `@web3d/document`, `@web3d/runtime`, `@web3d/react`, Vite 8,
lucide-react

**Storage**: Existing IndexedDB project repository and JSON/ZIP archive codecs; no new store, version or
record field

**Testing**: Vitest 4, fake-indexeddb, Playwright 1.61 with real WebGL and machine-parsed downloads

**Target Platform**: Node.js 22.12+ tooling and modern desktop Chromium with WebGL and IndexedDB

**Project Type**: pnpm workspace with one Studio application and reusable document/runtime/react
packages

**Performance Goal**: On the fixed four-entity fixture, an accepted layout handler updates revision and
critical spatial-feedback DOM through the next animation-frame opportunity within 100 ms. Canvas pixels
are sampled afterward as independent visual evidence.

**Constraints**: Preserve `SceneDocument 1.0.0`, archive, ProjectRecord, IndexedDB and save payload shapes;
runtime/session state is not persisted; every action is one atomic revision/history entry; stable IDs,
coordinates and fixed enums replace all name/order/first-available inference; invalid TRS decomposition is
rejected without approximation

**Scale/Scope**: Four fixed asset entities, nested groups, one existing data-bound target, same-parent
multi-selection, world-axis layout and transient geometric snapping; this is not a large-scene performance
or general modeling milestone

## Governance Check

The repository has no `.specify/memory/constitution.md`. Active governance comes from the product SSoT,
`specs/001-product-foundation`, this feature contract, root gates and the workspace risk-based review
protocol.

| Gate                    | Pre-design | Post-design response                                                                                         |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| Goal alignment          | PASS       | The slice demonstrates credible spatial authoring without expanding into DCC, hotspot or publish scope.      |
| User-visible sequence   | PASS       | Group, reparent, layout, snap and feedback form one Studio Edit workflow; Run remains read-only.             |
| Architecture boundaries | PASS       | Document owns atomic persistence; runtime owns measurement/preview; React bridges; Studio owns interaction.  |
| Data/save contracts     | PASS       | Existing parent and transform fields carry all authored output; every save and archive shape remains frozen. |
| Deterministic identity  | PASS       | Stable IDs, explicit primary, coordinates and fixed anchor enums are the only identity/order inputs.         |
| Runtime isolation       | PASS       | Selection, settings, bounds, anchors, pivot, delta and preview are transient and payload-scanned.            |
| Internal contracts      | PASS       | The user approved additive selection/settings/spatial Viewer and React APIs; existing methods remain.        |
| Transform correctness   | PASS       | Reparent preserves world pose only when the result recomposes as existing TRS within a fixed epsilon.        |
| Accessibility/i18n      | PASS       | Commands, statuses, errors and accessible names cover English/Chinese and both themes.                       |
| Verification            | PASS       | Unit, P0 persistence, real-WebGL, pixels, responsive screenshots, extraction and full gates are required.    |

## Contract Oracle

The following sources are frozen for feature 006 except generated or unrelated baseline churn explicitly
approved by the main controller:

- `packages/document/src/types.ts` SceneDocument field shapes and schema version;
- `specs/001-product-foundation/contracts/scene-document.schema.json` and generated validator meaning;
- archive manifest, JSON/ZIP payload layout and asset URI/hash behavior;
- `apps/studio/src/project/types.ts`, IndexedDB database/store version and persisted project record fields;
- autosave, export and project-switch transaction meaning.

Accepted implementation changes may add `DocumentCommand` variants, authoring runtime types/methods,
React bridge props/handle methods, Studio session/view models, controls, translations, tests and fixtures.
Any need for a new persisted field stops implementation for explicit contract approval.

P0 acceptance records one canonical document before layout and after the complete workflow. It deep
compares JSON, parsed ZIP and IndexedDB `documentJson`, verifies the exact ProjectRecord field set, checks
the GLB bytes/hash and rejects selection, primary, settings, bounds, anchors, pivot, hover, preview,
matrices, Object3D or layout diagnostics anywhere in persistence.

## Architecture

### Persistent Document Boundary

`packages/document` owns pure, all-or-nothing commands. It does not inspect DOM, Object3D, loaded geometry,
timers, pointer events or IndexedDB. Proposed command families are:

- `create-group`: add one explicit caller-ID unlocked destination Group and apply explicit before/after
  parent+transform patches to roots with the same before-parent;
- `reparent-entities`: apply explicit before/after parent+transform patches to roots with the same
  before-parent and one explicit unlocked Group/root destination;
- `layout-entities`: apply explicit before/after transform patches for align, distribute or committed snap;
- `duplicate-layout`: clone explicit selected subtrees/targets with complete caller-provided ID maps and an
  explicit offset.

Every command validates all IDs, before snapshots, operation-specific local locks, common-parent
assumptions, cycles, finite TRS, positive scales and duplicate IDs before producing a candidate. Direct
group/reparent/layout/snap edits reject locked entities and locked destination Groups. Duplicate accepts a
locked source because it leaves the source unchanged; the copy inherits `locked`. One command revises
once. A no-op returns the original document and preserves redo history. Undo and Redo use the existing
full-document snapshots and monotonic revision semantics.

### Transient Runtime Boundary

`packages/runtime` owns loaded-world measurements and interactive preview:

- a stable multi-selection set plus explicit primary;
- world matrices, nullable axis-aligned bounds and pivots tied to document ID/revision;
- TransformControls translation, rotation and scale snap settings;
- combined selection/pivot/axis/delta overlays;
- center and six face-center anchor candidates derived from current snapshots for an explicitly picked
  target;
- stale-measurement and unavailable-geometry diagnostics.

Measurements are snapshots, not authored state. Runtime never applies a document mutation. It emits a
preview/commit proposal with explicit stable IDs and transforms; Studio builds one document command.

### Approved Additive Authoring API

The implementation may add these backward-compatible methods to runtime and React authoring handles:

```ts
selectEntities(ids: readonly string[], primaryId: string | null): void;
setTransformSettings(settings: AuthoringTransformSettings): void;
getEntitySpatialSnapshots(ids: readonly string[]): readonly EntitySpatialSnapshot[];
```

React adds corresponding controlled props for selected IDs, primary ID and transform settings. It adds no
public event variant or multi-selection callback. Existing `entity-selection-change` continues to
represent a Canvas primary/single click; Studio owns the multi-selection set and synchronizes it through
controlled props/handle calls. Existing `selectEntity(id)` remains and maps to zero-or-one selection.
Existing source/load, data runtime and single-entity focus contracts remain.

### Studio Boundary

Studio owns selection intent, layout mode, command availability, inputs and diagnostics:

- Ctrl/Cmd tree selection toggles stable IDs; an existing Canvas selection event represents a primary or
  single click and Studio updates its owned multi-set before synchronizing controlled props;
- the last explicitly selected ID is primary; removing it chooses the most recently explicit remaining ID,
  never a name/order-derived entity;
- Group, reparent, align, distribute and duplicate-layout are enabled only for selected roots with one
  explicit shared before-parent;
- create-group/reparent use one explicit Group/root destination, require a destination Group to be
  unlocked and never compute a hidden common ancestor;
- translation, rotation and scale snap settings are finite positive session values and reset with the
  authoring session;
- feedback names the pivot kind, world coordinates, active axis, delta and enabled snaps;
- Run mode disables every layout command and interactive transform setting.

## Transform And Layout Semantics

### Same-Parent Roots

Selection normalization removes any selected descendant whose ancestor is also selected. Group, reparent,
align, distribute and duplicate-layout require the remaining roots to share exactly one before-parent ID,
including `null` for scene root. Create-group/reparent accept exactly one explicit destination Group/root;
the destination Group must be unlocked.

### World-Pose-Preserving Reparent

For each moved root:

```text
oldWorld = worldMatrix(entity)
newLocal = inverse(newParentWorld) * oldWorld
candidateTRS = decompose(newLocal)
```

The planner recomposes `candidateTRS` and compares every matrix component against `newLocal` with a fixed
epsilon chosen and recorded in tests. Non-finite values, non-positive scale or excess residual indicate
non-representable shear and reject the entire action. The document command receives explicit before/after
parent and TRS snapshots and independently validates current document values before committing.

### Align And Distribute

Runtime returns spatial snapshots keyed by entity ID and document revision. Empty Groups retain a world
matrix/pivot but return `worldBounds: null`; align, distribute and Group pivot calculations require
non-null bounds. Align translates entities so their selected min/center/max AABB anchor matches the primary
entity's anchor on explicit X/Y/Z.
Distribution sorts by world-bounds center coordinate and stable ID, keeps the outer pair fixed, and assigns
equal clear gaps between adjacent AABBs. Rotation and scale are unchanged. Missing, hidden, locked or stale
measurements reject the complete action.

### Duplicate Layout

Duplication preserves selected-root order only as an explicit ID-keyed proposal, not document order. It
clones complete subtrees and targets using caller-provided IDs, clears business IDs and does not clone
bindings, rule sets or annotations, matching M1. A locked source is valid because duplication does not
modify it; every copy inherits the source `locked` value. One explicit offset changes only duplicated root
local positions, never their inherited parent IDs, while descendant local transforms stay unchanged.
Selection changes to the new root IDs only after commit.

### Snapping And Feedback

- Translation snap is a positive world-grid step in the current document unit.
- Rotation snap is a positive degree step converted only for interactive controls.
- Scale snap is a positive component increment; committed scale must remain positive.
- Bounds anchors are `center`, `minX`, `maxX`, `minY`, `maxY`, `minZ`, `maxZ` from loaded world AABBs.
- Bounds anchors are not a transform setting. Studio explicitly identifies source/target entities, requests
  current spatial snapshots and derives one ordinary transform command. Null required bounds disable only
  this bounds-dependent action.
- Candidate world distance wins; equal distance uses target entity ID, then fixed anchor enum order.
- The preview overlay and spatial feedback are transient. Only the final existing TRS is committed through
  the normal document-command boundary.

No custom pivot, semantic connector, node-name inference, surface/vertex snap or persisted snap preference
is introduced.

## Fixed Fixture And Evidence

The topology/QA/docs lane creates `tests/fixtures/006-layout/` with:

- `layout.scene.json`: four stable asset instances plus an empty group, asymmetric representable TRS and
  one preserved feature-005 target/binding;
- `layout-oracles.json`: expected selected roots, parent IDs, transforms, world matrices/bounds and revision
  deltas for each accepted step;
- `README.md`: source asset, hash, unit, coordinate frame, matrix epsilon and generation rules.

The fixture reuses `tests/fixtures/m0-factory/public/m0-factory-cell.glb` without copying or changing its
1216-byte payload or accepted SHA-256. The browser fixture archive is produced through the public archive
codec with a fixed timestamp. Synthetic unit documents cover cycles, stale snapshots, duplicate IDs,
negative/zero scale and rotated non-uniform-parent shear rejection.

Real-browser evidence covers the complete workflow, one revision/history entry per action, invalid action
no-op, full Undo/Redo, autosave/reload, JSON/ZIP/IndexedDB deep comparison, stable Canvas identity, page
overflow, control overlap, screenshots and Canvas pixels. English/light is covered at 1440x900 and
Chinese/dark at 1280x720 without an unnecessary full theme matrix.

## Project Structure

```text
specs/006-scene-layout/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── contracts/README.md
└── checklists/requirements.md

packages/document/src/commands/    # atomic group/reparent/layout/duplicate commands
packages/runtime/src/authoring/    # transform settings, spatial snapshots, snapping controllers
packages/runtime/src/viewer/       # thin integration; no new mixed-responsibility block
packages/react/src/                # approved additive AuthoringScene bridge
apps/studio/src/                   # hierarchy/layout controls, transient selection/settings, i18n
tests/fixtures/006-layout/          # deterministic source/oracle; shared M0 GLB bytes
tests/e2e/                          # real-WebGL feature 006 acceptance
docs/ssot/                          # stable implementation and verification facts after acceptance
```

`packages/runtime/src/viewer/three-scene-viewport.ts` entered this slice at 1008 lines. New layout
measurement, snap resolution and overlay behavior must be implemented in focused modules and composed by
the viewport; feature 006 must not turn the viewport into the owner of layout policy or Studio decisions.

## Fixed Implementation Lanes

| Lane             | Exclusive write set                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Document/runtime | `packages/document/**`, `packages/runtime/**`, `packages/react/**`; pure commands, spatial runtime and approved API |
| Studio UI        | `apps/studio/**`, shared presentation only when required; selection, controls, orchestration, i18n and styles       |
| Topology/QA/docs | `tests/e2e/**`, `tests/fixtures/006-layout/**`, `docs/ssot/**`, `specs/006-scene-layout/**`, root verification docs |

The main controller owns architecture arbitration, cross-lane integration, task status, full gates and
delivery. Review findings return to the original responsible conversation for rework; reviewers do not
patch another lane's files. No two implementation lanes edit the same file concurrently.

## Delivery Order

1. Freeze commands, transform math, transient types and fixture/oracle contracts.
2. Implement runtime/React multi-selection and spatial snapshot foundations.
3. Complete tree/Canvas selection, Group and explicit reparent as the first independent browser slice.
4. Add align, distribute and atomic offset duplicate on the accepted hierarchy boundary.
5. Add grid/angle/scale snap, bounds anchors and pivot/spatial feedback in focused runtime modules.
6. Run P0 persistence and real-WebGL acceptance, then independent contract/frontend/runtime/QA reviews.
7. Send every finding back to its fixed lane, rerun affected and full gates, then write accepted SSoT.

## Risk Register

| Risk                                     | Severity | Mitigation                                                                                |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| Reparent creates non-representable shear | High     | Decompose/recompose matrix; fixed epsilon; reject complete action without approximation   |
| Runtime bounds are stale during commit   | High     | Include document ID/revision and before snapshots; allow null only for non-bounds actions |
| Multi-select API breaks single selection | High     | Keep `selectEntity`; map it to zero-or-one; compatibility and StrictMode tests            |
| Layout loop creates partial history      | High     | One pure batch command; validate all patches before revise; one revision oracle           |
| Bounds anchors misrepresented as ports   | High     | Fixed geometric enum, explicit target, no persistence and clear non-goal                  |
| Duplicate copies business meaning        | High     | Preserve M1 target/lock/parent semantics; clear business ID; do not copy binding meaning  |
| Viewer file gains more responsibilities  | Medium   | Dedicated spatial, snap and overlay modules; viewport only coordinates lifecycle          |
| Responsive controls crowd the workspace  | Medium   | Compact toolbar/menu surfaces, two target viewports, overlap and clipping assertions      |
| Fixture only proves trivial transforms   | Medium   | Asymmetric rotations/scales plus synthetic shear/cycle/stale negative unit cases          |

## Acceptance Gate

Planning completes when coded-point extraction reports 18 FR, 6 NFR and 6 SC with no duplicates/orphans;
task extraction reports 30-40 unique tasks; requirement checklist, Prettier and diff checks pass.
Implementation acceptance additionally requires focused and full unit/type/lint/build/i18n/design tests,
real Chromium E2E, P0 JSON/ZIP/IndexedDB comparison, fixture bytes/hash, screenshots, Canvas pixel checks
and independent reviews with zero unresolved findings.
