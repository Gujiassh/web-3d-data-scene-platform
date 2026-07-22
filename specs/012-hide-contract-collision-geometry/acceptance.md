# Acceptance: Hide Contract Collision Geometry

## Status

In progress.

## Semantic Oracle

A formally contracted collision subtree no longer contributes render fragments, so it cannot z-fight with visible
geometry. The same collision objects remain at the same hierarchy positions and formal node indexes and can still be
raycast. Assets that do not prove the complete unique structure retain their authored visibility.

## Delivery Lineage

- Source and repair branch: `main`.
- Starting ref: `origin/main@629bdb0b84adf5dc17a93c4b00c83f28e7f34db2`.
- Symptom: rotating the smart-home camera produced dense moving black diagonal lines on furniture and appliances.
- Root cause: contract collision proxies were rendered together with coplanar or near-coplanar visual triangles,
  causing depth-buffer z-fighting.
- Changed scope: runtime glTF post-load visibility, collision-root runtime target evidence, visibility-effect projection,
  focused loader/runtime coverage, release changelog/docs audit, and Feature 012 SSoT.
- Frozen scope: SceneDocument/schema/save/archive contracts, asset bytes/hashes, formal target indexes, transforms,
  animations, hierarchy, and raycast/picking availability.
- Delivery target: `origin/main`; no downstream merge or cherry-pick is required.

## Baseline Evidence

- The owner asset standard requires one `COLLISION` root, hidden by the frontend and retained for collision/picking.
- The smart-home input contains 38 assets with collision nodes and 214 collision nodes in total.
- Direct geometry audit found 1,139 exact duplicate triangles across 20 assets, including collision/visual overlaps.
- Before-fix browser evidence is stored locally at
  `/home/cc/.local/state/playwright-system/artifacts/sceneweave-zfight-loaded-before.png`.

## Verification

### Implemented locally

- The loader recognizes only unique formal `ROOT`, `VISUAL`, and `COLLISION` nodes sharing one root subtree, then sets
  the exact collision root to `visible = false` after formal mappings are collected. Visual and collision roots must be
  disjoint so malformed nesting fails closed.
- Direct and nested contracts pass; incomplete, cross-root, duplicate, and either-direction nested visual/collision
  shapes remain visible.
- Focused loader coverage passes 16/16 tests and proves visual visibility, unchanged collision hierarchy and formal
  mappings, successful Three.js raycasting through the invisible collision root, and null collision evidence for
  malformed structures.
- Runtime generation carries only the exact recognized collision root into transient target state. Focused loader,
  generation, and data-runtime coverage passes 27/27 tests and proves that a `visibility: true` rule and effect reset
  cannot re-enable that root while ordinary runtime targets remain controllable.
- A direct structural audit recognized all 54 current owner LOD0 assets, including the nested robot-vacuum contract.
- The final post-review baseline passed `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
  at 125 files / 803 tests.
- `pnpm verify:docs`, `pnpm verify:i18n`, `pnpm verify:assets`, `pnpm verify:design`, `pnpm verify:topology`, and
  `pnpm verify:packages` passed.
- `pnpm verify:smart-home` retained 6 passing tests and failed 3 owner-source integration tests before generation because
  the external `floorplan.json` and `asset_registry.json` hashes differ from the repository's frozen snapshot. This
  task does not update or accept mutable owner bytes.
- The existing IndexedDB project reloaded as `90 m2 Smart Home`, revision 1, on the same asset/document state. A same-
  view screenshot removed the dense black diagonal interference from furniture and appliances; the canvas crop's
  below-12%-luma pixel fraction dropped from 0.0918455 to 0.0139006.
- A real canvas drag changed the camera view and produced a nonblank `840x912` canvas with no black-line recurrence,
  `console.error`, page exception, or failed request.
- Runtime screenshots are stored locally at
  `/home/cc/.local/state/playwright-system/artifacts/sceneweave-zfight-loaded-after.png` and
  `/home/cc/.local/state/playwright-system/artifacts/sceneweave-zfight-rotated-after.png`.
- After the P1 visibility-lock rework, the existing project reloaded again with the same title/revision, a nonblank
  `840x912` canvas, no page error text, and no black-line recurrence. Final screenshot:
  `/home/cc/.local/state/playwright-system/artifacts/sceneweave-zfight-final-after-p1.png`.
- An additional narrow-viewport run did not produce evidence because the system Chromium process exited before page
  evaluation. No responsive UI changed in this task; desktop same-view and rotated-canvas evidence covers the reported
  rendering path.

## Reverse Review

- **Goal alignment: pass.** The fix removes the confirmed collision/visual z-fighting source instead of masking it with
  camera or renderer precision settings.
- **User-visible flow: pass.** Existing local projects receive the fix on reload without import or migration.
- **Architecture and boundaries: pass.** Recognition remains in glTF asset loading; transient evidence flows through
  runtime generation to effect projection without entering document, persistence, authoring, or renderer configuration
  layers.
- **Data and save contracts: pass.** No schema, payload, hash, asset, node-index, archive, or package contract changes.
- **Picking and runtime behavior: pass.** Three.js `Raycaster` source and a real geometry test confirm invisible objects
  remain raycastable; formal node and object maps retain the same objects.
- **Malformed assets: pass after rework.** Review added a disjoint-branch requirement so a visual subtree nested under
  collision cannot be hidden accidentally.
- **Visibility effects: pass after P1 rework.** Independent review proved that a valid `SceneTarget` could point at the
  collision root and an earlier `visibility: true` effect could re-enable rendering. Runtime target state now locks only
  the recognized collision root hidden and tests both apply and reset paths.
- **Evolution: pass.** The strict unique formal structure avoids generic name heuristics and supports shared state/motion
  ancestors such as the robot vacuum.
- **Independent review: pass after rework.** The reviewer confirmed the visibility-effect finding was closed and reported
  no other defect. Residual gaps are automated production-picking and real-renderer regression coverage; direct
  Raycaster geometry, real smart-home browser screenshots, and a real camera drag provide the current evidence.

### Pending

- Commit, push, final CI, SHA parity, and task closeout.
