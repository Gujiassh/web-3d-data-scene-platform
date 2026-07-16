# Feature 006 Layout Fixture

This directory contains the deterministic SceneDocument and machine-readable spatial oracles for feature 006. It intentionally contains no GLB copy.

## Reused Asset

The sole asset remains owned by the accepted M0 fixture:

```text
path: ../m0-factory/public/m0-factory-cell.glb
SceneAsset.uri: asset://e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8
byteLength: 1216
sha256: e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8
mediaType: model/gltf-binary
```

Do not copy, rename, regenerate or modify that GLB as part of feature 006. The SceneDocument uses the
archive codec's canonical local `asset://<sha256>` URI while archive/E2E setup resolves its bytes from the
shared path and verifies the accepted byte length/hash before use. The asset remains covered by the CC0
license in `tests/fixtures/m0-factory/LICENSE-CC0.txt`.

## Scene Shape

`layout.scene.json` is a valid `SceneDocument 1.1.0` with explicit custom background mode and:

- one identity root Group, `layout-root`;
- four visible, unlocked asset entities sharing `layout-root` as explicit parent;
- identity entity rotations, asymmetric positions and positive non-uniform scales;
- one root Target per asset entity using the shared asset hash and `nodeIndex: null`;
- one feature-005-compatible `status-cycle` Mock source, Binding and three-value color/alarm RuleSet on
  `layout-target-a`;
- Y-up coordinates and meter units.

The entity array is deliberately ordered C, root, A, D, B. The target array is deliberately ordered D, B,
A, C. Neither array follows hierarchy, stable ID or display-name order. Commands and runtime projection
must resolve explicit IDs/parents and must not infer meaning from array position or names.

## Spatial Oracle

`layout-oracles.json` records:

- every initial parent, local transform, local matrix, world matrix and world AABB;
- root Group bounds as the union of all visible child asset bounds;
- create-group A/B and subsequent reparent-C expected local/world results;
- independent align, distribute, duplicate-offset, translation-grid, rotation-angle, scale and
  bounds-anchor action results;
- accepted preview/revision/history deltas and rejected-action zero deltas;
- existing data-binding collections that duplicate/layout operations must preserve.

Action entries declare `basis`. Unless an entry names another action, its expected result is independent
and starts from `layout.scene.json`. `reparentCIntoGroupAB` is the only sequential oracle and starts from
`createGroupAB`.

Matrices use Three.js column-major `Matrix4.toArray()` order. Comparison epsilon is `1e-9`; fixture
transforms deliberately avoid rotation-plus-non-uniform-parent shear so their values are exactly
representable by the existing TRS contract. Synthetic unit tests, not this fixture, own non-representable
shear rejection.

## Bounds Evidence

The shared GLB was parsed with the repository's Three.js 0.185 `GLTFLoader`, then measured with
`Box3.setFromObject`. Its local bounds are:

```text
min: [-2.225, 0, -0.575]
max: [2.65, 1.5, 0.575]
```

The recorded entity AABBs are these loaded bounds transformed by each identity-rotation entity matrix.
They are fixed expected values, not a substitute for runtime evidence. Runtime unit tests call the spatial
snapshot API directly. Real-WebGL E2E triggers the public Studio selection/layout flow, compares the
accessible live pivot plus snapshot-derived action results and world matrices with these oracles, and
requires authored Canvas pixels. A missing measurement, blank Canvas or non-comparable sample blocks
acceptance.

## Integrity Checks

```bash
stat -c '%s %n' tests/fixtures/m0-factory/public/m0-factory-cell.glb
sha256sum tests/fixtures/m0-factory/public/m0-factory-cell.glb
pnpm exec prettier --check tests/fixtures/006-layout specs/006-scene-layout/tasks.md
git diff --check -- tests/fixtures/006-layout specs/006-scene-layout/tasks.md
```

The document validator must accept `layout.scene.json` before T011 is complete. The oracle file is a test
contract rather than a SceneDocument and is checked as JSON plus by the future runtime/E2E consumers.
