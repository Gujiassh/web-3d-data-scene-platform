# Acceptance: Eliminate Remaining Coplanar Overlap

## Status

Accepted locally. Commit, push, CI parity, and final workbench closeout remain pending.

## Delivery Lineage

- Source and repair branch: `main`.
- Starting ref: `origin/main@180153ba05ef5a7a363a9c513143ab53650653fe`.
- Symptom: after collision-proxy suppression, localized furniture and appliance regions still showed lines that changed
  as the camera rotated. The first Feature 013 browser pass removed the widespread artifact, but user revalidation found
  interference at remaining overlapping parts.
- Root cause: independently authored meshes inside formal `VISUAL` subtrees contain same-plane faces; the original
  master air conditioner crossed the wardrobe; and four visible kitchen entity pairs were exactly coplanar in world
  space. The final four were cabinet/presentation shell, cabinet/faucet, cabinet/dishwasher, and cabinet/cooktop.
- Changed scope: runtime glTF post-load geometry groups, resolution-only material clones, five explicit starter entity
  positions, focused tests, and Feature 013/SSoT documentation.
- Frozen scope: SceneDocument/schema/save/archive contracts, asset bytes/hashes, formal target indexes, transforms,
  animations, hierarchy, source vertices/index order, face indexes, and raycast/picking availability. Existing project
  coordinates are not migrated automatically.
- Repair commit: pending.
- Delivery target: `origin/main`; no downstream merge or cherry-pick is planned.

## Review Matrix

- Goal alignment: pass. The moving-camera interference is removed at both asset-local and visible starter-instance
  layers; no unrelated renderer behavior changed.
- User-visible flow and timing: pass. Existing and fresh projects load normally; four corrected kitchen targets and the
  original five targets changed canvas hashes under real camera drag without errors or recurring overlap lines.
- Architecture and boundaries: pass. Runtime resolution remains inside recognized formal asset contracts. The default
  layout owns independent entity placement and the generated presentation shell remains contract-free.
- Data/save contracts: pass. Schema, serialization, revision, save behavior, target mappings, and 39 source asset bytes
  are unchanged. The generated archive changes only four kitchen positions relative to the already-corrected archive.
- Render and picking semantics: pass. Source indexes and face order remain unchanged; raycast tests retain original
  `faceIndex` results while exact duplicates are render-hidden and high-coverage faces retain authored materials.
- Resource lifecycle: pass. Detached source geometry is disposed only after reference scanning; runtime geometry and
  material clones are disposed with the asset.
- Verification and evolution: pass. Full repository and release gates pass. Owner-source verification remains
  fail-closed on pre-existing mutable source hashes and was not weakened.
- Independent/reverse review: pass by main-controller reverse review. No unresolved identifier/import, scope, contract,
  lifecycle, or acceptance finding remains.

## Verification

- Runtime focus: 32/32 asset-loader and coplanar-resolution tests passed.
- Frozen integration: 38 assets loaded; 976 exact duplicate triangles hidden, 1307 coplanar triangles offset across 299
  meshes, maximum offset priority 3. Asset bytes are unchanged.
- Visible-instance oracle before rework: 44 visible assets including `presentation-shell`; four non-ground coplanar
  entity pairs with 0.590844 m2 total projected overlap.
- Visible-instance oracle after rework: 44 visible assets; zero non-ground coplanar entity pairs. The remaining 22 pairs
  are intentional furniture/floor contacts.
- Starter archive: SHA-256 `3282ef303b6f675def463abe756da85464494c62bce94f2c7c500109580e52be`,
  13,594,289 bytes, 39/39 asset bytes unchanged. Relative to the prior acceptance archive, only
  `kitchen-cabinet`, `kitchen-cooktop`, `kitchen-dishwasher`, and `kitchen-faucet` changed.
- Existing local project: revision 1, 70 entities, all five corrected positions persisted and re-read after reload.
- Browser: four kitchen targets changed canvas hashes after real mouse drag; console errors 0, page errors 0, failed
  requests 0, diagnostics 0. Manual screenshot review found no remaining angle-dependent lines.
- Full repository: Prettier, ESLint, full typecheck, build, 126 test files / 819 tests, package clean consumers, docs,
  i18n, tracked assets, product design, and topology passed.
- Smart-home verification: 8 tests passed. Three owner-source tests fail closed on pre-existing external drift:
  `asset_registry.json` expected `d0561997...`, actual `9f65def8...`; `floorplan.json` expected `11acb6ad...`, actual
  `b5f8d69c...`. Frozen hashes were not updated.
