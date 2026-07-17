# Implementation Plan: Light Entity Authoring

**Branch**: `006b-light-entity-authoring` | **Date**: 2026-07-17 | **Spec**: [spec.md](spec.md)
**Status**: Implemented and accepted

## Summary

006B implements SceneDocument 1.3 with root-level `type: "light"` entities and nested point/spot properties. The
accepted 1.2 fill/key rig remains exact. `intensity` is unitless authored brightness in `[0, 1000]`, with calibrated
Point `25` and Spot `10` defaults. Design-time WebGL evidence is recorded without production/schema edits. Independent
final review has passed, and the complete implementation contract was approved on 2026-07-17.

## External Findings Digest

The controller and independent Critical review produced findings Q001-Q010. This plan closes them by:

- Q001: deeper evidence rejects the proposed candela claim because `environment.unit` may be mm/cm/m and Runtime has no
  world-unit-to-meter normalization; intensity is unitless, while selectors/conversion/candela/lumens/lux/IES remain excluded;
- Q002: validating every frozen migration intermediate, including a real standalone 1.2 validator;
- Q003-Q004: defining validation-first same-document light-only reconciliation and controlled Edit/Run lifecycle;
- Q005-Q007: freezing generic-route rejection, parent-to-light diagnostics and unlocked Duplicate results;
- Q008-Q009: adding a scale-relative finite creation-frame API and explicit bilingual menu/Inspector accessibility;
- Q010: recording design-time evidence while retaining a separate final production performance protocol.

The related requirements, data contract, tasks, quickstart and checklist are updated in this package.

## Approval Sequence

1. Complete independent finding closure while all production work remains blocked. **Complete.**
2. Run temporary real Chromium/Three r185 calibration without production/schema edits. **Complete.**
3. Fold measured unitless defaults Point `25`, Spot `10`, cap `1000`, creation-frame and Duplicate decisions plus
   evidence into all seven artifacts. **Complete.**
4. Close the received final-review findings and obtain reviewer final PASS. **Complete.**
5. Obtain one explicit user approval for model, values/defaults, required legacy `lastExportedRevision = null`, commands, migration, archive, IndexedDB,
   Runtime, React, Studio and acceptance plan. **Complete on 2026-07-17.**
6. Implement production/schema tasks T007-T032a after that approval. **Complete.**
7. Run T033 production evidence and T034 reverse Critical review. **Complete.**

There is no temporary unbounded production 1.3 and no partial implementation approval.

## Technical Context

- **Current document**: SceneDocument 1.3, strict schema plus semantic validation
- **Current validators**: generated current/1.0/1.1/1.2 standalone validators
- **Current migration**: validates every raw and intermediate frozen version through current 1.3
- **Current baseline**: one hemisphere fill plus directional key under `environment.lighting`
- **Current world units**: document `environment.unit` supports mm/cm/m; Runtime performs no world-unit-to-meter normalization
- **Current Runtime**: stable fill/key controller; imported punctual lights reported/removed
- **Current performance event**: `renderDurationMs`, `drawCalls`, `triangles`
- **Constraints**: one Canvas/generation, maximum eight punctual lights, fixed decay, no user-configurable shadows,
  decay, unit conversion or photometric profiles

## Architecture Decisions

### 1. Document Model And Hierarchy

`LightEntity extends EntityBase` with `type: "light"`, `parentId: null` and nested `light.kind`. Point rotation and
all light scale are identity. Spot direction is quaternion-rotated local `-Z`. A light owns no child; semantics also
reject any entity whose `parentId` resolves to a light. Group/CreateGroup/Reparent/layout routes never accept lights.

### 2. Unitless Brightness And Three.js Mapping

`light.intensity` is finite unitless authored brightness in `[0, 1000]` and passes directly to Three r185 after
validation. Calling it candela would falsely imply meter-normalized world space. No unit field/selector/conversion,
candela, lumen, lux or IES value exists. Null range maps to Three distance 0; finite positive range is scene units.
Runtime fixes decay 2 and `castShadow = false`. Studio labels the property `Brightness`, with slider `[0, 100]` and
exact numeric input through `1000`, without explanatory copy. Defaults are Point `25`, Spot `10`.

### 3. Three Complete-Snapshot Commands

Only `add-light-entity`, `update-light-entity` and `remove-light-entity` mutate lights. Update owns name, visibility,
lock, nested properties and transform. From locked `before`, only visibility and/or unlock may change. Duplicate is
one add, offsets position by exact `[1, 0, 0]` scene units and sets the copy `locked: false`, even when source is locked.

Every generic mutation route rejects a command containing a light operand atomically and without clearing redo:

- `rename-entity`, `set-entity-visibility`, `set-entity-lock`
- `transform-entity`, `transform-entities`
- `delete-subtree`, `duplicate-subtree`, `duplicate-subtrees`
- `create-group`, `reparent-entities`

Studio tree/Inspector visibility, lock and delete actions route through update/remove light commands.

### 4. Validation-First Light-Only Runtime Fast Path

`packages/runtime/src/viewer/three-scene-viewport.ts` remains authoritative for `load`. Its order is fixed:

1. validate the complete candidate as current SceneDocument 1.3 structure plus semantics;
2. if invalid, reject before classification or mutation and retain the old document/runtime;
3. for the same document ID, compare candidate revision to current accepted revision before any path split: lower
   rejects, equal canonical/semantic-identical no-ops, equal conflicting rejects, and only greater may continue;
4. a different document ID begins an independent revision domain and follows the existing project-switch full load;
5. classify an exact diff against the current authoritative document;
6. only same document ID with changes limited to revision and valid LightEntity add/update/remove qualifies; all
   non-entity top-level fields, non-light entity values/relative order and unchanged light snapshots deep-equal current
   authority;
7. any entity reorder, non-light add/update/remove or other difference classifies false and uses existing full load,
   while retaining the accepted same-document greater-revision requirement;
8. classification true stages `packages/runtime/src/viewer/authored-light-controller.ts` reconciliation off-state;
9. after all resources succeed and the load token is still current, atomically publish resources, authoritative
   document/revision and matching ready;
10. stale/superseded/failing work disposes staged resources and publishes nothing.

The pure exact classifier belongs in `packages/runtime/src/viewer/light-only-source-update.ts`; it never substitutes
validation. The authored-light controller owns Three PointLight/SpotLight resources and rollback-safe staging. The
viewport owns source ordering, authoritative document/revision, ready emission and full-load fallback.

Revision comparison is part of viewer load authority, not only the light classifier. It therefore prevents stale
same-document rollback through either fast path or full load. Canonical equality must compare the complete validated
source, not only semantic projections.

Fast-path add/update/remove and Undo/Redo retain logical selection, TransformControls instance/settings, adapters,
assets, loaded generation, camera/OrbitControls target, Canvas and fill/key. No resource may be half-published.

### 5. Controlled Authoring Mode

Runtime adds `setAuthoringMode("edit" | "run")`; React adds controlled `authoringMode` and the matching handle method.
This is additive authoring state and is not `dataRuntimeEnabled`. Entering Run is synchronous: cancel active drag,
restore the authoritative transform, suppress preview/commit, detach TransformControls, remove/hide helpers and pick
proxies, hide selection overlay and suppress object/entity picks/events. Studio retains controlled selected IDs but
renders no Run selection surface. Entering Edit restores only still-valid selection and one helper/proxy set, without
duplicate or stale reconcile work.

### 6. Scale-Relative Creation Frame API

Runtime and React expose narrow read-only
`getLightCreationFrame(): Readonly<{ position: Vec3; target: Vec3 }> | null`. Only while ready, Runtime reads finite camera
position and OrbitControls target, computes `offsetY = clamp(length(camera - target) * 0.2, 0.5, 5)` and returns
deeply immutable copies with `position = target + [0, offsetY, 0]`. Point uses position; Spot aims local `-Z` at target.
Studio never reads controls internals. Add is disabled with localized reason until a frame exists; there is no fallback.

### 7. Imported-Light Neutralization

Replace each imported Three Light with a neutral Object3D preserving parent slot, transform, children, userData and
parser associations. Rebuild/patch `nodesByIndex` after replacement so every original node index resolves to the
retained/replacement object. Imported lights remain diagnostics-only and never become authored entities.

### 8. Studio Surface And Accessibility

The Lighting toolbar trigger opens one compact menu containing exact localized labels for Add point, Add spot, Scene
lighting settings and `n/8`. It uses trigger/menu/menuitem roles, Arrow Up/Down, Home/End, Escape and outside-close.
Run, 8/8 and missing creation frame expose localized disabled reasons. Successful Add closes the menu, transfers
focus to the selected light's Inspector heading/first field and selects the light. Settings transfers focus into the
dialog; close restores trigger focus. Inspector Apply focuses the first invalid field. Scene settings contains no
authored-light commands.

## Frozen 1.2 Validator Chain

Making “freeze 1.2” real requires all of:

- `specs/001-product-foundation/contracts/scene-document-1.2.schema.json`
- generated `packages/document/src/generated/scene-document-1.2.validator.js` and `.d.ts`
- a 1.2 entry in `packages/document/scripts/generate-validators.mjs`
- 1.2 import/result/function in `packages/document/src/structure.ts`
- `validateSceneDocument1_2` structure+semantics in `packages/document/src/validate.ts` and public export
- current/1.0/1.1/1.2 standalone independence in `packages/document/scripts/smoke-standalone-validator.mjs`
- archive `SceneSchemaVersion` extended to 1.3 in `packages/document/src/archive/types.ts` and manifest assertions

Migration order is exact: validate 1.0 -> migrate -> validate 1.1 -> migrate -> validate 1.2 -> migrate -> validate
current 1.3. Entry at 1.1 or 1.2 starts at that frozen validator. Tests inject structurally and semantically invalid
intermediate 1.1 and 1.2 outputs and prove no later step/persistence occurs.

## Direct SceneEntity Branch Audit

Typecheck is necessary but insufficient. Implementation must audit and behavior-test all 16 current direct branch
files:

| Layer                       | Concrete paths and required behavior                                                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document types/commands     | `packages/document/src/types.ts`, `packages/document/src/commands/types.ts`, `packages/document/src/commands/document-command.ts`, `packages/document/src/commands/layout-command.ts`: union/clone support, only three light commands, full generic rejection, Duplicate semantics                                           |
| Document semantics          | `packages/document/src/semantics.ts`: root-only lights, no children, reject any `parentId` targeting a light, target/reference exclusions                                                                                                                                                                                    |
| Runtime contract/generation | `packages/runtime/src/document-contract.ts`, `packages/runtime/src/viewer/runtime-generation.ts`: exhaustive light variant handling without treating it as asset/group or rebuilding loaded assets                                                                                                                           |
| Studio tree/Inspector       | `apps/studio/src/features/SceneTree.tsx`, `apps/studio/src/features/scene-tree-model.ts`, `apps/studio/src/features/EntityInspector.tsx`, `apps/studio/src/features/StudioInspector.tsx`: light icon/model, routing and selected-light Inspector ownership                                                                   |
| Studio layout/transform     | `apps/studio/src/layout/layout-selection.ts`, `apps/studio/src/layout/layout-capabilities.ts`, `apps/studio/src/layout/layout-planners.ts`, `apps/studio/src/layout/useStudioSceneLayout.ts`, `apps/studio/src/transform/transform-reset.ts`: no Group/Reparent/layout placement, type-specific tools, no scale/reset bypass |

Required indirect behavior tests also cover `apps/studio/src/data-binding/useStudioDataBinding.ts` selected-target
logic and `packages/runtime/src/viewer/object-picker.ts` / `selection-overlay.ts`: lights are not data targets, Edit
helpers pick correctly, and Run suppresses light picks/overlay.

## Module Boundaries

| Layer                         | Owns                                                               | Does not own                           |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Document                      | 1.3 model/validation/migrations/three commands/archive contract    | Three resources, UI, calibration       |
| Runtime viewport              | validate/classify/load ordering, authority, ready, race protection | document history, localized policy     |
| Runtime light controller      | staged Three resources and in-place reconciliation                 | source validation, ready emission, UI  |
| Runtime authoring controllers | mode, tools, drag rollback, helpers/picks, creation-frame query    | persisted state                        |
| React                         | stable controlled forwarding for source/mode/creation-frame handle | command policy or defaults             |
| Studio light modules          | menu, Inspector, calibrated defaults, i18n, command routing        | environment draft or Runtime resources |
| Scene settings                | retained fill/key Apply/Cancel draft                               | LightEntity commands/properties        |

## Migration And Persistence Implementation

1. Independent 1.2 validation artifacts are frozen and generated.
2. Current 1.3 validates unitless intensity in `[0, 1000]`.
3. Every raw/intermediate version is validated before its next migration.
4. Migration preserves every 1.2 value except `schemaVersion`.
5. The approved upper brightness bound is frozen in schema, semantics, tests and the generated current validator.
6. JSON/ZIP imports raw legacy/current documents and exports only current 1.3; the container remains 1.0.0.
7. ProjectRecords are transactionally rewritten after the complete contract approval.
8. Every rewritten legacy record sets `lastExportedRevision` to null; already-current valid 1.3 records remain
   byte-identical.

## Verification Strategy

### Document And Persistence P0

- standalone current/1.0/1.1/1.2 validators and intermediate-invalid migration tests
- complete light structural/semantic matrix, including parent-to-light diagnostics
- exact add/update/remove, locked exceptions, Duplicate and all generic-route atomic rejection/no-redo-clear tests
- 1.2-only schemaVersion payload oracle and all-record IndexedDB rollback/idempotence
- raw manifest scene-version matching and current-only JSON/ZIP output

### Runtime/React P0

- invalid candidate rejects before classify/mutate; classifier false invokes existing full load
- exact revision matrix: same-document lower reject/no ready, equal identical no-op/no ready, equal conflict reject/no
  ready, greater fast/full path; different-document lower numeric revision remains a valid project switch
- exact same-document light-only add/update/remove/Undo/Redo atomic fast path with matching ready
- stale/superseded/failure tests retain old resources/document/revision and dispose staged work
- identity assertions for Canvas, generation, assets, adapters, camera target, controls and fill/key
- synchronous Edit -> Run drag cancel/revert and pick/helper/overlay suppression; clean Run -> Edit restoration
- finite immutable creation-frame lifecycle/calculation and React controlled mode/handle forwarding
- imported neutral replacement plus post-replacement `nodesByIndex`

### Studio P1

- complete 16-file branch audit plus indirect data-binding/picker/overlay behavior tests
- compact menu ARIA/keyboard/focus/disabled-reason/i18n exact-label tests
- Point/Spot tool and shortcut gates in Studio and Runtime
- Object Inspector invalid-focus and update/remove command routing

## Design Evidence And Production Performance Protocol

Design calibration found that the 006 GLB uses `MeshBasicMaterial` and is visually unaffected by lights. A temporary
PBR fixture therefore matched its camera, scale and fill/key for real Chromium/Three r185 visual calibration:

- Point 25: 22.0% pixels changed, mean RGB delta 9.11, 0.256% saturation, zero pure-white clipping
- Spot 10: 1.40% changed, mean delta 14.80, zero saturation/clipping
- Eight Point 25: 5.28% changed-region clipping; eight Spot 10: zero clipping
- 10,000: about 98.8% Point and 91.9% Spot clipping, rejecting it as a cap

Artifacts: `/home/cc/tmp/web3d-light-calibration-final.json`,
`/home/cc/tmp/web3d-light-calibration-pbr.json`, `/home/cc/tmp/web3d-light-calibration*.png`.

The design run used SwiftShader and does not satisfy production performance acceptance. Implementation adds a small,
durable deterministic lit fixture under `tests/fixtures/006b-light-performance-pbr/`, matching accepted scene
scale/camera with a bounded material variety that exercises punctual fragment shading. The fixture has no visual
business-meaning oracle. Final performance uses the production path in system Chromium at exactly 1440x900 CSS
pixels/DPR1 with acceptance-machine GPU/browser profile recorded on both:

- reference 006 GLB/fixed camera for controller/generation/identity overhead;
- lit PBR fixture/fixed camera for punctual fragment-shader cost.

For each fixture, record first add/shader compile separately, then test zero lights, one Point 25, one Spot 10 and eight
lights as a deterministic 4 Point/4 Spot mix:

1. issue one requested render and await its corresponding performance event before issuing the next because the render
   slot coalesces concurrent requests;
2. discard exactly 30 observed warm-up events;
3. collect exactly 300 observed measured events;
4. report median/p95/max `renderDurationMs`, `drawCalls`, `triangles` from those observed events;
5. require eight-light warmed p95 `<= 33.3 ms` on each fixture;
6. retain the separate design visual evidence without assigning visual business meaning to either performance fixture.

No adaptive caps or alternate thresholds are permitted without approval.

## Risks And Regression Rules

- Classification never replaces complete current validation.
- Same-document accepted revision is monotonic across both fast and full load; equal revision never emits ready.
- Invalid, failed, stale or superseded source work never mutates old Runtime authority.
- A 1.2 -> 1.3 diff contains only `/schemaVersion` and creates zero lights.
- No intermediate migration result bypasses its frozen validator.
- No generic command, Group/Reparent/layout route or target mapping accepts a light.
- No authoring-mode behavior is coupled to `dataRuntimeEnabled`.
- Complete user approval was received on 2026-07-17 before production/schema implementation began.
- No imported neutralization drops descendants, associations or `nodesByIndex` resolution.
- No light-only update recreates Canvas/generation/assets/adapters/camera/controls/fill-key.
