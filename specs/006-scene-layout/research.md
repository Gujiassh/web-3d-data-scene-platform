# Research: Scene Layout

## Decision 1: Use Existing SceneEntity Fields As The Only Persistent Layout Model

**Decision**: Group, hierarchy and layout results use existing `SceneEntity.type`, `parentId` and
`transform` fields under `SceneDocument 1.0.0`.

**Rationale**: The accepted document already models authored hierarchy and TRS. The feature needs new
authoring operations, not new serialized concepts.

**Alternatives considered**:

- Add layout arrays or group membership records: rejected because they duplicate `parentId` and change the
  schema/save contract.
- Persist world matrices: rejected because the contract uses local TRS and matrices may encode shear.
- Store layout in ProjectRecord: rejected because project metadata is not scene meaning.

## Decision 2: Add Explicit Atomic Layout Commands

**Decision**: Create-group, reparent, layout and duplicate-layout each execute as one pure command with
complete caller-provided IDs and before/after snapshots.

**Rationale**: Looping over single-entity transform commands would create multiple revisions, expose
partial states and violate the user-visible action boundary.

**Alternatives considered**:

- Dispatch one transform command per selected entity: rejected because failure midway cannot remain one
  atomic history entry.
- Add a generic command list/transaction language: rejected as broader abstraction than the fixed scope.
- Mutate the document directly in Studio: rejected because it bypasses validation and history ownership.

## Decision 3: Keep Measurement And Layout Mutation Separate

**Decision**: Runtime returns revision-bound spatial snapshots; Studio derives explicit proposals; the
document command validates and commits authored fields.

**Rationale**: World bounds require loaded geometry and Object3D state, while document commands must stay
pure and independent from Three.js, DOM and asset loading.

**Alternatives considered**:

- Import Three.js into `@web3d/document`: rejected because it couples the persistence model to rendering.
- Persist asset/entity bounds: rejected because bounds are derivable and would reshape the schema.
- Estimate bounds from names or asset stats: rejected because neither expresses spatial geometry.

An empty Group is not a measurement failure: its snapshot retains world matrix and pivot with nullable
bounds. Missing entities, unloaded referenced assets and disposed Viewer state still fail the complete
request. Only bounds-dependent planners reject `worldBounds: null`.

## Decision 4: Approve Backward-Compatible Multi-Selection And Spatial Authoring APIs

**Decision**: Add `selectEntities(ids, primaryId)`, `setTransformSettings(settings)` and
`getEntitySpatialSnapshots(ids)` to runtime and React authoring surfaces, with corresponding controlled
React props/handle methods. Do not add a public event variant or callback.

**Rationale**: Studio cannot honestly coordinate tree/Canvas multi-selection, settings and spatial
measurements through the existing single-entity method alone.

**Alternatives considered**:

- Keep the Viewer single-selected and show only tree multi-selection: rejected because Canvas and tree
  would disagree.
- Read internal Three objects from Studio: rejected because it breaks package ownership and public API.
- Replace `selectEntity`: rejected because additive compatibility is sufficient.

The existing entity-selection event keeps its Canvas primary/single-click meaning. Studio owns the
multi-selection set and synchronizes it through controlled props and handle calls.

## Decision 5: Use Same-Parent Selected Roots For MVP Layout

**Decision**: Group, align, distribute and duplicate-layout operate on normalized selected roots sharing
one explicit parent. Reparent is the explicit path for changing that condition.

**Rationale**: This rule avoids hidden least-common-ancestor decisions and makes local/world transform
meaning deterministic.

**Alternatives considered**:

- Automatically choose a common ancestor: rejected because it can depend on hierarchy traversal and
  surprise the author.
- Flatten every selected entity to root: rejected because it destroys authored hierarchy.
- Support arbitrary cross-parent batch layout immediately: deferred because it multiplies transform and
  UX edge cases without improving the first portfolio workflow.

## Decision 6: Reject Non-Representable Reparent Results

**Decision**: Reparent computes a local matrix from world pose, decomposes to existing TRS, recomposes and
rejects the complete action when residual error exceeds a fixed epsilon.

**Rationale**: Rotated non-uniform parent scales can create shear that `Transform` cannot represent.
Silent approximation would move or distort authored content while claiming world-pose preservation.

**Alternatives considered**:

- Persist a matrix or shear field: rejected because it changes `SceneDocument 1.0.0`.
- Approximate the nearest TRS: rejected because acceptance could not prove exact world-pose preservation.
- Ban all rotated or scaled parents: rejected as unnecessarily broad; representable cases remain valid.

## Decision 7: Use World AABBs For Layout And A Fixed Primary

**Decision**: Align uses min/center/max world AABB anchors relative to the explicit primary. Distribution
uses center coordinate and stable entity ID ordering, keeps outer entities fixed and equalizes clear gaps.

**Rationale**: Bounds produce visually meaningful alignment for assets with different pivots and sizes;
the primary and ID tie-break make the result reproducible.

**Alternatives considered**:

- Align entity origins: rejected because model pivots may not match visible geometry.
- Use current selection order: rejected because interaction history is not durable layout meaning.
- Sort by display name or document array: rejected because both are mutable/non-semantic.

## Decision 8: Keep Grid, Angle And Scale Settings Transient

**Decision**: Translation, rotation and scale snap steps are finite positive session settings passed to
the authoring runtime and never saved with the scene or project.

**Rationale**: The current contract has no snap preferences, and authored meaning is already captured by
the final transform.

**Alternatives considered**:

- Add snap settings to SceneEnvironment: rejected because it changes the schema and confuses editor
  preference with scene output.
- Add ProjectRecord settings: rejected because it changes the save shape.
- Persist localStorage preferences: deferred; the approved scope requires transient behavior only.
- Put bounds-anchor behavior in transform settings: rejected because the approved settings contain only
  translation, rotation and scale snap values.

## Decision 9: Replace Semantic Connector Claims With Bounds Anchors

**Decision**: Feature 006 provides transient center and six face-center world-bounds anchors for an
explicit target. Studio derives them from current spatial snapshots and submits the result as a normal
transform command. It does not claim named or semantic connectors.

**Rationale**: No connector schema exists. Bounds anchors are deterministic geometry, can be computed from
loaded objects and leave only a standard transform after commit.

**Alternatives considered**:

- Infer connectors from node names or first matching child: rejected by stable-identity rules.
- Store connectors in metadata: rejected because untyped metadata would become a hidden schema.
- Reuse Annotation/localOffset: rejected because annotations have different meaning and target ownership.
- Add a connector schema now: deferred to a separately approved feature, potentially with 007 surface
  target work.

## Decision 10: Preserve Existing Duplicate Business Semantics

**Decision**: Duplicate layout clones entity subtrees and targets with fresh IDs, clears target business
IDs, preserves asset hash/node index, and does not clone Binding, RuleSet or Annotation records.

**Rationale**: Spatial duplication does not prove a new business object identity or safe binding meaning.
This matches the accepted M1 duplicate contract.

**Alternatives considered**:

- Copy all dependent business records: rejected because duplicate business IDs and shared writes would be
  ambiguous or invalid.
- Duplicate only top-level entity shells: rejected because subtree layout would be lost.
- Generate IDs inside document commands: rejected because commands must remain deterministic and pure.

## Decision 11: Use One Fixed Layout Fixture And Synthetic Negative Documents

**Decision**: Add a deterministic four-entity scene/oracle that reuses the accepted M0 GLB, plus small
synthetic unit documents for cycles, stale snapshots and non-representable shear.

**Rationale**: The fixed scene supports real visual, archive and payload evidence without creating new
asset provenance; synthetic documents isolate hard mathematical failures.

**Alternatives considered**:

- Generate random entities in each test: rejected because screenshots and transforms would drift.
- Commit a second GLB: rejected because the existing 1216-byte fixture is sufficient.
- Test only unit math: rejected because tree, Canvas, IndexedDB and archive behavior need browser proof.

## Decision 12: Keep New Runtime Responsibilities Out Of The Main Viewport

**Decision**: Spatial measurement, selection overlay, snap resolution and feedback use focused authoring
modules composed by the existing viewport.

**Rationale**: `three-scene-viewport.ts` is already 1008 lines and owns lifecycle coordination. Adding
layout policy there would make review and later hotspot work harder.

**Alternatives considered**:

- Implement all behavior directly in the viewport: rejected because it mixes orchestration, geometry and
  interaction policy.
- Move all existing authoring behavior in a broad refactor: rejected because the smallest safe feature can
  add focused modules without unrelated churn.
