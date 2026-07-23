# Specification: Eliminate Remaining Coplanar Overlap

## Problem

After contract collision proxies were hidden, smaller camera-dependent line patterns remained on localized smart-home
regions. Independently authored faces inside one asset resolve to the same plane, and independently placed starter
instances also contained exact world-plane overlaps. The first implementation resolved asset-local faces and separated
the master-bedroom air conditioner from the wardrobe, but user revalidation still found camera-dependent interference
only at overlapping parts. A visible-entity sweep then proved four remaining starter pairs: kitchen cabinet against the
presentation-shell partition, sink flange, dishwasher, and cooktop. Rendering those surfaces at identical depth causes
z-fighting.

## Requirements

- **FR-001**: Runtime suppression MUST operate only inside the unique formal `VISUAL` subtree of a recognized
  `ROOT` / `VISUAL` / `COLLISION` glTF contract.
- **FR-002**: A later triangle MAY be render-suppressed only when it belongs to a different formal node and matches an
  earlier triangle's canonical world-space vertices, winding, material instance, and animated-ancestor signature.
- **FR-003**: Canonical coordinate comparison MUST use a fixed `1e-6` glTF-unit precision to absorb only floating-point
  differences introduced by equivalent node transforms.
- **FR-004**: After exact duplicate suppression, a later face MAY use its original material with positive local
  `polygonOffset` only when an earlier face with the same animated-ancestor signature is on the same canonical plane
  and covers at least 95 percent of the later face's projected area. Different material, winding, and triangulation MUST
  retain their authored color and face identity.
- **FR-005**: Skinned, instanced, batched, morph-target, grouped, partial-draw, malformed, and non-triangle geometry MUST
  fail closed and remain unchanged.
- **FR-006**: Resolution MUST preserve every vertex, index value, triangle order, `faceIndex`, formal node mapping,
  hierarchy, transform, animation, and explicit Three.js raycast result.
- **FR-007**: SceneDocument schema/save/package contracts and source asset bytes/hashes MUST remain unchanged.
- **FR-008**: Replaced runtime geometries and resolution-only materials MUST follow existing lifecycle disposal without
  disposing resources still referenced by another mesh.
- **FR-009**: The default `master-ac` placement MUST leave at least 0.02 m vertical clearance above the 2.40 m wardrobe.
- **FR-010**: Existing projects MUST receive asset-local runtime face resolution after reload. Starter layout coordinates
  are user data and MUST NOT be silently migrated; the current local acceptance project is updated explicitly.
- **FR-011**: The default visible kitchen layout MUST keep every audited cabinet/presentation-shell, cabinet/faucet,
  cabinet/dishwasher, and cabinet/cooktop plane pair at least 0.005 m apart. Ground-contact faces are excluded.
- **FR-012**: Cross-entity validation MUST include only entities actually visible in the starter and MUST include the
  generated `presentation-shell`, even though that CC0 fixture intentionally has no asset geometry contract.

## Semantic Oracle

For a qualifying exact duplicate pair, exactly one triangle contributes render fragments. For a qualifying high-
coverage coplanar pair, both authored colors remain available but the later face renders at a stable positive depth
priority. Every original face remains addressable by `Raycaster` at its unchanged `faceIndex`. A non-qualifying pair is
unchanged. Source asset bytes/hashes, mappings, schema, and save semantics remain unchanged. A regenerated default
starter changes only five explicit entity transforms (`master-ac` plus four kitchen instances) and the resulting archive
hash. Across the 44 visible starter assets including the presentation shell, exact non-ground coplanar entity pairs are
zero.

## Baseline Evidence

- Frozen archive: `/home/cc/tmp/web3d-smart-home-final-20260721-a.OKfldy/smart-home-90sqm.web3d.zip`, SHA-256
  `56e2de585df7a910015b73b146090c4f5df1f50ddefea5b474be8724599bdd24`.
- 38 owner assets were audited; 13 contain 988 non-degenerate duplicate `VISUAL` triangles across different formal
  nodes. All 988 have the same winding and animated-ancestor signature.
- 976 duplicates use the same material. The 12 cross-material duplicates in `single_bed` are explicitly excluded.
- Equivalent transformed coordinates differ by at most `1.862645149230957e-7` glTF units, below the frozen `1e-6`
  canonical precision.
- Browser ray sampling proved the wardrobe patch was `master-ac` intake geometry against `master-wardrobe`, with the
  air conditioner bounds `y=2.10..2.40` and wardrobe bounds `y=0..2.400000095`.
- After the first repair, a world-space scan of all currently visible starter instances found four non-ground coplanar
  pairs: cabinet/presentation shell (0.446612 m2 projected overlap), cabinet/faucet (0.111712 m2),
  cabinet/dishwasher (0.030718 m2), and cabinet/cooktop (0.001801 m2). Hidden doors, windows, curtains, and the hidden
  owner `home-shell` are not runtime candidates.
- Local audit artifacts are `/home/cc/tmp/sceneweave-feature013-visual-duplicates.json` and
  `/home/cc/tmp/sceneweave-feature013-visual-duplicate-safety.json`. The revalidation sweep is
  `/home/cc/tmp/sceneweave-feature013-visible-instance-coplanar-overlap-with-shell.json`.

## Success Criteria

- Focused tests prove exact suppression, different-triangulation coverage, below-threshold rejection, stable priorities,
  unchanged index/face order, raycasts, animation boundaries, shared-resource safety, and disposal.
- Frozen smart-home integration reports 976 hidden exact duplicates plus the accepted bounded coplanar-offset count.
- The starter contract proves at least 0.02 m `master-ac`/wardrobe clearance.
- The visible-instance audit proves zero non-ground coplanar entity pairs after the kitchen placement correction.
- Full formatting, lint, type, unit, build, package, documentation, asset, design, topology, and i18n gates pass.
- Browser evidence covers the original five asset-local targets plus the corrected kitchen assembly from multiple
  camera angles without recurring camera-dependent overlap lines or runtime errors.
