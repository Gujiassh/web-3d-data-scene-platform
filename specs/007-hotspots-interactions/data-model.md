# Data Model: Hotspots And Declarative Interactions

**Status**: Calibrated final contract approved 2026-07-18; implementation in progress
**Current production authority**: SceneDocument 1.3

## Model Decision

The existing `annotations` collection remains the single persisted collection. Its `Annotation` record becomes the
complete hotspot model. User-facing surfaces call it a hotspot; document and protocol surfaces retain Annotation to
avoid two concepts representing the same item.

No Hotspot SceneEntity, synthetic SceneTarget or parallel hotspot collection is added.

## Proposed SceneDocument 1.4

```ts
interface SceneDocument {
  schemaVersion: "1.4.0";
  // Existing 1.3 fields remain unchanged.
  annotations: readonly Annotation[];
}

interface Annotation {
  id: string;
  title: string;
  visible: boolean;
  locked: boolean;
  anchor: AnnotationAnchor;
  content: AnnotationContent;
  action: AnnotationAction;
}
```

Annotation array order has no business meaning and canonical serialization continues sorting by ID. The first-release
list sorts by locale-aware title with ID as deterministic tie-breaker; manual ordering is not persisted or authorable.

## Anchor Union

```ts
type AnnotationAnchor = SurfaceAnchor | LegacyAnnotationAnchor;

interface SurfaceAnchor {
  kind: "surface";
  entityId: string;
  assetHash: string;
  nodeIndex: number;
  nodeLocalPosition: Vec3;
  nodeLocalNormal: Vec3;
}

interface LegacyAnnotationAnchor {
  kind: "legacy";
  targetId: string;
  localOffset: Vec3;
}
```

### Surface Anchor Meaning

| Field               | Meaning                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `entityId`          | Existing AssetEntity instance that owns the loaded asset hierarchy                  |
| `assetHash`         | Exact `SceneAsset.sha256` bytes used when the author placed the hotspot             |
| `nodeIndex`         | Exact non-negative glTF node index resolved for the hit object                      |
| `nodeLocalPosition` | Finite point transformed from the world hit into that glTF node's local coordinates |
| `nodeLocalNormal`   | Finite normalized direction in that glTF node's local coordinate frame              |

The Runtime resolves world position through the current node world matrix and world normal through the corresponding
normal matrix. Parent and rigid node transforms therefore move the hotspot without changing persisted data.

A surface anchor is resolvable only when:

1. `entityId` resolves to an AssetEntity;
2. the AssetEntity resolves one SceneAsset;
3. SceneAsset hash exactly equals `assetHash`;
4. the loaded asset exposes the exact `nodeIndex` through a formal Runtime index;
5. the node/object remains a supported rigid Mesh without skinning, morph targets, instancing or batching;
6. transformed point and normal are finite.

Failure makes the annotation unavailable. It never triggers node-name, nearest-point, object-order, first-node or
same-shape remapping.

Runtime node resolution is not required for local save or JSON/ZIP export because the document layer does not parse
asset geometry. An unresolved valid reference carries a diagnostic, has no marker/activation and remains repairable in
Edit. Feature 008 may reject it at publish-readiness validation.

### Legacy Anchor Meaning

`localOffset` preserves the exact old values. SceneDocument 1.0-1.3 never defined its coordinate frame and
Runtime never rendered it, so 1.4 deliberately assigns no world/entity/node/Target-local meaning. The Target reference
is preserved for identity and delete cascade only.

A legacy anchor is unresolved by definition: no Canvas marker or Run activation is fabricated. Studio keeps it in the
Edit list and offers explicit Reposition, which replaces the complete legacy anchor with a newly evidenced Surface
anchor through one update command. That author action is the only conversion.

## Content Union

```ts
type AnnotationContent = PlainTextContent | HostContentReference;

interface PlainTextContent {
  kind: "plain-text";
  text: string;
}

interface HostContentReference {
  kind: "host-content";
  key: string;
}
```

- Plain text may be empty and contains at most 2,000 Unicode scalar values after normal JSON decoding.
- Text is rendered as text, never HTML or Markdown.
- Host key is non-empty, contains at most 256 characters and is opaque. The document validator does not guess,
  normalize or execute it.
- Studio authors a host key only from an injected trusted catalog `{ key, displayName }`; no free-text key field exists.
- Missing host content does not invalidate the document. Runtime emits an unavailable-content action result and lets
  the host decide its presentation.

## Action Union

```ts
type AnnotationAction =
  | { type: "show-content" }
  | { type: "focus-hotspot" }
  | { type: "focus-target"; targetId: string }
  | { type: "open-link"; href: string };
```

| Type            | Persisted configuration | Meaning                                                              |
| --------------- | ----------------------- | -------------------------------------------------------------------- |
| `show-content`  | None                    | Show title plus resolved content in an accessible content surface    |
| `focus-hotspot` | None                    | Focus camera on the annotation's resolved world point                |
| `focus-target`  | Existing Target ID      | Focus an existing semantic Target selected by display name in Studio |
| `open-link`     | Absolute HTTPS URL      | Request a user-activated external navigation                         |

Exactly one action is required. Action chains, conditions, arbitrary payloads, scripts, command execution, host route
names and device/network control are structurally invalid.

Every activation independently emits transient `{ annotationId, actionType, origin, result }` evidence. This event is
not persisted and cannot carry an authored arbitrary payload.

## Value Invariants

- Annotation ID participates in the existing document-wide ID namespace.
- Title follows the existing document name shape: non-empty plain text with at most 160 characters. For migration
  fidelity, structure accepts legacy whitespace exactly. The command boundary rejects whitespace-only Add and any
  Update that changes title to whitespace-only; an unchanged legacy title does not block another permitted update.
  Commands never silently trim or rewrite an authored/legacy title.
- `visible` and `locked` are required booleans.
- Every vector has exactly three finite numbers.
- `nodeLocalNormal` has length 1 within tolerance `1e-6`.
- `nodeIndex` is a non-negative safe integer.
- Surface `entityId` resolves to an AssetEntity whose SceneAsset SHA-256 equals `assetHash`.
- `assetHash` uses the existing canonical lowercase SHA-256 representation.
- Legacy-anchor and focus-target references resolve to existing SceneTargets.
- Open-link `href` is an absolute URL with exact `https:` scheme and at most 2,048 characters. User info is rejected.
- Unknown fields and unknown union variants are rejected.
- Annotation and Surface-anchor counts have no schema/product hard cap. Existing JSON/ZIP input-size limits remain the
  security boundary. Runtime must not select only a first subset by ID or array order.

## Command Snapshots

```ts
interface AddAnnotationCommand {
  type: "add-annotation";
  after: Annotation;
}

interface UpdateAnnotationCommand {
  type: "update-annotation";
  before: Annotation;
  after: Annotation;
}

interface RemoveAnnotationCommand {
  type: "remove-annotation";
  before: Annotation;
}
```

- These are the only direct Annotation mutations.
- Snapshots are complete, canonical and same-ID/same-kind checked where applicable.
- Add requires an unused ID. Neither Add nor Update rejects solely because of annotation/Surface-anchor count.
- Update requires exact current `before`; no-op updates reject without clearing redo.
- From `locked: true`, update may change only `visible` and/or `locked: true -> false`; every other field remains exact.
- Remove requires exact current `before` and rejects a locked annotation.
- Invalid, stale and no-op commands preserve document identity, revision, history and redo.
- Every successful execute, Undo and Redo increases revision once; it never restores an old revision number.

Rename, reposition, content/action edit, hide/show and lock/unlock are Studio projections into one update snapshot.
Direct drag never writes intermediate snapshots.

## Entity And Target Lifecycle

- Delete-subtree cascades surface annotations whose `anchor.entityId` is in the removed subtree.
- Delete-subtree already removes Targets owned by the subtree; it additionally cascades Legacy annotations and
  focus-target actions that reference those removed Targets.
- Because an Annotation can have one surviving anchor but an action referencing a deleted Target, the complete
  Annotation is removed rather than silently changing its action.
- Cascade removal is part of the one subtree command and applies even when an affected annotation is locked. Lock is
  direct annotation edit protection, not an ownership constraint on deleting its model.
- Duplicate-subtree and Duplicate-subtrees never copy annotations, matching the established M1 rule.
- Changing a Target business ID does not change annotations.
- Replacing or changing asset bytes does not rewrite a surface anchor. It becomes unresolved until explicit Reposition
  or removal.

## Deterministic Creation Projection

These are Studio command-builder defaults, not optional schema fields:

- ID: caller-provided deterministic next annotation ID.
- Title: localized lowest-available `Hotspot n` / `热点 n`, selected for immediate replacement.
- `visible: true`.
- `locked: false`.
- Anchor: current valid SurfaceHitEvidence projected to a SurfaceAnchor.
- Content: `{ kind: "plain-text", text: "" }`.
- Action: `{ type: "show-content" }`.

Creating the draft does not allocate a persisted ID or command. The complete projection occurs only when valid title
confirmation requests the add command.

## Legacy Migration

SceneDocument 1.3 Annotation:

```ts
interface Annotation1_3 {
  id: string;
  targetId: string;
  title: string;
  contentKey: string;
  localOffset: Vec3;
}
```

Deterministically migrates to:

```ts
{
  id: old.id,
  title: old.title,
  visible: true,
  locked: false,
  anchor: {
    kind: "legacy",
    targetId: old.targetId,
    localOffset: old.localOffset
  },
  content: {
    kind: "host-content",
    key: old.contentKey
  },
  action: { type: "show-content" }
}
```

The migration preserves all old values exactly and introduces only required deterministic fields. It performs no
surface raycast, Target creation, node lookup, normal guess or coordinate-frame interpretation. Every valid legacy count
remains valid current data; opaque anchors do not create rendered markers until explicit Reposition.

Required chain:

```text
validate 1.0 -> migrate -> validate 1.1 -> migrate -> validate 1.2
-> migrate -> validate 1.3 -> migrate -> validate current 1.4
```

Entry at any later version begins with its frozen structural and semantic validator. Invalid raw or intermediate data
stops before the next step and before persistence.

## Runtime-only State

None of the following enters Annotation, SceneDocument, JSON, ZIP or ProjectRecord:

```ts
interface SurfaceHitEvidence {
  documentId: string;
  revision: number;
  entityId: string;
  assetHash: string;
  nodeIndex: number;
  worldPosition: Vec3;
  worldNormal: Vec3;
  nodeLocalPosition: Vec3;
  nodeLocalNormal: Vec3;
}
```

Also transient: active tool/session ID, pointer/reticle position, ghost/draft marker, original drag anchor, hover,
selection, focus, popover/editor state, occlusion result, resolved Object3D, action result and host content resolution.

Every hit is valid only for its exact document ID and revision. Source revision, project, entity, asset or node change
invalidates it before command construction.

## ProjectRecord And Archive Consequences

- ProjectRecord retains its existing eight-field shape and database stores/version unless implementation evidence
  proves a database version change is required.
- Repository initialization scans, validates, migrates and canonicalizes every ProjectRecord in one `projects`
  readwrite transaction.
- A rewritten legacy record receives current canonical `documentJson` and `lastExportedRevision: null`; all other
  record fields remain exact. An already-current valid 1.4 record remains byte-identical.
- Any read, parse, intermediate validation, current validation or write failure aborts all rewrites.
- Raw JSON/ZIP import accepts declared supported 1.0 through 1.4 and returns current 1.4.
- Export accepts and emits only current 1.4. Archive container remains 1.0.0, and manifest scene version matches raw
  pre-migration `scene.json` on import.

## Approval Boundary

Every type, migration, command, cascade, performance baseline and ProjectRecord consequence in this file is proposed. Direction
approval permits non-production calibration and planning. None may enter production until the calibrated complete
contract and implementation plan receive explicit final approval. Approval of only the Canvas UX does not approve
these save semantics.
