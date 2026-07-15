# Feature Specification: Scene Layout

**Feature Branch**: `006-scene-layout`

**Created**: 2026-07-15

**Status**: Accepted

**Input**: Deliver hierarchy organization, deterministic multi-entity layout and transient snapping in
the single Studio without changing persisted scene or project contracts.

## User Scenarios & Testing

### User Story 1 - Organize A Scene Hierarchy (Priority: P1)

A scene author selects several related asset instances, creates a group and explicitly moves entities
between that group and the scene root while their visible world poses remain unchanged.

**Why this priority**: A flat scene tree stops being usable as soon as an evaluator imports enough
objects to form a real equipment cell or facility area.

**Independent Test**: Open the fixed layout scene, select same-parent entities by stable ID, create one
group, reparent one selected root into and out of it, and confirm tree hierarchy, Canvas selection and
world transforms remain consistent through Undo and Redo.

**Acceptance Scenarios**:

1. **Given** two same-parent asset entities are selected, **When** the author creates a group, **Then**
   one stable group is added, both entities become its children and their world poses do not change.
2. **Given** an entity and an explicit destination group or scene root, **When** the author reparents the
   entity, **Then** its parent relation changes without a visible jump.
3. **Given** a proposed missing, locked or descendant destination, **When** reparent is requested,
   **Then** the whole action is rejected without changing the document or history.
4. **Given** a nested hierarchy, **When** selection changes in the tree or Canvas, **Then** both surfaces
   represent the same stable selected ID set and primary entity.

---

### User Story 2 - Arrange Multiple Entities Deterministically (Priority: P1)

A scene author aligns, distributes and duplicates a same-parent selection as one layout operation rather
than editing coordinates one object at a time.

**Why this priority**: Deterministic batch layout turns the existing transform editor into a credible
scene-authoring workflow while remaining much smaller than a general modeling tool.

**Independent Test**: Select three fixed entities, align and distribute them on explicit world axes,
duplicate their layout with an explicit offset, and machine-compare every accepted transform and stable
ID with the fixture oracle.

**Acceptance Scenarios**:

1. **Given** two or more same-parent visible unlocked entities, **When** the author aligns minimum,
   center or maximum bounds on X, Y or Z, **Then** all resulting world bounds use the chosen anchor.
2. **Given** three or more same-parent visible unlocked entities, **When** the author distributes them,
   **Then** they receive equal world-space gaps in deterministic center-and-ID order.
3. **Given** a same-parent selected layout, **When** the author duplicates it with an explicit offset,
   **Then** fresh caller-provided entity and target IDs preserve hierarchy and relative transforms in one
   action.
4. **Given** an unchanged or invalid layout request, **When** it is submitted, **Then** no partial entity
   mutation, revision or history entry is created.

---

### User Story 3 - Transform With Predictable Spatial Feedback (Priority: P1)

A scene author moves, rotates or scales selected entities with configurable grid, angle and scale steps,
can snap to explicit geometric bounds anchors, and sees the active pivot, axis and delta while editing.

**Why this priority**: Snapping without visible spatial feedback is difficult to trust, while hidden
model-specific connector guesses would create a misleading product contract.

**Independent Test**: Apply fixed translation, rotation and scale snap settings to the acceptance scene,
snap one moving entity to a bounds anchor on an explicitly identified target, and compare the committed
transform with the deterministic oracle.

**Acceptance Scenarios**:

1. **Given** a positive grid, angle or scale step, **When** an interactive transform is committed,
   **Then** the corresponding components are quantized to the configured step exactly once.
2. **Given** a selected entity or same-parent selection, **When** a transform is previewed, **Then** the
   current pivot, world axis, delta and active snap settings are visible without entering persistence.
3. **Given** a source selection and target entity are explicitly identified, **When** the author applies a
   bounds-anchor action from current spatial snapshots, **Then** the deterministic
   `{entityId, anchorKind}` pair is highlighted and one ordinary transform command is committed.
4. **Given** geometry is unavailable or a result cannot be represented by the existing transform model,
   **When** snapping or reparent is attempted, **Then** Studio reports the reason and preserves the last
   valid authored state.

---

### User Story 4 - Preserve Layout Through The Existing Project Loop (Priority: P1)

A scene author can undo, redo, autosave, reload and exchange the arranged scene without losing IDs,
hierarchy, transforms, assets or existing data-binding meaning.

**Why this priority**: A visually convincing layout is not accepted unless the persistent payload proves
that the result is durable and no transient editor state leaked into the product contract.

**Independent Test**: Complete the fixed hierarchy/layout/snap workflow, exercise Undo and Redo, reload
the local project, round-trip JSON and ZIP, inspect IndexedDB, and deep-compare every accepted authored
field with the canonical baseline.

**Acceptance Scenarios**:

1. **Given** one accepted layout action, **When** it commits, undoes or redoes, **Then** each operation
   creates exactly one monotonic revision and one corresponding history transition.
2. **Given** an accepted arranged scene, **When** autosave and reload complete, **Then** its stable IDs,
   hierarchy and transforms match the saved canonical document.
3. **Given** JSON and ZIP exports, **When** each is parsed and reimported, **Then** document meaning and
   asset bytes match the canonical project.
4. **Given** selection, transform settings, spatial measurements and anchor previews, **When** project and
   archive payloads are inspected, **Then** none of those transient values is present.

### Edge Cases

- Layout controls are disabled in Run mode and cannot dispatch a document command.
- Group creation, reparent, align, distribute and duplicate-layout require selected roots whose explicit
  before-parent is the same. Create-group and reparent use one explicit destination Group/root; a
  destination Group must be unlocked. The author must reparent first instead of relying on a guessed
  common ancestor.
- A selected ancestor suppresses selected descendants for root-level batch operations so an entity is
  never transformed twice by one action.
- Reparent to self, a descendant, a missing entity, a non-group entity or a locked destination is rejected
  atomically.
- Lock is a local edit lock: a locked entity cannot be directly moved, reparented, grouped, aligned,
  distributed, snapped or scaled. Duplicate keeps the existing allowed-source meaning because it does not
  modify the locked source; each duplicate inherits the source entity's `locked` value. Lock does not
  introduce a new recursive permission model.
- Hidden entities remain in the hierarchy but are excluded from bounds-based layout selections.
- Reparent computes a new local transform from the existing world pose. If decomposition and
  recomposition reveal non-representable shear above the accepted epsilon, the action is rejected rather
  than approximated.
- Distribution ties use world-center coordinate and then stable entity ID. Selection order, document
  array order and mutable names never decide layout meaning.
- Bounds anchors are geometric center and six face-center candidates derived from loaded world bounds.
  They are not persisted semantic connectors.
- Missing entities, unloaded assets or a disposed Viewer fail the complete spatial-snapshot request. An
  empty Group still returns world matrix/pivot with `worldBounds: null`; only bounds-dependent actions are
  disabled by null bounds. Stale snapshots disable the affected action and produce no fallback guess.
- Grid, angle and scale snap steps must be finite and positive; scale results must remain positive.
- Duplicate layout follows the existing subtree contract: targets receive fresh IDs, business IDs are
  cleared, bindings/rule sets/annotations are not copied to ambiguous new business objects, locked sources
  are allowed and inherited, and the explicit offset does not change duplicated root parents.
- Locale or theme changes do not clear selection, recreate the Viewer or alter the document.

## Requirements

### Functional Requirements

- **FR-001**: Layout authoring MUST be available in the single Studio Edit mode and MUST be read-only in
  Run mode.
- **FR-002**: Studio MUST represent multi-selection as a transient set of stable entity IDs plus one
  explicit primary entity shared by the tree and Canvas.
- **FR-003**: The author MUST be able to create one stable Group from same-parent selected roots, using
  the selection world-bounds center as the initial group pivot while preserving each child's world pose.
- **FR-004**: The author MUST be able to explicitly reparent same-parent selected roots to a chosen Group
  or scene root while preserving world pose and rejecting missing parents, cycles and locked destination
  Groups.
- **FR-005**: Scene tree hierarchy, Canvas selection, visibility, local edit locks and the primary entity
  MUST remain consistent after every accepted, rejected, undone or redone hierarchy action.
- **FR-006**: Layout operations MUST reduce ancestor-and-descendant selections to explicit selected roots
  and MUST never mutate one entity twice in one action.
- **FR-007**: The author MUST be able to align the minimum, center or maximum world-bounds anchor of two
  or more same-parent entities on an explicit X, Y or Z axis.
- **FR-008**: The author MUST be able to distribute three or more same-parent entities with equal
  world-space gaps on an explicit X, Y or Z axis using deterministic center-and-ID ordering.
- **FR-009**: The author MUST be able to duplicate a same-parent selected layout with an explicit offset,
  fresh stable entity/target IDs and the existing subtree-copy meaning in one atomic action; the offset
  MUST NOT change duplicated root parents, and locked sources MUST remain allowed with inherited locks.
- **FR-010**: Interactive translation MUST support a finite positive grid snap step held outside the
  persisted scene and project records.
- **FR-011**: Interactive rotation MUST support a finite positive angle snap step held outside the
  persisted scene and project records.
- **FR-012**: Interactive scale MUST support a finite positive scale snap step, reject non-positive
  results and keep the setting outside persistence.
- **FR-013**: Studio MUST derive transient center and six-face bounds-anchor candidates from current
  spatial snapshots for an explicitly identified target and commit the selected result through one
  ordinary transform command with stable entity-ID and anchor-kind tie-breaking.
- **FR-014**: Studio MUST show the active pivot kind and world position, active axis, transform delta and
  enabled snap settings as transient spatial feedback.
- **FR-015**: Every create-group, reparent, align, distribute, duplicate-layout and committed snap action
  MUST be one validated atomic DocumentCommand that creates at most one revision and one history entry.
- **FR-016**: Every accepted layout edit MUST support Undo, Redo and autosave with monotonic revisions;
  invalid, stale, direct edits of locked entities, unchanged or non-representable requests MUST be
  no-mutation failures.
- **FR-017**: Stable entity/target IDs, parent relations, transforms and existing data-binding meaning
  MUST survive local reload and JSON/ZIP round-trip without silent migration or inference.
- **FR-018**: This feature MUST preserve the existing `SceneDocument 1.0.0`, archive manifest,
  ProjectRecord, IndexedDB store and save payload field shapes and MUST persist no session/runtime state.

### Non-Functional Requirements

- **NFR-001**: Layout identity, ordering and candidate selection MUST use explicit IDs, coordinates and
  fixed anchor enums, never mutable names, document/traversal order or first-available fallback.
- **NFR-002**: A user-visible layout action MUST be all-or-nothing and produce exactly one revision and
  one history entry regardless of how many entities it changes.
- **NFR-003**: In the fixed acceptance scene, an accepted layout handler MUST update revision and critical
  spatial-feedback DOM by the next animation-frame opportunity within 100 milliseconds; Canvas pixels
  are verified separately and are not claimed inside that timing boundary.
- **NFR-004**: Studio at 1280x720 and 1440x900 MUST have no page overflow, clipped primary layout command
  or incoherent panel/Canvas overlap in the accepted English/light and Chinese/dark coverage.
- **NFR-005**: Locale/theme changes, repeated selection and repeated transform-setting changes MUST NOT
  recreate the Viewer or duplicate selection overlays, controls, listeners or emitted selection events.
- **NFR-006**: Automated payload inspection MUST find zero selection, primary, snap, anchor, pivot, bounds,
  hover, preview, matrix, Object3D or layout-diagnostic fields in SceneDocument, archive or ProjectRecord.

### Key Entities

- **Layout Selection**: Transient stable entity-ID set and explicit primary entity used by tree, Canvas,
  layout controls and spatial feedback.
- **Group Entity**: Existing persistent `SceneEntity` with `type: "group"`, stable ID, parent relation and
  existing transform fields.
- **Transform Settings**: Transient translation, rotation and scale snap configuration.
- **Entity Spatial Snapshot**: Transient revision-bound world transform, world bounds, pivot, parent and
  editability measurement for one stable entity ID.
- **Bounds Anchor**: Transient `{entityId, anchorKind, worldPosition}` candidate where `anchorKind` is
  center or one of six face centers.
- **Layout Mutation**: Atomic before/after parent and transform changes plus explicit created entity/target
  records required by one user action.

## Assumptions

- The accepted additive Authoring API is `selectEntities(ids, primaryId)`,
  `setTransformSettings(settings)` and `getEntitySpatialSnapshots(ids)`, with corresponding additive
  React props and handle methods. It adds no public event variant or selection callback; the existing
  entity-selection event retains Canvas primary/single-click meaning.
- Same-parent constraints are deliberate MVP scope, not an inferred hierarchy limitation. Cross-parent
  selections must be explicitly reparented before group, align, distribute or duplicate-layout actions.
- Align and distribute use loaded world axis-aligned bounds. They do not infer model semantics or alter
  rotations/scales.
- Snap settings and spatial measurements reset with the authoring session and are not project preferences.
- The fixed acceptance fixture uses representable transforms; synthetic unit cases cover shear rejection.
- Existing M1 duplicate semantics for targets, business IDs, bindings and annotations remain authoritative.

## Non-Goals

- Persisted or semantic connectors, named equipment ports or model-node connector inference.
- Custom or persisted pivots, pivot editing and arbitrary local coordinate-system authoring.
- Persisted sibling order, manual tree row ordering or semantic meaning from the current name-sorted tree.
- Box/lasso selection, selection ranges derived from display order, mesh vertex/edge/surface snapping or
  geometry editing.
- Arbitrary multi-selection rotate/scale gizmos; authors group entities before transforming them as one
  hierarchy unit.
- Physics, collision avoidance, automatic packing, constraints, parametric arrays or CAD/DCC modeling.
- Duplicate business bindings, rules, annotations or runtime state onto new layout instances.
- Any data-source, rule engine, runtime telemetry, publication, embedding or persistence-schema expansion.

## Success Criteria

### Measurable Outcomes

- **SC-001**: An evaluator can use one Studio workflow to group, explicitly reparent, align, distribute,
  duplicate and snap the four-entity acceptance layout without editing code or JSON.
- **SC-002**: One hundred percent of accepted align, distribute, offset-duplicate and snap actions in the
  fixed scene match the expected parent IDs and transforms, with deterministic stable-ID tie-breaking.
- **SC-003**: Every accepted action, Undo and Redo changes revision exactly once, while every rejected or
  unchanged request changes revision/history zero times.
- **SC-004**: After autosave, reload, JSON round-trip and ZIP round-trip, all persistent entity/target IDs,
  hierarchy, transforms, assets and existing binding meaning deep-equal the accepted canonical document.
- **SC-005**: At 1280x720 and 1440x900, the accepted English/light and Chinese/dark flows have zero page
  overflow or primary-control overlap, retain one Canvas, and produce nonblank layout screenshots.
- **SC-006**: Contract comparison finds zero added, removed or reshaped SceneDocument/archive/ProjectRecord
  fields and payload scans find zero transient selection, snapping, bounds, pivot or preview leakage.
