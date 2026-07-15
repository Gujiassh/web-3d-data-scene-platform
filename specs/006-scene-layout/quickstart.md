# Quickstart: Scene Layout Acceptance

## Development Topology

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`. Feature 006 remains inside the single Studio and introduces no second app,
server, route or persistence service.

## Planning Checks

```bash
/home/cc/.skill/speckit/scripts/bash/check-prerequisites.sh \
  --json --require-tasks --include-tasks --feature 006
/home/cc/.skill/speckit/scripts/bash/extract-coded-points.sh --json --feature 006
/home/cc/.skill/speckit/scripts/bash/extract-tasks.sh --json --feature 006
pnpm exec prettier --check specs/006-scene-layout
git diff --check -- specs/006-scene-layout
```

Expected planning inventory: 18 FR, 6 NFR, 6 SC, zero duplicate definitions, zero orphan references and
30-40 unique Task IDs.

## Implementation Gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:i18n
npm_config_offline=true pnpm verify:design
pnpm verify:topology
pnpm exec playwright test tests/e2e/scene-layout.spec.ts
pnpm test:e2e
git diff --check
```

The main controller records exact final file/test counts and browser duration after all three fixed lanes
integrate. A warning or skipped browser oracle is not reported as acceptance.

## Fixed Fixture

Create `tests/fixtures/006-layout/` with source and oracle files only:

```text
tests/fixtures/006-layout/
├── README.md
├── layout.scene.json
└── layout-oracles.json
```

Reuse `tests/fixtures/m0-factory/public/m0-factory-cell.glb`. Do not duplicate or regenerate its accepted
1216-byte payload or SHA-256. Generate the browser import archive through the public archive codec with a
fixed timestamp.

The source scene contains four stable asset entities, one empty Group, asymmetric representable transforms
and one existing feature-005 target/source/binding/rule path. Oracle data records expected selected roots,
parent IDs, local transforms, world matrices/bounds and revision deltas. Separate unit fixtures cover
cycles, locked entities, stale snapshots, non-positive scale and non-representable shear.

## Hierarchy Workflow

1. Import the fixed archive and wait for a nonblank Canvas.
2. Ctrl/Cmd-select two same-parent entities in the tree and extend the same selection from Canvas.
3. Confirm the tree and Canvas expose the same stable ID set and explicit primary.
4. Create a Group. Assert revision increases once, one history entry exists and child world matrices stay
   within the fixed epsilon.
5. Request a snapshot for the empty Group and assert it has world matrix/pivot with `worldBounds: null`.
   Explicitly reparent a third entity to that Group and back to scene root; null bounds do not disable
   reparent. Assert each action adds one revision/history entry and no visible pose jump.
6. Attempt reparent to self, descendant, asset, missing and locked destination Group. Assert every source
   patch has one shared before-parent and one explicit destination. Compare document, history, revision and
   IndexedDB before/after; all invalid requests remain unchanged.
7. Exercise a synthetic rotated non-uniform-parent case and require the stable shear diagnostic with no
   approximate transform.

## Layout Workflow

1. Select three same-parent visible unlocked roots and set the primary explicitly.
2. Align minimum, center and maximum bounds on selected world axes; compare each result with the oracle.
3. Distribute on X and Z. Confirm outer entities stay fixed and clear gaps are equal in center-and-ID order.
4. Include the empty Group in a bounds-dependent selection and confirm align/distribute/Group-pivot actions
   are disabled by its null bounds without treating the spatial snapshot itself as missing.
5. Include an ancestor and descendant in transient selection. Confirm only the selected root is patched.
6. Duplicate the selected layout with an explicit offset and complete caller-provided entity/target ID maps.
7. Include one locked source in duplicate-layout. Confirm the source stays unchanged, its copy inherits
   `locked`, duplicated roots keep their source parent IDs while only root positions receive the offset,
   descendants preserve local transforms, target business IDs are absent and Binding/RuleSet/Annotation
   arrays are unchanged.
8. Confirm unchanged or stale layout proposals create no revision/history/save mutation.

## Interactive Snap And Feedback

1. Enable a 0.5-unit translation grid and commit one axis-constrained drag.
2. Enable a 15-degree rotation step and commit one rotation.
3. Enable a positive scale step and commit one scale; reject zero or negative scale results.
4. Attempt move/align/distribute/snap/scale against a locked entity and confirm each direct edit is rejected;
   this does not change the allowed locked-source duplicate result.
5. At each preview, assert the accessible spatial status reports pivot kind/world coordinates, active axis,
   delta and enabled settings.
6. Explicitly select a bounds-anchor source and target, request current spatial snapshots and invoke the
   bounds-anchor action. Assert no bounds-anchor field was added to runtime transform settings.
7. Assert the highlighted source/target keys are stable `{entityId, anchorKind}` values and one ordinary
   transform command matches the oracle.
8. Repeat equal-distance candidate selection with reversed document/selection order; stable entity ID and
   fixed anchor-kind order produce the same result.
9. Use a null required bound and then unload referenced asset geometry. Null bounds disable only the
   bounds-dependent action; unloaded geometry fails the complete snapshot request. Neither case commits a
   first-available fallback.

## History And Reload

1. Capture the canonical document before every accepted hierarchy/layout/snap command.
2. Assert each user-visible action changes revision exactly once and appends one history entry.
3. Undo every action in reverse order; each Undo adds one monotonic revision and restores the exact prior
   content except revision.
4. Redo every action; each Redo adds one monotonic revision and restores the accepted final content.
5. Wait for autosave, reload Studio and compare IDs, parents, transforms, targets and existing binding
   meaning with the accepted canonical document.
6. Switch Edit/Run and trigger layout shortcuts in Run. Controls remain disabled and revision/document are
   unchanged.

## P0 Persistence Evidence

1. Export accepted canonical JSON and ZIP; parse both with public codecs.
2. Reimport JSON and ZIP into separate projects and deep-compare their documents with the accepted
   canonical content.
3. Read the active IndexedDB `projects` record and parse `documentJson` using the existing E2E repository
   helper structure.
4. Assert the persisted record keys are exactly `id`, `name`, `createdAt`, `updatedAt`, `lastOpenedAt`,
   `lastSavedRevision`, `lastExportedRevision` and `documentJson`.
5. Recursively reject selection, primary, transform settings, snap, anchor, pivot, bounds, hover, preview,
   world matrix, Object3D and layout diagnostic owner fields.
6. Machine-compare archive assets with the fixture byte length and accepted SHA-256.
7. Run source diff checks for SceneDocument schema/types, archive contracts and project record/store shape;
   zero feature-owned shape change is required.

## Responsive And Canvas Evidence

Use two focused combinations rather than an unnecessary full matrix:

- 1440x900, English, light theme;
- 1280x720, Simplified Chinese, dark theme.

At both sizes:

1. Assert no horizontal/vertical page overflow, clipped Group/reparent/layout/snap command or incoherent
   tree/toolbar/Inspector/Canvas overlap.
2. Assert selected tree rows, primary status, layout controls and spatial feedback are visible and readable.
3. Preserve the same Canvas DOM identity across selection, settings, locale and theme changes.
4. Require `opaqueRatio > 0.99`, more than eight distinct sampled colors and nonzero authored geometry.
5. Compare pre-layout/final/Undo Canvas samples with a fixed pixel-delta oracle; DOM transform assertions
   remain the semantic authority.
6. Sample axis/gizmo and bounds-anchor overlay colors independently from document/revision timing.
7. Record zero `pageerror` and zero unexpected `console.error`.

Suggested screenshots:

```text
artifacts/e2e/006-hierarchy-1440x900.png
artifacts/e2e/006-align-distribute-1440x900.png
artifacts/e2e/006-snap-1280x720.png
artifacts/e2e/006-round-trip-1440x900.png
```

## Timing Evidence

Instrument the accepted action handler timestamp, observe the new revision and critical spatial-feedback
DOM, then wait for the next `requestAnimationFrame`. Require the complete handler-to-DOM-to-next-RAF
interval to be at most 100 ms in the fixed fixture.

Canvas pixels are sampled after that timing assertion as separate visual evidence. Do not claim that pixel
readback or pointer scheduling is inside the same 100 ms boundary.

## Review And Delivery

1. Resume the original document/runtime, Studio frontend and topology/QA/docs review conversations.
2. Classify goal alignment, transform correctness, package boundaries, save contracts, accessibility,
   responsive layout, runtime lifecycle and test honesty as pass/not-applicable/blocked.
3. Return every finding to the original fixed implementation conversation for rework.
4. Rerun focused affected checks before the main controller runs the complete gate set.
5. Write stable SSoT and acceptance evidence only after zero unresolved findings remain.
