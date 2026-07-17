# Feature Specification: Light Entity Authoring

**Feature Branch**: `006b-light-entity-authoring`
**Created**: 2026-07-17
**Status**: Implemented and accepted
**Input**: Add authored, movable point and spot lights without changing the accepted 1.2 fill/key visual baseline.

> **Implementation status**: The complete contract was approved on 2026-07-17. Production tasks T007-T034,
> independent reverse Critical review and CHK038 hardware performance acceptance are complete.

## Problem

SceneDocument 1.2 stores one scene-wide hemisphere fill and directional key rig under
`environment.lighting`. That rig gives every project a stable visual baseline but cannot represent authored
punctual lights that an author can add, select, move or rotate. Authors need a bounded set of point and spot
lights as first-class scene content while existing projects retain the exact 1.2 baseline.

## Selected Contract Decisions

- SceneDocument 1.3 keeps `environment.lighting.fill/key` byte-for-byte and visually unchanged.
- The 1.2-to-1.3 migration changes only `schemaVersion`; it creates no directional, sun, point or spot entity.
- A root-level `LightEntity` joins `SceneEntity` with entity discriminator `type: "light"` and nested
  `light.kind: "point" | "spot"`.
- Point supports translation. Spot supports translation and rotation. Scale is never authored.
- LightEntities cannot own children or participate in Group/CreateGroup/Reparent/layout operations.
- A document contains at most eight authored punctual lights.
- `intensity` is a unitless authored brightness value passed directly to Three r185 after validation. The UI label is
  `Brightness`; no candela or other physical-unit claim is made.
- Intensity is finite in `[0, 1000]`. Point defaults to `25`; Spot defaults to `10`.
- Unit selection/conversion and candela, lumen, lux or IES fields are excluded.
- Runtime uses fixed `decay = 2` and `castShadow = false`; neither is persisted.
- Imported glTF punctual lights remain non-authored and inactive after neutral replacement.
- Edit shows transient helpers and pick proxies. Run shows illumination only.
- Directional/sun entities, shadows, RectArea, IES, HDRI and unit conversion are out of scope.
- Design evidence rejects `10,000` as a normal cap because it produced about 98.8% Point and 91.9% Spot changed-region
  pure-white clipping. The frozen upper bound is `1000`.

## User Scenarios & Testing

### User Story 1 - Add And Position A Point Light (Priority: P1)

A scene author opens the compact Lighting menu, adds a point light, selects its helper, translates it and edits its
properties in Object Inspector without changing the retained fill/key baseline.

**Independent Test**: After complete contract approval, add one point light from a ready viewer, translate it, change its
properties, save and reopen. The same light, transform and pixels return; each command has one Undo.

**Acceptance Scenarios**:

1. **Given** Edit, fewer than eight lights, and a ready viewer with a finite creation frame, **When** Add point is
   chosen, **Then** the menu closes and one selected root-level point is added through one command.
2. **Given** no ready finite creation frame, **When** the menu opens, **Then** Add point and Add spot are disabled
   with a localized reason and no world-origin fallback exists.
3. **Given** an unlocked point, **When** Translate commits, **Then** only position changes and rotation/scale remain
   identity; Rotate and Scale are disabled by Studio and rejected by Runtime.

---

### User Story 2 - Aim A Spot Light (Priority: P1)

A scene author adds a spot light, moves it, rotates local `-Z` toward content and edits brightness, range,
`angleRadians` and `penumbra` while Edit helpers accurately show the result.

**Independent Test**: Add a spot, translate and rotate it with real TransformControls, change angle and penumbra,
then enter Run. Illumination remains while helpers, proxies, picks and controls disappear.

**Acceptance Scenarios**:

1. **Given** an unlocked spot, **When** Rotate commits, **Then** one normalized quaternion changes local `-Z` and
   scale remains identity.
2. **Given** invalid brightness, range, angle, penumbra or transform input, **When** Apply is requested, **Then** no
   document, revision, history, redo or autosave mutation occurs.
3. **Given** a drag preview in Edit, **When** Run is requested, **Then** Runtime synchronously cancels the drag,
   restores the authoritative transform, suppresses preview/commit, detaches controls and removes authoring picks
   before the mode transition returns.

---

### User Story 3 - Manage Light Entities Safely (Priority: P1)

A scene author can rename, hide, lock, unlock, duplicate and remove lights using light-specific complete-snapshot
commands without silently widening generic entity commands.

**Independent Test**: Exercise add/update/remove, Duplicate and Undo/Redo. Generic mutation routes reject any light
operand atomically and preserve redo. A locked light may hide/show or unlock but rejects all other edits/removal.

**Acceptance Scenarios**:

1. **Given** eight lights, **When** add or Duplicate is requested, **Then** it rejects before mutation.
2. **Given** a locked light, **When** update changes only `visible` and/or `locked: true -> false`, **Then** it
   succeeds; rename/property/transform/remove rejects.
3. **Given** a locked source, **When** Duplicate succeeds, **Then** the source is unchanged and one root copy is
   added with fresh ID/name, offset position and `locked: false`.
4. **Given** any light operand, **When** a generic rename, visibility, lock, transform, subtree, grouping or reparent
   command is requested, **Then** the complete command rejects with unchanged document/history/redo.

---

### User Story 4 - Switch Edit And Run Without Runtime Drift (Priority: P0)

The author enters Run without leaking helpers or mutation paths and returns to Edit without rebuilding scene state.

**Independent Test**: Transition Edit -> Run during a drag and Run -> Edit after light-only Undo/Redo. Verify one
Canvas/generation, authoritative transforms, no Run picks, retained logical selection and one restored helper set.

**Acceptance Scenarios**:

1. **Given** a controlled selection, **When** entering Run, **Then** Studio retains logical selected IDs while
   Runtime hides selection overlay, controls, helpers and proxies and suppresses entity picks/events.
2. **Given** Run, **When** entering Edit, **Then** the still-valid controlled selection is restored once without
   duplicate helpers or stale reconciliation; deleted selections are dropped.
3. **Given** a same-document source whose exact diff contains only valid light changes plus revision, **When** it
   loads, **Then** Runtime atomically reconciles lights and emits matching ready without replacing Canvas,
   generation, assets, adapters, camera, controls or fill/key.
4. **Given** the current accepted same-document revision, **When** a lower revision, equal conflicting revision, or
   equal identical source loads, **Then** lower/conflicting reject and identical no-ops; none mutates Runtime or emits ready.

---

### User Story 5 - Upgrade Existing Projects Without Visual Drift (Priority: P0)

An existing user opens a 1.0, 1.1 or 1.2 project and receives current 1.3 without a fake light, baseline lighting
change or partially migrated IndexedDB.

**Independent Test**: Seed mixed legacy ProjectRecords. Validate every frozen intermediate, migrate in one
transaction and compare records. Inject an invalid intermediate and a write failure; both reject without partial data.

**Acceptance Scenarios**:

1. **Given** valid 1.0, **When** migration runs, **Then** it validates 1.0, migrates and validates 1.1, migrates and
   validates 1.2, migrates and validates current 1.3.
2. **Given** valid 1.2, **When** migration runs, **Then** only `schemaVersion` changes; revision, entities,
   environment and every other value remain exact.
3. **Given** one invalid intermediate, raw record or write, **When** repository initialization runs, **Then** every
   ProjectRecord remains byte-identical and repository operations reject.

## Edge Cases

- Zero LightEntities is valid and renders only retained fill/key.
- IDs share the existing document-wide namespace.
- A LightEntity has `parentId: null`; any entity whose `parentId` points to a LightEntity is semantically invalid.
- Point rotation and all light scale are exact identity.
- Hidden lights retain authored values but produce no illumination/helper.
- Duplicate may copy a locked source but the copy is always unlocked.
- Superseded or stale light-only reconciliation cannot publish objects, document revision or ready.
- Any same-document diff outside revision plus LightEntity collection/value changes takes the existing full-load path.
- Same-document revision never rolls back: lower rejects; equal canonical-identical no-ops; equal conflicting rejects.
- A different document ID starts an independent accepted-revision domain and may validly have a lower numeric revision.
- Imported light nodes may own children; neutral replacement preserves descendants, associations and
  post-replacement `nodesByIndex`.

## Functional Requirements

- **FR-001**: SceneDocument 1.3 MUST preserve the complete 1.2 `environment.lighting.fill/key` contract and MUST
  NOT convert baseline lighting into entities.
- **FR-002**: `SceneEntity` MUST add root-level `type: "light"` with nested point/spot properties, stable identity,
  existing base fields and strict unknown-key rejection.
- **FR-003**: Zero through eight lights MUST be valid; nine MUST be invalid. Directional/sun, RectArea, shadows,
  IES and HDRI properties MUST be rejected.
- **FR-003a**: `intensity` MUST be a finite unitless authored brightness value in `[0, 1000]`, passed directly to the
  Three r185 light after validation. The UI MUST label it `Brightness`, provide a common-range slider from `0` to `100`
  plus an exact numeric input accepting through `1000`, and add no visible explanatory copy. Persisted/UI unit
  selectors, conversion metadata, candela, lumens, lux and IES MUST NOT enter the contract.
- **FR-003b**: `range: null` MUST map to Three distance `0`; finite range MUST be positive scene units. Runtime MUST
  set `decay = 2` and `castShadow = false`; these MUST NOT persist.
- **FR-004**: Point allows finite position only; spot allows finite position and normalized rotation; all scale and
  point rotation MUST be identity. Spot direction is quaternion-rotated local `-Z`.
- **FR-005**: LightEntities MUST be root-only, own no children and be rejected as Group/CreateGroup/Reparent/layout
  members, sources, parents or destinations. Semantics MUST reject every entity parented to a LightEntity.
- **FR-006**: Exactly `add-light-entity`, `update-light-entity` and `remove-light-entity` mutate LightEntities using
  complete canonical snapshots, exact stale checks, atomic no-op/invalid rejection and one revision/history entry.
- **FR-006a**: Update owns name, `visible`, `locked`, `light` and `transform`. From locked `before`, only visibility
  and/or unlock may change; all other locked updates and remove reject.
- **FR-006b**: Duplicate MUST be one add with fresh ID/name, root parent, deterministic non-zero position offset,
  source properties/visibility, `locked: false`, identity point rotation/all scale and preserved spot rotation.
- **FR-006c**: `rename-entity`, `set-entity-visibility`, `set-entity-lock`, `transform-entity`,
  `transform-entities`, `delete-subtree`, `duplicate-subtree`, `duplicate-subtrees`, `create-group` and
  `reparent-entities` MUST atomically reject any LightEntity operand without clearing redo. Studio light actions MUST
  route to update/remove light commands.
- **FR-007**: Runtime and Studio MUST independently gate Point Select/Translate, Spot Select/Translate/Rotate and
  never Scale. Unsupported tools, shortcuts and imperative calls reject before preview/commit.
- **FR-008**: Runtime MUST expose an authoring mode separate from `dataRuntimeEnabled`; React MUST expose a controlled
  `authoringMode: "edit" | "run"` prop and handle method. Run transition MUST synchronously cancel/revert drag,
  detach controls, remove/hide helpers/proxies/overlay and suppress picks/events.
- **FR-008a**: Logical selection remains controlled across Run but has no Run visual or pick surface. Edit restores
  only valid selection once and MUST NOT duplicate helpers or replay stale reconciliation.
- **FR-009**: The Lighting toolbar entry MUST be a compact accessible menu with Add point, Add spot, Scene lighting
  settings and `n/8`. Add closes and selects. Settings alone opens the environment draft; Object Inspector owns
  selected-light properties.
- **FR-009a**: Runtime/React MUST expose a narrow read-only
  `getLightCreationFrame(): Readonly<{ position: Vec3; target: Vec3 }> | null`. Only while ready with finite camera position and
  OrbitControls target, compute `distance = length(camera - target)`, `offsetY = clamp(distance * 0.2, 0.5, 5)`, and
  `position = target + [0, offsetY, 0]`; return deeply immutable copies. Point uses position and identity rotation; Spot uses
  position and aims local `-Z` at target. Add MUST be disabled with localized reason until available; no fallback.
- **FR-010**: The 1.2-to-1.3 migration MUST change only `schemaVersion` and preserve revision/all values.
- **FR-011**: Migration MUST structurally and semantically validate every raw and intermediate frozen version before
  the next step, then validate current 1.3. Invalid intermediate output MUST reject.
- **FR-012**: IndexedDB initialization MUST transactionally rewrite all ProjectRecords to canonical 1.3 or none;
  stored legacy bytes MUST NOT survive behind a frontend compatibility view.
- **FR-012a**: The implemented required rewrite behavior is `lastExportedRevision = null` for each legacy record whose
  `documentJson` is rewritten. An already-current valid 1.3 ProjectRecord MUST remain byte-identical. This behavior is
  approved as the required migration behavior.
- **FR-013**: JSON/ZIP import MUST accept valid declared 1.0/1.1/1.2/1.3 and return 1.3. Export MUST emit only 1.3;
  manifest scene version matches raw pre-migration `scene.json`; archive container remains 1.0.0.
- **FR-014**: Imported punctual light neutral replacement MUST preserve parent slot, transforms, children, parser
  associations and targets, then rebuild/patch `nodesByIndex` so every original index remains resolvable.
- **FR-015**: Same-document light-only loads MUST use an exact classifier and atomic Runtime fast path. Success MUST
  update authoritative document/revision and emit matching ready while retaining selection, controls, adapters,
  assets, generation, camera, Canvas and fill/key. Any non-light diff MUST full-load. Stale/superseded work MUST not
  publish.
- **FR-015b**: Qualification MUST require every non-revision top-level field outside `entities`, every non-light entity
  value and relative order, and every unchanged LightEntity snapshot to deep-equal current authority. Entity reorder,
  non-light add/update/remove or any other difference MUST classify false and use full load.
- **FR-015a**: `viewer.load/reconcile` MUST validate complete current 1.3 structure and semantics before exact
  classification. Classification MUST NOT substitute validation. Invalid source MUST reject before either fast-path or
  full-load mutation and retain old Runtime; only a valid classification false result may use existing full load.
- **FR-015c**: After validation and before fast-path/full-load classification, same-document revision rules MUST apply:
  candidate revision lower than current rejects with no mutation/ready; equal revision with canonical bytes and complete
  semantics identical to current is a no-op with no ready; equal revision with any conflicting data rejects; only a
  greater revision may classify/reconcile or full-load. A different document ID uses an independent revision domain.
- **FR-016**: Design calibration and independent final review are complete. One user approval of the complete
  calibrated contract was received on 2026-07-17 before production work began; no temporary unbounded or partially
  approved 1.3 is allowed.

## Non-Functional Requirements

- **NFR-001**: Final production performance evidence MUST use the production path in system Chromium, fixed 1440x900
  DPR1 and recorded acceptance-machine GPU/browser profile on both the 006 GLB/fixed camera and a durable deterministic
  lit PBR fixture under `tests/fixtures/006b-light-performance-pbr/`. The 006 fixture measures controller,
  generation and identity overhead; only the lit PBR fixture measures punctual fragment-shader cost. Neither fixture
  asserts visual business meaning. Record first-add/shader-compile transition separately. Because the render slot coalesces
  requests, issue exactly one requested render and await its corresponding performance event before issuing the next;
  for each fixture/state discard exactly 30 observed warm-up events, then collect exactly 300 observed measured events.
- **NFR-002**: Report median/p95/max `renderDurationMs`, `drawCalls` and `triangles`; eight-light warmed p95 MUST be
  `<= 33.3 ms` (30 FPS) on both fixtures. Cover zero lights, one Point 25, one Spot 10 and an eight-light 4 Point/4 Spot
  mix. No adaptive cap or alternate threshold is allowed without approval.
- **NFR-003**: Every accepted light command creates exactly one revision and Undo entry. Rejection preserves document
  identity, revision, history and redo.
- **NFR-004**: Edit/Run, light commands and light-only Undo/Redo MUST retain one Canvas and generation.
- **NFR-005**: Menu/Inspector MUST be bilingual, keyboard accessible and non-color-only, with visible focus and
  deterministic focus restoration.

## Semantic Oracle

1. Valid 1.2 -> 1.3 differs only at `/schemaVersion`, has zero lights and identical baseline pixels.
2. Every migration hop is frozen-validated; an invalid 1.1 or 1.2 intermediate prevents later migration/persistence.
3. Add/update/remove/Undo/Redo light-only sources publish atomically at matching revision without generation rebuild;
   non-light diffs full-load and superseded loads publish nothing.
4. Invalid current source rejects before classification and leaves old document/revision/resources/ready state exact.
5. Same-document lower revision rejects; equal identical no-ops; equal conflicting rejects; all preserve Runtime and
   emit no ready. Only greater revision proceeds, while another document ID has an independent revision domain.
6. Locked light update changes only visibility and/or unlock. Generic route rejection preserves redo.
7. Duplicate of locked source leaves source exact and adds one unlocked bounded copy.
8. Run synchronously reverts drag preview and has no controls/helpers/proxies/overlay/picks; Edit restores one valid
   selection/helper set.
9. Add has no fallback and cannot execute without a ready finite scale-relative creation frame.
10. Imported-light replacement keeps child tree/targets and post-replacement `nodesByIndex` resolution.
11. IndexedDB success rewrites legacy records with `lastExportedRevision: null`; current 1.3 records stay byte-identical;
    injected failure leaves every record exact.
12. Both 006 overhead and lit PBR shader-cost fixtures count 300 serially observed events per state; each eight-light
    mixed-state p95 is at most 33.3 ms.

## Design Calibration Evidence

- The 006 GLB uses `MeshBasicMaterial` and is unaffected by lights. It remains one production performance fixture for
  controller/generation/identity overhead but cannot measure punctual fragment-shader cost or visual intensity.
- A temporary `MeshStandardMaterial` PBR fixture matched the 006 camera, scale and fill/key under real Chromium/Three
  r185. The design browser reported SwiftShader, so its timing numbers are not production performance acceptance.
- Point `25`: 22.0% changed pixels, mean RGB delta 9.11, saturation 0.256%, pure-white clipping 0.
- Spot `10`: 1.40% changed pixels, mean RGB delta 14.80, saturation 0, pure-white clipping 0.
- Eight Point `25`: 5.28% changed-region pure-white clipping. Eight Spot `10`: zero clipping.
- `10,000`: about 98.8% Point and 91.9% Spot changed-region pure-white clipping; rejected as a normal cap.
- Evidence: `/home/cc/tmp/web3d-light-calibration-final.json`,
  `/home/cc/tmp/web3d-light-calibration-pbr.json`, and `/home/cc/tmp/web3d-light-calibration*.png`.

## Calibrated Creation Values

The following are Studio projections, not schema defaults:

- frame: ready finite camera position and OrbitControls target; position is target plus world `+Y` by
  `clamp(camera-target distance * 0.2, 0.5, 5)` scene units
- color: `#FFFFFF`; range: `null`
- point rotation/scale: identity
- spot rotation: aimed from the creation-frame position at target; `angleRadians = PI / 4`; `penumbra = 1 / 3`; scale identity
- names: deterministic `Point light`/`Spot light` with the lowest available positive suffix
- unitless intensity defaults: Point `25`, Spot `10`; accepted range `[0, 1000]`
- Duplicate offset vector: exact `[1, 0, 0]` scene units; a copied locked source produces `locked: false`

The independently reviewed entity shape, unitless brightness values/defaults, limits, creation frame, commands,
required legacy `lastExportedRevision = null` rewrite/current-record preservation, migration, archive, IndexedDB,
Runtime, React and Studio contracts were approved on 2026-07-17 and are implemented and accepted through T034.

## Out Of Scope

- Directional/sun LightEntities, RectArea lights, shadows or shadow controls
- Intensity unit selection/conversion, candela, lumens, lux, IES profiles or other photometric profiles
- HDRI/environment maps
- Converting imported glTF lights into authored entities
- Light parenting, grouping, scale, animation or live-data binding
