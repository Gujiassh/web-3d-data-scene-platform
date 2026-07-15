# Data Model: Scene Layout

## Ownership Summary

| Model                       | Owner                    | Lifetime                       | Persisted |
| --------------------------- | ------------------------ | ------------------------------ | --------- |
| `SceneEntity`               | `@web3d/document`        | SceneDocument                  | Yes       |
| Layout command              | `@web3d/document`        | One execute/history transition | No        |
| Layout selection            | Studio session           | Active project session         | No        |
| Transform settings          | Studio/runtime authoring | Active authoring session       | No        |
| Entity spatial snapshot     | Runtime authoring        | One document revision/load     | No        |
| Bounds anchor/preview       | Runtime authoring        | Pointer/transform preview      | No        |
| Spatial feedback view model | Studio presentation      | Current interaction            | No        |

Only existing SceneEntity parent and transform values enter persistence. Every other feature-006 model
is transient, recomputable or command input and is forbidden from SceneDocument, ProjectRecord,
IndexedDB `documentJson`, archive files and JSON exports.

## Existing Persistent SceneEntity

Feature 006 uses the existing union unchanged:

```text
GroupEntity = EntityBase + type "group"
AssetEntity = EntityBase + type "asset" + assetId

EntityBase:
  id
  parentId
  name
  visible
  locked
  transform { position, rotation, scale }
  metadata
```

Layout meaning:

- `id` is document-scoped stable identity.
- `parentId` is explicit authored hierarchy; `null` means scene root.
- `transform` is local to the explicit parent and contains finite position, quaternion rotation and
  positive scale.
- `name` is presentation only and never selects, orders or references an entity.
- `locked` is a local edit lock for this feature. Direct group/reparent/align/distribute/snap/scale edits
  reject a locked entity. Duplicate may read a locked source because the source is unchanged, and each copy
  inherits its `locked` value. This does not create a persisted permission model or implicit recursive lock
  field.
- `visible: false` keeps the entity in hierarchy but excludes it from bounds-based layout proposals.

No field is added, removed, renamed, widened or reinterpreted.

## Layout Selection

Transient Studio model:

```ts
interface LayoutSelection {
  readonly entityIds: readonly string[];
  readonly primaryId: string | null;
}
```

Invariants:

- `entityIds` contains unique IDs that exist in the active document.
- `primaryId` is `null` exactly when `entityIds` is empty; otherwise it is included in `entityIds`.
- Ctrl/Cmd toggles one explicit ID. A non-extended selection replaces the set.
- The most recently explicitly selected remaining ID is primary. Names and document/tree order never
  choose it.
- Document replacement or entity deletion removes unavailable IDs; if the primary disappears, Studio
  uses its transient explicit-selection recency, not a persisted or name-derived fallback.
- Selected roots are derived by removing each selected ID with a selected ancestor. The derived root set
  contains no ancestor/descendant pair.
- Group, align, distribute and duplicate-layout require all selected roots to share the same `parentId`.

Selection does not enter history or change revision.

## Transform Settings

Transient runtime/Studio model:

```ts
interface AuthoringTransformSettings {
  readonly translationSnap: number | null;
  readonly rotationSnapRadians: number | null;
  readonly scaleSnap: number | null;
}
```

Validation:

- Non-null step values are finite and greater than zero.
- `rotationSnapRadians` is greater than zero and no greater than one full turn.
- Applying a scale step cannot produce zero, negative or non-finite components.
- A rejected settings object leaves the previous complete settings object active.
- Settings reset with the authoring session and are never project preferences or environment fields.

Studio may display angle settings in degrees but converts explicitly at the runtime boundary.

## Entity Spatial Snapshot

Transient, read-only runtime measurement:

```ts
interface EntitySpatialSnapshot {
  readonly documentId: string;
  readonly documentRevision: number;
  readonly entityId: string;
  readonly parentId: string | null;
  readonly localTransform: Transform;
  readonly worldMatrix: readonly number[]; // exactly 16 finite components
  readonly worldBounds: { readonly min: Vec3; readonly max: Vec3 } | null;
  readonly worldPivot: Vec3;
  readonly visible: boolean;
  readonly locked: boolean;
}
```

Invariants:

- Every snapshot is keyed by stable entity ID and the exact loaded document ID/revision.
- Snapshots are returned only after the entity world matrix and any required asset geometry are ready.
- Non-null bounds satisfy `worldBounds.min[axis] <= worldBounds.max[axis]` for all axes.
- A Group bounds snapshot is the union of its loaded visible descendant geometry. An empty Group has
  `worldBounds: null` while retaining its valid world matrix and world pivot.
- `worldPivot` is the entity Object3D origin in world space. Multi-selection pivot is derived separately as
  the selected-root bounds center.
- Missing entity IDs, unloaded referenced assets or a disposed Viewer fail the whole requested measurement;
  no partial first-available set is returned. Consumers compare `documentRevision` and reject stale
  snapshots. Only bounds-dependent actions reject a valid snapshot whose `worldBounds` is null; reparent
  may still use its world matrix and pivot.

## Bounds Anchor

Transient runtime candidate:

```ts
type BoundsAnchorKind = "center" | "minX" | "maxX" | "minY" | "maxY" | "minZ" | "maxZ";

interface BoundsAnchor {
  readonly entityId: string;
  readonly kind: BoundsAnchorKind;
  readonly worldPosition: Vec3;
}
```

Rules:

- Anchor positions derive only from a current non-null `EntitySpatialSnapshot.worldBounds`.
- The target entity is explicitly identified by pointer hit/author intent and cannot equal a moving root.
- Candidate ranking uses world distance; ties use target entity ID and then the fixed anchor-kind order
  shown above.
- A preview may display source/target anchors and delta, but only the final existing Transform is authored.
- Bounds anchors are not connectors, targets, annotations, metadata or scene entities.
- Bounds anchors are not part of `AuthoringTransformSettings`; Studio combines an explicit target and
  current source/target spatial snapshots into one normal transform command.

## Spatial Feedback

Transient Studio view model:

```ts
interface SpatialFeedback {
  readonly pivotKind: "entity-origin" | "selection-bounds-center";
  readonly pivotWorld: Vec3;
  readonly activeAxis: "x" | "y" | "z" | "free";
  readonly deltaPosition: Vec3;
  readonly deltaRotationRadians: number;
  readonly deltaScale: Vec3;
  readonly settings: AuthoringTransformSettings;
  readonly sourceAnchor: BoundsAnchor | null;
  readonly targetAnchor: BoundsAnchor | null;
}
```

It drives accessible text and Canvas overlays. It cannot dispatch a command by itself and clears when the
preview ends, selection becomes invalid, project changes or Studio enters Run.

## Atomic Layout Patch

Pure document-command input:

```ts
interface EntityLayoutState {
  readonly parentId: string | null;
  readonly transform: Transform;
}

interface EntityLayoutPatch {
  readonly entityId: string;
  readonly before: EntityLayoutState;
  readonly after: EntityLayoutState;
}
```

Validation occurs for the complete patch set before mutation:

- entity IDs are unique, explicit and present;
- every current parent/transform deep-equals `before`;
- create-group/reparent patches share one explicit before-parent and one explicit destination Group/root;
- all destination parent IDs exist, refer to that single destination, and any destination Group is
  unlocked;
- resulting hierarchy contains no cycle;
- directly modified entities satisfy local-lock rules; duplicate sources may be locked and copies inherit
  the source lock without modifying it;
- all transform values are finite, quaternion/scale constraints pass and scales remain positive;
- all selected-root common-parent and operation-count constraints pass;
- at least one `after` differs from `before`.

The command produces one candidate document and validates it once. Failure returns no document, revision,
history or save mutation. A semantic no-op returns the original object.

## Create Group Input

```text
beforeParentId: explicit shared parent ID or null
destinationGroup: complete caller-ID GroupEntity with locked = false
patches: one EntityLayoutPatch for each selected root
```

Every patch `before.parentId` equals `beforeParentId`. The destination Group uses `beforeParentId` as its
parent and is the single `after.parentId` for every patch. Its initial local position corresponds to the
selection world-bounds center converted into the common parent's local frame; rotation is identity, scale
is one and `locked` is false. Child patches preserve world pose. The Group and all patches commit in one
revision.

## Reparent Input

```text
beforeParentId: explicit shared parent ID or null
destinationParentId: explicit Group ID or null
patches: same-parent selected-root before/after parent+TRS snapshots
```

Every patch `before.parentId` equals `beforeParentId`; every patch `after.parentId` equals the single
`destinationParentId`. A non-null destination must be an existing unlocked Group.

For each root:

```text
newLocalMatrix = inverse(destinationWorldMatrix) * oldWorldMatrix
candidateTRS = decompose(newLocalMatrix)
recomposed = compose(candidateTRS)
```

If the maximum absolute component difference between `newLocalMatrix` and `recomposed` exceeds the fixed
accepted epsilon, the command proposal is rejected as non-representable shear. The fixture records the
epsilon; no matrix or shear residual is persisted.

## Align And Distribute Inputs

Align input identifies:

- explicit stable selected-root IDs;
- explicit primary ID;
- axis `x | y | z`;
- anchor `min | center | max`;
- current revision-bound spatial snapshots;
- complete before/after transform patches.

Distribute input identifies:

- at least three stable selected-root IDs;
- explicit axis;
- current revision-bound world bounds;
- deterministic sort by center coordinate then entity ID;
- complete before/after transform patches.

Both operations translate only. Existing rotations and scales remain byte-for-byte equal.

## Duplicate Layout Input

```text
rootEntityIds: normalized same-parent selected roots
entityIdMap: complete source ID -> fresh destination ID map for every subtree entity
targetIdMap: complete source ID -> fresh destination ID map for every copied target
offset: finite Vec3 applied to duplicated root local positions
```

Locked source roots and descendants are allowed because duplication does not modify them; each copy
inherits the corresponding source `locked` value. The offset changes duplicated root local positions but
never their source parent IDs. Duplicated descendant local transforms are otherwise unchanged. New targets
preserve name, asset hash, node index and metadata, clear business ID, and receive fresh IDs/entity
references. Bindings, RuleSets and Annotations remain unchanged. The operation adds all records in one
revision/history entry.

## State Transitions

```text
idle selection
  -> explicit selection/settings change (transient, revision unchanged)
  -> request current spatial snapshots
  -> derive preview/proposal
  -> interactive preview (transient, revision unchanged)
  -> validate complete document command
  -> commit once (revision +1, one history entry, autosave)

invalid/stale/locked/sheared proposal
  -> diagnostic
  -> clear preview if needed
  -> document/history/revision/save unchanged

Undo accepted command
  -> restore complete before document
  -> revision +1

Redo accepted command
  -> replay complete command against restored before state
  -> revision +1
```

## P0 Forbidden Persistence Fields

Payload inspection rejects these owner concepts at document, entity/metadata, target, project record and
archive levels unless a field is an existing unrelated authored field with different meaning:

```text
selectedEntityIds, primaryEntityId, transformSettings, translationSnap,
rotationSnap, scaleSnap, boundsAnchor, anchorKind, pivot, spatialSnapshot,
worldBounds, worldMatrix, hover, dragPreview, transformPreview, Object3D,
layoutDiagnostic, activeAxis, transformDelta
```

The exact persisted ProjectRecord remains:

```text
id, name, createdAt, updatedAt, lastOpenedAt,
lastSavedRevision, lastExportedRevision, documentJson
```
