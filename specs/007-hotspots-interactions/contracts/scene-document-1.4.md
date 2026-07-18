# Contract: SceneDocument 1.4 Hotspot Annotations

**Status**: Direction approved 2026-07-17; calibrated and approved for implementation 2026-07-18
**Current production contract**: SceneDocument 1.3.0
**Proposed contract**: SceneDocument 1.4.0
**Archive container**: Remains 1.0.0

## Approval Scope

Direction approval was received on 2026-07-17 and authorizes only non-production marker/performance calibration and
implementation planning. Calibration may tighten defaults/performance budgets but cannot add a count cap or broaden
behavior or persistence meaning
without returning for direction approval. A second explicit approval of the calibrated complete contract and plan is
required before changes to SceneDocument schema/types/validators, migration, archive, IndexedDB, commands, Runtime,
React or Studio production code. That approval was received on 2026-07-18. SceneDocument 1.3 remains authoritative until
the approved migration is implemented and accepted; no production fallback or partial 1.4 is allowed.

## Type Contract

```ts
interface Annotation {
  readonly id: string;
  readonly title: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly anchor: SurfaceAnchor | LegacyAnnotationAnchor;
  readonly content: PlainTextContent | HostContentReference;
  readonly action: AnnotationAction;
}

interface SurfaceAnchor {
  readonly kind: "surface";
  readonly entityId: string;
  readonly assetHash: string;
  readonly nodeIndex: number;
  readonly nodeLocalPosition: Vec3;
  readonly nodeLocalNormal: Vec3;
}

interface LegacyAnnotationAnchor {
  readonly kind: "legacy";
  readonly targetId: string;
  readonly localOffset: Vec3;
}

interface PlainTextContent {
  readonly kind: "plain-text";
  readonly text: string;
}

interface HostContentReference {
  readonly kind: "host-content";
  readonly key: string;
}

type AnnotationAction =
  | { readonly type: "show-content" }
  | { readonly type: "focus-hotspot" }
  | { readonly type: "focus-target"; readonly targetId: string }
  | { readonly type: "open-link"; readonly href: string };
```

SceneDocument changes only `schemaVersion` and Annotation item shape. No top-level collection, SceneEntity variant,
SceneTarget field, ProjectRecord field or archive container field is added.

## Structural And Semantic Validation

- Current schema is strict and rejects unknown fields/union variants.
- Annotation ID uses the existing global namespace and title keeps the existing non-empty, at-most-160-character
  document shape. Current validation preserves legacy whitespace exactly. Commands reject whitespace-only Add and an
  Update that changes the title to whitespace-only, but permit unrelated updates that retain an existing legacy title.
- Annotation and Surface-anchor counts have no schema/product hard cap. Existing JSON/ZIP input-size limits remain the
  security boundary.
- Surface anchor requires AssetEntity, its exact SceneAsset SHA-256 and a non-negative safe glTF node index.
- Surface point/normal are finite Vec3; normal is unit length within `1e-6`.
- Legacy-anchor Target and focus-target Target must exist.
- Plain text is at most 2,000 characters and is never interpreted as HTML/Markdown.
- Host key is non-empty and at most 256 characters. It is opaque and need not resolve during document validation.
- Open-link is an absolute `https:` URL, at most 2,048 characters and contains no username/password.
- Every Annotation has exactly one content variant and exactly one action variant.
- No action contains scripts, host routes, commands, arbitrary payloads, conditions or nested action lists.

Complete semantics validate anchor entity/asset/hash and Target references before Runtime load or command mutation.
Runtime resolvability of the glTF node is a load diagnostic because SceneDocument validation does not parse model bytes.

## Surface Resolution Contract

Runtime Generation maintains formal reverse indexes from hit Object3D to AssetEntity, SceneAsset hash and glTF node
index. A placement hit is valid only for a supported Mesh that resolves all three values. The public authoring evidence
contains document ID/revision, both world and node-local point/normal, entity ID, hash and node index.

Before commit, Runtime/Studio recheck document ID, revision, entity, hash and node mapping. Any mismatch rejects the
candidate and requests explicit placement again.

Runtime reconstructs a surface marker only from the exact node-local point and normal. It never uses node name,
nearest point, nearest node, traversal/object order, first available node or hash similarity. Asset hash mismatch or
missing node yields `ANNOTATION_SURFACE_UNRESOLVED` and no Canvas marker/activation.

The first version rejects placement on SkinnedMesh, any Mesh whose geometry has morph targets, InstancedMesh,
BatchedMesh and objects without a formal glTF node association. Supporting these requires another approved persisted
identity/attachment contract; triangle/barycentric/instance evidence is not hidden in metadata.

Missing runtime node/object evidence yields an unresolved diagnostic but does not invalidate an otherwise valid
SceneDocument or block local save/JSON/ZIP export. The annotation has no Canvas marker or Run activation and remains
repairable in Edit. Feature 008 owns stricter publish-readiness blocking.

## Command Contract

| Command             | Required snapshot and result                                       |
| ------------------- | ------------------------------------------------------------------ |
| `add-annotation`    | Complete canonical `after`; unused ID; one revision/history entry  |
| `update-annotation` | Exact complete `before/after`; same ID; one revision/history entry |
| `remove-annotation` | Exact complete `before`; reject locked; one revision/history entry |

Invalid, stale and no-op commands reject atomically and preserve document identity, revision, history and redo. Update
from locked permits only visibility and/or unlock; title, anchor, content, action and every other value remain exact.

Studio maps one user intent to one update command:

- Rename changes title only.
- Reposition changes anchor only and may explicitly convert Legacy to Surface.
- Hide/Show changes visible only.
- Lock/Unlock changes locked only.
- Content/Behavior Apply changes content/action only.

Transient draft, drag and input values never execute a command. Undo/Redo use complete snapshots and increase revision
once without restoring historical revision numbers.

## Cascades And Duplication

- Generic duplicate commands do not copy Annotation, preserving the accepted M1 contract.
- Delete-subtree removes Surface annotations anchored to any removed entity.
- It also removes Legacy annotations whose Target is removed and annotations whose focus-target action refers to
  a removed Target.
- Cascades occur within the single subtree command and include locked annotations. A lock protects direct Annotation
  edits/removal, not deletion of the owning model/Target.
- Cascades never rewrite an action or anchor to a fallback.
- An asset/hash change does not mutate annotations; affected Surface anchors become unresolved.

## Legacy Migration Contract

Every 1.3 Annotation maps field-for-field as follows:

```text
id                    -> id
title                 -> title
targetId              -> anchor.kind=legacy, anchor.targetId
localOffset           -> anchor.localOffset (opaque; no coordinate frame asserted)
contentKey            -> content.kind=host-content, content.key
new deterministic     -> visible=true, locked=false, action.type=show-content
```

Migration performs no raycast, node lookup, Target creation, coordinate-frame interpretation or heuristic conversion.
Legacy anchors are unresolved and render no marker until explicit Reposition. For a valid 1.3 source, every
pre-existing value outside Annotation shape remains exact except `schemaVersion: 1.3.0 -> 1.4.0`; every legacy count
remains valid.

The mandatory chain structurally and semantically validates raw 1.0/1.1/1.2/1.3 at each frozen stage and current 1.4
after migration. Invalid intermediate output rejects before later migration or persistence. Frozen validators remain
independently testable and current validation does not accept a legacy shape.

## JSON, ZIP And IndexedDB

- Raw JSON/ZIP import accepts valid declared 1.0/1.1/1.2/1.3/1.4 and returns validated current 1.4.
- Manifest `sceneSchemaVersion` matches raw pre-migration scene JSON during archive decode.
- Export accepts/emits only current 1.4; archive container stays 1.0.0.
- IndexedDB initialization reads, parses, migrates, current-validates and canonicalizes all ProjectRecords in one
  `projects` readwrite transaction.
- Rewritten legacy records retain the existing eight keys and all metadata except `documentJson` becomes canonical
  1.4 and `lastExportedRevision` becomes null because prior export bytes are no longer current.
- Already-current valid 1.4 records remain byte-identical.
- Any read/parse/intermediate/current/write failure aborts the complete transaction and exposes no normal repository
  operation over mixed versions.
- No frontend-only compatibility adapter or long-lived legacy branch remains after repository initialization.

## Runtime And React Contract

Runtime owns raycast evidence, reverse object/node indexes, marker resources, occlusion and action interpretation.
Studio owns title/content selection, deterministic IDs, command construction, Undo/Redo and save.

Suggested responsibility split:

- `surface-hit-tester`: hit resolution and world/node-local conversion.
- `hotspot-overlay`: persisted/ghost/draft marker rendering and pick proxies.
- `hotspot-interaction-controller`: placement, reposition, Run activation and transient session cleanup.
- Runtime generation: object -> entity/asset/node reverse indexes.
- Viewport: narrow pointer/mode forwarding only.

The existing oversized viewport MUST NOT absorb hotspot policy. React exposes controlled authoring callbacks and narrow
start/cancel/focus methods; it does not raycast or mutate SceneDocument.

Edit surface interaction runs at most once per animation frame and only during placement/reposition. Idle Edit does no
surface raycast. Run pointer picking targets marker proxies, not model surfaces.

Every transient operation has one session ID. Runtime synchronously invalidates the active ID, releases pointer/preview
resources and notifies Studio on Run/source/project/dispose. Studio closes only the matching DOM draft/editor/popover
and acknowledges cancellation. Run or the next source/project cannot become interactive before both sides complete;
late callbacks for canceled IDs are ignored. StrictMode MUST not duplicate listeners, controllers, callbacks or markers.

## Viewer Activation Contract

- Run renders only visible, resolved annotations.
- Every visible marker has a colocated DOM button proxy in an overlay. Pointer marker activation, DOM-proxy
  Enter/Space and read-only list activation execute the same action once. DOM proxies use roving focus in the same
  title/ID order as the list; overlapping markers remain distinct keyboard focus stops.
- `show-content` shows plain text directly or emits a trusted host-content request keyed by the opaque key; Runtime
  never injects key/content as HTML.
- `focus-hotspot` focuses the resolved world point through a point-focus API.
- `focus-target` uses the existing Target focus contract and reports unavailable rather than changing the action.
- `open-link` revalidates HTTPS and requires direct user activation. Browser refusal is a recoverable action result.
- Every activation emits only stable typed evidence: annotation ID, action type, origin and bounded result code.
- Action result, host content, camera state, current activation, hover and selection never persist.

## Performance And Accessibility Gate

- Runtime renders every valid visible Surface anchor without silent count truncation. Two hundred simultaneously visible
  markers are the minimum calibrated acceptance load, not a product/schema limit.
- Fixed 1440x900 DPR1 hardware Chromium evidence compares zero versus 200 visible markers on a deterministic fixture.
- Final gate: warmed full CPU frame work p95 at most 16.7ms and explicit 200-versus-zero CPU p95 delta at most 2ms.
  Supported GPU timer query p95 is at most 16.7ms. Projection/occlusion, DOM/marker update and marker pick p95 are each
  at most 2ms.
- Fixed 60Hz presented RAF interval p95 is at most 17.5ms, accounting for Chrome's 0.1ms timestamp granularity, with
  zero intervals above 25ms. This additional cadence oracle does not relax the 16.7ms CPU-work gate.
- Placement/reposition pointer-to-preview p95 is at most 50ms.
- Marker geometry/material or instancing strategy must keep resources bounded and prove complete dispose cleanup.
  Production capacity grows dynamically and never treats 200 as a cap.
- Opaque visible depth-writing geometry occludes markers. Transparent/transmissive, `depthWrite=false`, zero-opacity
  and invisible material state does not hide markers or DOM proxies in V1.
- Marker and list actions have keyboard parity, visible focus, localized accessible names and non-color-only state.
- Reduced motion removes marker translation/pulse/settle while retaining immediate state feedback.

## Semantic Oracle

1. A 1.3 -> 1.4 migration preserves every old Annotation value through the opaque Legacy/host-content
   mapping, asserts no coordinate frame and makes no surface guess.
2. Surface resolution succeeds only for the exact entity/hash/node and rigid supported geometry.
3. Every preview/cancel/rejection leaves document/history/redo byte-identical; every accepted intent is one command.
4. Locked direct mutation rejects except visibility/unlock; ownership cascade semantics remain explicit.
5. Run has markers/actions but no authoring path, and every authority transition clears transient state first.
6. No user-facing technical field and no script/JSON/host-route action enters Studio or SceneDocument.
7. All-record migration is atomic and current export contains only 1.4 without changing archive container shape.
8. 200-marker and pointer-preview gates use production paths and recorded browser/GPU evidence.

## Explicit User Approval Questions

Approval is requested as one coherent contract rather than piecemeal implementation:

1. Approve upgrading existing Annotation in place to the proposed 1.4 shape?
2. Approve exact entity/hash/node-local Surface anchors plus opaque legacy anchors, with no heuristics and no
   first-version skinned/morph/instanced/batched support?
3. Approve persisted visible/locked/content/action, the four-action set, HTTPS-only links, no product count cap and a
   200-visible performance baseline?
4. Approve complete-snapshot commands, locked exceptions, delete cascades and no duplicate copying?
5. Approve deterministic migration, atomic IndexedDB rewrite, current-only export and export-revision reset?

A single explicit approval of all five authorizes planning and non-production calibration. Any rejected item returns
the design package for revision. After calibration, the resulting complete contract, plan and tasks require one final
explicit implementation approval; neither approval authorizes a partial schema implementation.

The user gave that final explicit implementation approval on 2026-07-18. All five decisions and the calibrated plan are
approved as one package.
