# Specification: Hide Contract Collision Geometry

## Problem

The smart-home assets contain low-poly `COLLISION` proxies for collision and picking. The runtime currently renders
those proxies together with `VISUAL` geometry. Coplanar and near-coplanar triangles then compete in the depth buffer,
producing moving black diagonal lines while the camera rotates.

## Requirements

- **FR-001**: The runtime MUST recognize only formal glTF assets containing exactly one `ROOT`, one `VISUAL`, and one
  `COLLISION` node, with `VISUAL` and `COLLISION` both below the same `ROOT` subtree and neither containing the other.
- **FR-002**: Recognition MUST allow intermediate state or motion nodes; direct sibling placement is not required.
- **FR-003**: A recognized asset MUST keep the exact `COLLISION` root hidden from rendering, including while runtime
  visibility effects are active, and MUST leave `VISUAL` renderable.
- **FR-004**: Missing, duplicate, non-formal, or structurally unrelated contract names MUST NOT change visibility.
- **FR-005**: Collision hierarchy, parser associations, formal node indexes, object-to-node mappings, transforms,
  animations, and explicit raycast access MUST remain intact.
- **FR-006**: SceneDocument/schema/save/archive/package contracts and source asset bytes/hashes MUST remain unchanged.
- **FR-007**: An already-imported smart-home project MUST receive the rendering fix after runtime reload without asset
  re-import or document migration.

## Success Criteria

- Focused loader and runtime tests prove strict structural recognition, the nested robot-vacuum shape, preserved
  maps/hierarchy, visible visual geometry, raycasts against hidden collision geometry, and rejection of an active
  visibility effect that tries to show the collision root.
- Full formatting, lint, type, unit, build, package, documentation, asset, design, topology, and i18n gates pass.
- Browser before/after evidence shows the smart-home scene remains nonblank and the black diagonal z-fighting pattern is
  removed without module or runtime errors.
