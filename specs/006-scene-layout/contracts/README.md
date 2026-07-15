# Contract Impact: Scene Layout

## Persistence Contract

Feature 006 introduces zero new persistence fields and zero new archive or storage versions.

The authoritative contracts remain unchanged:

- `SceneDocument.schemaVersion === "1.0.0"`;
- existing SceneDocument field names, required/optional status and validation meaning;
- existing JSON serializer and archive manifest/ZIP layout;
- existing asset URI, byte-length and SHA-256 rules;
- existing `ProjectRecord` and persisted `documentJson` field set;
- IndexedDB database version, `projects`, `assets` and `settings` store shapes;
- existing autosave, project switch, export and import transaction meaning.

All authored layout output is represented by existing Group `SceneEntity` records plus existing
`parentId` and `transform` values. Selection, primary, snap settings, spatial snapshots, world bounds,
anchors, pivot, hover, preview and diagnostics are transient and forbidden from persistence.

Any implementation need to add, remove, rename, widen or reinterpret a persisted field must stop and
return for explicit product approval. The approved additive Authoring API is not approval for a schema or
save change.

## Approved Additive Authoring Runtime API

The user approved the following backward-compatible authoring additions on 2026-07-15:

```ts
interface AuthoringSceneViewer {
  selectEntities(ids: readonly string[], primaryId: string | null): void;
  setTransformSettings(settings: AuthoringTransformSettings): void;
  getEntitySpatialSnapshots(ids: readonly string[]): readonly EntitySpatialSnapshot[];
}
```

Expected supporting public types:

```ts
interface AuthoringTransformSettings {
  readonly translationSnap: number | null;
  readonly rotationSnapRadians: number | null;
  readonly scaleSnap: number | null;
}

interface EntitySpatialSnapshot {
  readonly documentId: string;
  readonly documentRevision: number;
  readonly entityId: string;
  readonly parentId: string | null;
  readonly localTransform: Transform;
  readonly worldMatrix: readonly number[];
  readonly worldBounds: { readonly min: Vec3; readonly max: Vec3 } | null;
  readonly worldPivot: Vec3;
  readonly visible: boolean;
  readonly locked: boolean;
}
```

Method semantics:

- `selectEntities` normalizes duplicate IDs, requires every ID to exist and requires `primaryId` to be
  included unless the set is empty. Invalid input leaves selection unchanged.
- `setTransformSettings` validates the complete object before replacing active settings. Invalid input
  leaves previous settings unchanged. The object contains only translation, rotation and scale snap values;
  bounds anchors are not a runtime setting.
- `getEntitySpatialSnapshots` returns one immutable snapshot per unique requested ID in stable ID order and
  tied to the current document ID/revision. Missing IDs, unloaded referenced assets or a disposed Viewer
  fail the complete request; no partial list is returned. An empty Group still returns its world matrix and
  pivot with `worldBounds: null`, so reparent remains available while bounds-dependent actions are disabled.
- None of the methods changes SceneDocument, history, revision, autosave or data-runtime state.

Existing `selectEntity(entityId)` remains supported and delegates to zero-or-one `selectEntities`. Existing
focus, transform tool, view, load, data-runtime and snapshot methods retain their meaning. Existing
`entity-selection-change` remains unchanged and represents a Canvas primary/single click. Studio owns the
multi-selection set and synchronizes it through controlled React props and `selectEntities`; no new public
selection event variant is approved.

## React Authoring Contract

`AuthoringSceneHandle` exposes the three approved methods with the runtime semantics above.

`AuthoringSceneProps` may add only these controlled optional props for the approved behavior:

```ts
interface AuthoringSceneProps {
  readonly selectedEntityIds?: readonly string[];
  readonly primaryEntityId?: string | null;
  readonly transformSettings?: AuthoringTransformSettings;
}
```

Rules:

- When controlled selection props are supplied, they are reconciled by stable ID without recreating the
  Viewer, TransformControls or overlays.
- `primaryEntityId` must be present in `selectedEntityIds` unless both represent no selection.
- Existing `onSelectionChange` remains the only public selection callback and retains its Canvas
  primary/single-click meaning. Studio updates its owned multi-set from that signal and resynchronizes the
  controlled props; no `onSelectionSetChange` callback is added.
- Locale/theme rerenders and React StrictMode must not duplicate selection events, controls or listeners.
- Props and handle calls never write to SceneDocument, project metadata or browser storage.

## Document Command Contract

Feature 006 may add pure command variants for Group creation, explicit reparent, batch layout and offset
duplicate. Command names are internal package contracts; their required semantics are fixed:

- all caller-provided IDs and complete before/after snapshots are validated before mutation;
- every affected entity is identified by stable ID exactly once;
- create-group/reparent require every selected root to have the same explicit `before.parentId`, and every
  patch uses one explicit destination Group/root;
- a non-null create-group/reparent destination is one Group ID and that Group must be unlocked;
- lock is a local edit lock: direct group/reparent/align/distribute/snap/scale edits reject locked entities;
  duplicate may use locked sources because it does not modify them, and every copy inherits `locked`;
- duplicate offset changes duplicated root local positions only and never changes their inherited parent
  IDs;
- same-before-parent selected-root constraints are validated at the command boundary;
- cycle, missing reference, stale before snapshot, non-finite transform, non-positive scale and duplicate ID
  errors reject the complete command;
- one changed command increments revision once and creates one history entry;
- an unchanged command returns the original document and preserves redo history;
- Undo/Redo retain existing full-document restoration and monotonic revision behavior.

Commands do not accept Object3D, bounds, anchors, pointer events, DOM nodes, timers or repository handles.
Studio converts current spatial measurements into explicit authored before/after parent/TRS snapshots.

## Transform Accuracy Contract

World-pose-preserving reparent is accepted only when the new local matrix can be represented by the
existing position/quaternion/positive-scale Transform:

```text
newLocal = inverse(newParentWorld) * oldWorld
candidate = decompose(newLocal)
residual = maxAbs(newLocal - compose(candidate))
accept only when residual <= fixed epsilon
```

The fixed epsilon is shared by pure math tests, runtime proposal tests and fixture oracles. Residual,
world matrix and decomposition metadata remain transient. A failed decomposition is a stable diagnostic,
not an approximate persisted transform.

## Bounds Anchor Contract

Bounds anchors are transient geometric candidates only:

```text
center, minX, maxX, minY, maxY, minZ, maxZ
```

Their key is `{entityId, anchorKind}`. Bounds anchors are not part of `AuthoringTransformSettings`. Studio
explicitly identifies the target, reads current non-null source/target spatial bounds, ranks candidate pairs
by world distance, stable entity ID and fixed anchor order, then submits the result as an ordinary transform
command. A null required bound disables only the bounds-dependent action. No connector, port, node-name,
metadata, Target or Annotation meaning is inferred or persisted.

Semantic connectors, named ports and model-specific attachment rules require a separately approved
persistence contract and are outside feature 006.

## P0 Compatibility Oracle

Acceptance must provide all of the following evidence:

1. Source-level contract comparison reports no SceneDocument schema/type, archive-shape or ProjectRecord
   shape change.
2. Pre-layout and accepted post-layout canonical JSON are captured and machine parsed.
3. Post-layout JSON export, parsed ZIP document and IndexedDB `documentJson` deep-equal the accepted
   canonical document.
4. Persisted project record keys exactly equal the existing eight fields.
5. Existing asset bytes, byte length and SHA-256 are unchanged.
6. Existing data source, binding and rule meaning is unchanged by non-duplicate layout actions.
7. Duplicate layout follows existing target/business/binding/annotation semantics.
8. Forbidden transient-owner scans report zero selection/settings/spatial/anchor/pivot/preview leakage.

## Compatibility And Stop Conditions

- Existing documents load without migration and may contain entities in any valid array order.
- Existing single-selection clients compile and retain behavior.
- Existing read-only Viewer and data runtime behavior remains unchanged.
- No package method or event is removed.
- A discovered need for persisted sibling order, custom pivot, connector, world matrix, bounds or snap
  settings stops feature implementation and returns to product/contract review.
