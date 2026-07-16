# Research: Studio Usability And Scene Lighting

## Command Discoverability

**Decision**: Use one canonical command registry for keyboard matching, tooltips and searchable Help.

**Rationale**: The current shortcuts already work but are invisible. One registry prevents localized Help
from drifting away from executable chords.

**Alternatives considered**: Static Help copy was rejected because it duplicates semantics. User
rebinding was deferred because it adds conflict resolution and preference migration without improving the
core resume demonstration.

## Rotation Editing And Reset

**Decision**: Display intrinsic local XYZ degrees and persist only normalized quaternion; define reset as
local identity, not import-time restoration.

**Rationale**: Degrees are understandable while quaternion remains the stable scene contract. Import-time
restoration is impossible without a new persistent baseline field.

## Smart Alignment

**Decision**: Implement primary-entity edge/center alignment per active world axis using a camera-relative
eight-pixel threshold and deterministic tuple. Keep equal-gap live guides out of scope.

**Rationale**: This provides the requested direct-manipulation convenience while retaining deterministic
behavior and bounded computation. Existing explicit Distribute covers equal gaps.

## Lighting

**Decision**: Persist one concrete hemisphere fill plus directional key rig; Studio presets write values,
not preset names. Exclude shadows and imported punctual lights from active rendering.

**Rationale**: Scene appearance is authored meaning and must round-trip. A two-light rig matches current
Runtime, migrates without visual drift and remains understandable to non-DCC users.

## Migration

**Decision**: Freeze legacy validators, validate legacy semantics before chained migration, revalidate
current output and rewrite all IndexedDB records transactionally.

**Rationale**: Frontend-only compatibility would leave stale stored truth. Whole-transaction rollback keeps
mixed valid/invalid project stores observable and recoverable.
