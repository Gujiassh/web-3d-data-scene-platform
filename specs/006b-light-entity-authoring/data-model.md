# Data Model: Light Entity Authoring

**Status**: Current SceneDocument 1.3 model implemented and accepted

## SceneDocument 1.3

SceneDocument 1.3 retains every 1.2 top-level field and adds the LightEntity variant:

```ts
interface SceneDocument {
  schemaVersion: "1.3.0";
  // all existing fields unchanged
  entities: readonly SceneEntity[];
  environment: SceneEnvironment; // exact 1.2 fill/key shape
}

type SceneEntity = GroupEntity | AssetEntity | LightEntity;

interface LightEntity extends EntityBase {
  type: "light";
  parentId: null;
  light: PointLightProperties | SpotLightProperties;
}
```

## Shared Light Fields

| Field       | Type                 | Validation and meaning                                                        |
| ----------- | -------------------- | ----------------------------------------------------------------------------- |
| `id`        | existing document ID | Unique in the complete document namespace                                     |
| `type`      | `"light"`            | Top-level SceneEntity discriminator                                           |
| `parentId`  | `null`               | Root-only; non-null is invalid                                                |
| `name`      | existing name        | Mutable display text; never identity/direction                                |
| `visible`   | boolean              | False disables illumination/helper                                            |
| `locked`    | boolean              | Blocks rename/property/transform/remove; visibility and unlock remain allowed |
| `transform` | existing `Transform` | World-space because parent is null; type-specific invariants below            |
| `metadata`  | existing metadata    | No Runtime/helper/unit-conversion fields                                      |
| `light`     | property union       | Nested point/spot `kind` discriminator                                        |

```ts
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
```

## Value Invariants

- color is canonical uppercase `#RRGGBB`; commands do not normalize input
- intensity is finite unitless authored brightness in `[0, 1000]` and passes directly to Three r185 after validation
- persisted/UI unit selection/conversion, candela, lumen, lux and IES fields are invalid
- range is null or finite positive scene units; Runtime maps null to Three distance `0`
- Runtime fixes `decay = 2` and `castShadow = false`; neither persists
- point position contains three finite values; rotation and scale are exact identity
- spot position is finite; rotation is a finite normalized quaternion; scale is exact identity
- spot direction is quaternion-transformed local `-Z`
- `0 < angleRadians <= PI / 2`; `0 <= penumbra <= 1`

## Aggregate And Reference Invariants

- zero through eight LightEntities are valid; nine is invalid regardless of kind/order
- LightEntity IDs use existing duplicate-ID semantics
- a LightEntity cannot own children
- any entity whose `parentId` resolves to a LightEntity is invalid, even if the light itself has `parentId: null`
- Group/CreateGroup/Reparent/layout reject a light as member, source, parent or destination
- LightEntities are excluded from semantic target/data-binding destinations and cannot be inferred as asset targets
- imported glTF punctual lights never become LightEntities

## Command Snapshots

| Command               | Snapshot                                      |
| --------------------- | --------------------------------------------- |
| `add-light-entity`    | complete canonical `after`                    |
| `update-light-entity` | exact complete canonical `before` and `after` |
| `remove-light-entity` | exact complete canonical `before`             |

Update owns name, visible, locked, light and transform. From a locked `before`, only visible and/or
`locked: true -> false` may differ. Duplicate projects a source into one add snapshot with fresh ID/name, root parent,
position offset exactly `[1, 0, 0]` scene units, source light/visibility, `locked: false`, identity point rotation/all
scale and preserved spot rotation. The source is unchanged.

Generic rename/visibility/lock/transform, subtree duplicate/delete, create-group and reparent command shapes do not
gain light semantics; they reject any light operand atomically.

## Calibrated Creation Projection

These are Studio projections, not schema defaults:

- creation frame: immutable finite `{ position, target }` from Runtime while ready
- Runtime reads finite camera position and OrbitControls target, computes
  `offsetY = clamp(length(camera - target) * 0.2, 0.5, 5)` and `position = target + [0, offsetY, 0]`
- color: `#FFFFFF`; range: `null`
- point rotation/scale: identity
- spot rotation: aimed from frame position at target; `angleRadians = PI / 4`; `penumbra = 1 / 3`; scale identity
- names: `Point light` or `Spot light` plus deterministic lowest available positive suffix
- unitless intensity: Point `25`; Spot `10`
- Studio control: `Brightness` slider `[0, 100]` plus exact numeric input `[0, 1000]`; no explanatory copy
- duplicate position offset: exact `[1, 0, 0]` scene units; copied entity is unlocked

## Migration States

| Raw version | Required validated chain                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0       | validate frozen 1.0 -> migrate -> validate frozen 1.1 -> migrate -> validate frozen 1.2 -> migrate -> validate current 1.3 |
| 1.1.0       | validate frozen 1.1 -> migrate -> validate frozen 1.2 -> migrate -> validate current 1.3                                   |
| 1.2.0       | validate frozen 1.2 -> schemaVersion-only migrate -> validate current 1.3                                                  |
| 1.3.0       | validate current 1.3, unchanged                                                                                            |

Each validation includes structure and complete semantics. An invalid intermediate stops the chain. For 1.2 input,
revision and every pre-existing value remain exact; no light is synthesized.

## Runtime Authority State

Runtime-only state is never persisted:

```ts
type AuthoringMode = "edit" | "run";

interface LightOnlyReconcileState {
  readonly sourceToken: number;
  readonly documentId: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly stagedLightIds: readonly string[];
}
```

Complete current validation precedes exact classification. A qualifying reconcile stages all resource changes before
publishing document/revision/ready together. A false classification full-loads. Invalid, failed, stale or superseded
sources publish nothing and retain old Runtime authority.

For the same `documentId`, revision handling precedes fast/full classification:

- `candidate.revision < current.revision`: reject; no mutation or ready
- equal revision plus canonical-complete and semantic identity: no-op; no ready
- equal revision plus any conflicting data: reject; no mutation or ready
- greater revision: eligible for exact light-only classification or full load

A different `documentId` starts an independent revision domain; its numeric revision may be lower. The full-load path
cannot bypass same-document monotonicity.

Logical selection remains controlled in Run but Runtime has no Run selection visual/pick surface. Mode, active drag,
helper/proxy/overlay, creation frame and staged reconciliation state are transient.

## Test-Only Performance Fixture

Implementation adds `tests/fixtures/006b-light-performance-pbr/**` as a durable deterministic lit PBR test asset. It
matches the accepted scene scale and fixed camera and contains bounded material variety sufficient to exercise punctual
fragment shading. It is not SceneDocument state, is never imported into ProjectRecords/JSON/ZIP, and carries no visual
business meaning. Production performance runs the same serial observed-event protocol on both this shader-cost fixture
and the 006 controller/generation/identity-overhead fixture.

## ProjectRecord Rewrite

The record retains exactly `id`, `name`, `createdAt`, `updatedAt`, `lastOpenedAt`, `lastSavedRevision`,
`lastExportedRevision` and `documentJson`. Canonical `documentJson` is current 1.3. The implemented required behavior
sets `lastExportedRevision` to null for every rewritten legacy record. Already-current valid
1.3 ProjectRecords remain byte-identical. One readwrite transaction rewrites all changed legacy records or none.
