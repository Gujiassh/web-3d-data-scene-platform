# Contract: SceneDocument 1.3 Light Entities

**Status**: Current production contract; implemented and accepted
**Current contract**: SceneDocument 1.3.0
**Archive container**: remains 1.0.0

## Implementation Status

Design-time WebGL calibration, independent final re-review and explicit complete-contract approval preceded production
work. The contract is implemented through T034. CHK038 hardware performance acceptance and reverse Critical closure
are complete.

## Type Contract

```ts
interface LightEntity extends EntityBase {
  type: "light";
  parentId: null;
  light: PointLightProperties | SpotLightProperties;
}

interface PointLightProperties {
  kind: "point";
  color: CanonicalHexColor;
  intensity: number; // unitless authored brightness
  range: number | null;
}

interface SpotLightProperties {
  kind: "spot";
  color: CanonicalHexColor;
  intensity: number; // unitless authored brightness
  range: number | null;
  angleRadians: number;
  penumbra: number;
}

type SceneEntity = GroupEntity | AssetEntity | LightEntity;
```

## Validation Contract

- Existing EntityBase ID/name/visible/locked/metadata rules remain unchanged.
- entity `type` is exactly `light`; nested `light.kind` is exactly point or spot.
- `parentId` is null; LightEntity owns no children; any entity parented to a light is semantically invalid.
- color is exact uppercase `#RRGGBB`; no command normalization.
- intensity is finite unitless authored brightness in `[0, 1000]`, passed directly to Three r185 after validation.
- unit selection/conversion, candela, lumens, lux, IES or other photometric profile fields are invalid.
- range is null or finite positive scene units; Runtime maps null to Three distance 0.
- Runtime fixes decay 2 and `castShadow = false`; neither is persisted/configurable.
- point rotation and all light scale are exact identity.
- spot rotation is finite normalized quaternion and transforms local `-Z`.
- `0 < angleRadians <= PI / 2`; `0 <= penumbra <= 1`.
- total point plus spot count is at most eight.
- Group/CreateGroup/Reparent/layout reject a light as member, source, parent or destination.
- helper, proxy, selection, mode, creation frame and Runtime resource state are not persisted.

## Retained 1.2 Baseline And Migration

`SceneEnvironment` and `environment.lighting.fill/key` remain structurally and semantically identical to 1.2.
Migration creates no light and changes only:

```text
schemaVersion: "1.2.0" -> "1.3.0"
```

The required validation chain is:

```text
validate 1.0 -> migrate -> validate 1.1 -> migrate -> validate 1.2 -> migrate -> validate current 1.3
```

Entry at 1.1 or 1.2 begins at its corresponding frozen validator. Every validation includes structure and complete
semantics. Invalid intermediate 1.1/1.2 output rejects before the next step or persistence.

“Frozen 1.2” specifically requires:

- `specs/001-product-foundation/contracts/scene-document-1.2.schema.json`
- generated `scene-document-1.2.validator.js` and `.d.ts`
- generator entry, structure result/function and `validateSceneDocument1_2`
- current/1.0/1.1/1.2 standalone independence smoke

## Command Contract

| Command               | Required complete snapshot behavior                                                    |
| --------------------- | -------------------------------------------------------------------------------------- |
| `add-light-entity`    | canonical `after`; unused ID; under eight; one revision/history entry                  |
| `update-light-entity` | exact canonical `before/after`; same ID/type; owns name/visible/locked/light/transform |
| `remove-light-entity` | exact canonical `before`; reject locked/stale; one revision/history entry              |

These are the only LightEntity mutation commands. Invalid/stale/no-op rejection is atomic and preserves redo. From a
locked before, update may change only visible and/or unlock; name, light and transform remain exact. Remove rejects.

Duplicate projects a source into one add with fresh ID/name, root parent, exact `[1, 0, 0]` scene-unit offset, copied
properties/visibility, `locked: false`, identity Point rotation/all scale and copied Spot rotation. A locked source is
allowed and remains unchanged. Duplicate rejects at eight and never uses Group/Reparent/layout.

The following generic routes atomically reject any light operand and do not clear redo:

- `rename-entity`, `set-entity-visibility`, `set-entity-lock`
- `transform-entity`, `transform-entities`
- `delete-subtree`, `duplicate-subtree`, `duplicate-subtrees`
- `create-group`, `reparent-entities`

Studio light visibility/lock/delete routes to update/remove light commands.

## Runtime Source Reconciliation Contract

Runtime source authority follows this non-negotiable order:

1. validate the complete candidate as current 1.3 structure and semantics;
2. invalid source rejects before classification/mutation and retains old Runtime;
3. for the same document ID, lower revision rejects; equal canonical/semantic-identical source no-ops; equal
   conflicting source rejects; each emits no ready and mutates nothing; only greater revision continues;
4. a different document ID has an independent revision domain and takes project-switch full load;
5. classify exact diff only after validation/revision gating;
6. qualification requires all non-entity top-level fields, non-light values/relative order and unchanged light
   snapshots to deep-equal current authority;
7. entity reorder, non-light change or any valid classification false result uses existing full load without bypassing
   the same-document greater-revision rule;
8. valid same-document revision-plus-light-only diff stages complete add/update/remove changes;
9. current successful stage atomically publishes resources, authoritative document/revision and matching ready;
10. failure/stale/superseded stage disposes staged work and publishes nothing.

Classification never substitutes validation or revision gating. The light-only path covers commands and Undo/Redo and retains
Canvas, generation, assets, adapters, camera/OrbitControls target, TransformControls/settings, logical selection and
fill/key. Any non-light change full-loads.

## Runtime/React Authoring Mode Contract

Runtime `setAuthoringMode` and controlled React `authoringMode: "edit" | "run"` are separate from
`dataRuntimeEnabled`. Entering Run synchronously cancels active drag, restores authoritative transform, suppresses
preview/commit, detaches controls, removes/hides helper/proxy/selection overlay and suppresses entity picks/events.
Studio retains logical selection IDs only. Entering Edit restores only valid selection once, without duplicate helpers
or stale reconciliation.

Runtime/React expose `getLightCreationFrame(): Readonly<{ position: Vec3; target: Vec3 }> | null`. While ready with finite camera
position and OrbitControls target, Runtime returns deeply immutable copies with
`position = target + [0, clamp(length(camera - target) * 0.2, 0.5, 5), 0]`. Point uses position; Spot aims local `-Z`
from position at target. Studio disables Add with localized reason until available; no fallback exists.

## Studio Surface Contract

The compact Lighting toolbar menu contains Add point, Add spot, Scene lighting settings and `n/8`. It implements
trigger/menu/menuitem roles, Arrow/Home/End, Escape/outside close and focus restoration. Run, 8/8 and missing frame
have localized disabled reasons. Add closes/selects and transfers focus to Inspector. Settings transfers focus to the
environment dialog and restores trigger focus on close. Object Inspector owns selected-light fields and focuses the
first invalid field. Environment draft contains no LightEntity commands.

## JSON, ZIP And IndexedDB

- Raw JSON/ZIP import accepts declared valid 1.0/1.1/1.2/1.3 and returns validated current 1.3.
- `manifest.sceneSchemaVersion` matches raw pre-migration `scene.json`.
- Export accepts/emits only final current 1.3; archive container stays 1.0.0.
- `packages/document/src/archive/types.ts` `SceneSchemaVersion` and manifest assertions include 1.3.
- Repository initialization validates/migrates/canonically serializes all ProjectRecords in one readwrite transaction.
- Record shape stays at eight keys; identity/time/save fields remain exact; `documentJson` becomes canonical 1.3.
- Approved required behavior: every rewritten legacy record sets
  `lastExportedRevision = null`; every already-current valid 1.3 ProjectRecord remains byte-identical.
- Any parse/validation/intermediate/read/write failure aborts all and updates no timestamp/history/autosave.

## Imported glTF Punctual Lights

Imported `KHR_lights_punctual` objects remain diagnostics-only. Runtime replaces each Three Light with neutral Object3D
at the same parent slot/transform, preserving name, userData, child order/transforms, descendants, parser associations
and target resolution. It then rebuilds/patches `nodesByIndex` so every original index resolves to the retained or
replacement Object3D. Dropping children or associations with `removeFromParent()` is invalid.

## Calibrated Creation Projection

- scale-relative creation frame from finite camera/target using clamped `distance * 0.2`; no fallback
- white `#FFFFFF`, range null
- Point identity rotation/scale
- Spot aimed at target, `angleRadians = PI / 4`, `penumbra = 1 / 3`, identity scale
- deterministic lowest-available suffixed Point light/Spot light names
- unitless brightness defaults Point `25`, Spot `10`; validated range `[0, 1000]`
- UI label `Brightness`, slider `[0, 100]`, exact numeric input through `1000`, no explanatory copy
- Duplicate offset exact `[1, 0, 0]` scene units and duplicate `locked: false`

## Design Evidence

The 006 GLB is `MeshBasicMaterial` and provides no visual light response, so it measures only
controller/generation/identity overhead. A temporary
PBR fixture matched its camera/scale/fill-key under Chromium/Three r185. Point 25 changed 22.0% of pixels with mean RGB
delta 9.11, 0.256% saturation and zero pure-white clipping. Spot 10 changed 1.40%, mean delta 14.80 and had zero
saturation/clipping. Eight Point 25 clipped 5.28% of changed-region pixels; eight Spot 10 clipped zero. At 10,000,
Point/Spot pure-white clipping was about 98.8%/91.9%, rejecting that cap. The design browser used SwiftShader, so final
production performance remains a separate gate. Evidence is under `/home/cc/tmp/web3d-light-calibration*.json/png`.

Implementation includes deterministic `tests/fixtures/006b-light-performance-pbr/**` with accepted scale/fixed camera
and bounded PBR material variety to measure punctual fragment-shader cost. The same 1440x900 DPR1 serial 30-warm/300-
measured protocol covers zero, one Point 25, one Spot 10 and eight-light 4 Point/4 Spot mix on both fixtures; each
eight-light p95 must be at most 33.3 ms. The test fixture is not persisted and has no visual business-meaning oracle.
