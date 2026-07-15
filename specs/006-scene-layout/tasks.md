# Tasks: Scene Layout

> The main controller owns architecture arbitration, integration, task status and final delivery. The
> fixed document/runtime, Studio UI and topology/QA/docs conversations implement and rework only their
> assigned write sets.

## Fixed Lane Ownership

| Lane             | Exclusive ownership                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Document/runtime | `packages/document/**`, `packages/runtime/**`, `packages/react/**`                                                  |
| Studio UI        | `apps/studio/**` and shared presentation only when the main controller explicitly assigns it                        |
| Topology/QA/docs | `tests/e2e/**`, `tests/fixtures/006-layout/**`, `docs/ssot/**`, `specs/006-scene-layout/**`, verification documents |

Reviewers remain read-only. Every finding returns to the original responsible implementation
conversation for rework. No reviewer or other lane patches files in another lane's ownership.

## Phase 1: Specification And Contract Freeze

- [x] T001 Write feature requirements and the requirements-quality checklist in `specs/006-scene-layout/spec.md` and `specs/006-scene-layout/checklists/requirements.md`
- [x] T002 Write architecture, research, transient data ownership, approved API contract and acceptance workflow in `specs/006-scene-layout/plan.md`, `research.md`, `data-model.md`, `contracts/README.md` and `quickstart.md`
- [x] T003 Run the read-only product/spec/QA audit across the delivery plan, SceneDocument, document commands, runtime authoring, Studio selection, persistence and current E2E evidence
- [x] T004 Record explicit product approval for additive `selectEntities`, `setTransformSettings`, `getEntitySpatialSnapshots` and corresponding React props/handle methods in `specs/006-scene-layout/contracts/README.md`

## Phase 2: Foundational Boundaries

- [x] T005 [P] [Document/runtime] Add explicit layout patch, command and validation types plus exports in `packages/document/src/commands/layout-command.ts`, `packages/document/src/commands/types.ts` and `packages/document/src/index.ts`
- [x] T006 [P] [Studio UI] Add pure world/local transform planning, decompose/recompose epsilon and non-representable shear tests in focused modules under `apps/studio/src/layout/`
- [x] T007 [P] [Document/runtime] Implement revision-bound entity spatial snapshots with nullable world bounds, empty-Group matrix/pivot support and complete missing-entity/unloaded/disposed failure tests under `packages/runtime/src/authoring/`
- [x] T008 [P] [Document/runtime] Implement controlled stable multi-selection projection, explicit primary selection and combined selection overlay while preserving the existing Canvas primary/single-click event under `packages/runtime/src/authoring/` and `packages/runtime/src/viewer/`
- [x] T009 [Document/runtime] Expose only the approved additive handle methods and controlled selection/settings props through `packages/react/src/AuthoringScene.tsx`, public barrels and React lifecycle tests without a new public selection event/callback
- [x] T010 [P] [Studio UI] Add transient layout selection, selected-root normalization, same-parent capabilities and transform-settings helpers with tests under `apps/studio/src/layout/` and `apps/studio/src/session/`
- [x] T011 [P] [Topology/QA/docs] Add deterministic `tests/fixtures/006-layout/layout.scene.json`, `layout-oracles.json` and `README.md` reusing the accepted M0 GLB bytes/hash

## Phase 3: User Story 1 - Organize A Scene Hierarchy

**Independent test**: Select same-parent assets by stable ID, create one Group, explicitly reparent one
root into and out of it, and prove tree/Canvas selection plus world pose through Undo and Redo.

- [x] T012 [P] [US1] [Document/runtime] Implement atomic create-group and reparent command variants with one shared before-parent, one explicit unlocked Group/root destination, complete before snapshots, cycle/local-lock validation and command/history tests in `packages/document/src/commands/`
- [x] T013 [P] [US1] [Document/runtime + Studio UI] Add runtime Group bounds plus Studio world-pose reparent proposals, stale-revision rejection and representable/non-representable transform tests
- [x] T014 [US1] [Document/runtime] Reconcile Studio-owned controlled selection sets and primary IDs without Viewer recreation while preserving existing Canvas primary/single-click event semantics in runtime and `packages/react/src/AuthoringScene.test.ts`
- [x] T015 [P] [US1] [Studio UI] Upgrade `apps/studio/src/features/SceneTree.tsx` and session handling for stable Ctrl/Cmd multi-selection, primary state, nested hierarchy and explicit Group/root drop targets
- [x] T016 [US1] [Studio UI] Add Group and explicit reparent command builders, capability errors and workspace integration under `apps/studio/src/layout/`, `apps/studio/src/workspace/` and thin feature components
- [x] T017 [P] [US1] [Studio UI] Add English/Chinese hierarchy, lock, cycle, same-parent and shear copy plus accessible names/tests in `apps/studio/src/i18n/` and layout feature tests
- [x] T018 [US1] [Topology/QA/docs] Add focused real-WebGL hierarchy E2E covering tree/Canvas multi-selection, one-action revision, world-pose preservation, invalid reparent no-op and Undo/Redo in `tests/e2e/scene-layout.spec.ts`

## Phase 4: User Story 2 - Arrange Multiple Entities Deterministically

**Independent test**: Align and distribute three fixed same-parent entities and duplicate their layout;
every transform, ID, relative offset and revision matches the fixture oracle.

- [x] T019 [P] [US2] [Studio UI] Implement deterministic world-AABB min/center/max align and equal-clear-gap distribute planners with coordinate-plus-ID tie-break tests under `apps/studio/src/layout/`
- [x] T020 [P] [US2] [Document/runtime] Implement the atomic multi-entity layout command, validate all before snapshots prior to mutation and prove one revision/history entry and no-op redo preservation in `packages/document/src/commands/`
- [x] T021 [P] [US2] [Document/runtime] Implement atomic selected-root offset duplication with complete entity/target ID maps, unchanged parent IDs, allowed locked sources/inherited copy locks and existing business-ID/Binding/RuleSet/Annotation semantics in `packages/document/src/commands/`
- [x] T022 [P] [US2] [Studio UI] Build stable align/distribute/duplicate proposals from current spatial snapshots and explicit selected roots under `apps/studio/src/layout/` with stale/missing/direct-lock rejection and locked-source duplicate allowance tests
- [x] T023 [US2] [Studio UI] Add compact axis, align-anchor and distribute controls with valid capability states in layout feature components and `apps/studio/src/styles.css`
- [x] T024 [US2] [Studio UI] Integrate atomic offset duplicate, caller ID generation and post-commit selection of new roots through `apps/studio/src/workspace/` and `apps/studio/src/App.tsx`
- [x] T025 [US2] [Topology/QA/docs] Extend `tests/e2e/scene-layout.spec.ts` for align/distribute/duplicate exact oracle comparisons, ancestor-descendant root reduction, locked-source duplicate lock inheritance/unchanged parent and existing data-binding meaning preservation

## Phase 5: User Story 3 - Transform With Predictable Spatial Feedback

**Independent test**: Apply grid, angle and scale steps, preview pivot/axis/delta, and snap to an explicitly
targeted bounds anchor; committed transforms and tie-breaking match the fixed oracle.

- [x] T026 [P] [US3] [Document/runtime] Implement finite positive translation/rotation/scale setting validation and TransformControls reconciliation without duplicate controls/listeners under `packages/runtime/src/authoring/`
- [x] T027 [P] [US3] [Studio UI] Implement center/six-face bounds-anchor generation from explicit target spatial snapshots, world-distance plus stable-ID/anchor tie-break and nullable/unavailable-bounds tests under `apps/studio/src/layout/`
- [x] T028 [P] [US3] [Studio UI] Implement focused pivot, active-axis, delta and anchor feedback modules while keeping runtime overlays generic and layout policy outside `packages/runtime/src/viewer/three-scene-viewport.ts`
- [x] T029 [US3] [Document/runtime] Expose only translation/rotation/scale settings and nullable spatial snapshots through approved React props/handle methods with StrictMode, locale/theme rerender and existing-event compatibility tests in `packages/react/src/`
- [x] T030 [P] [US3] [Studio UI] Build compact grid/angle/scale controls, explicit bounds-anchor command controls and accessible pivot/spatial status in `apps/studio/src/layout/`, feature components, i18n catalogs and styles
- [x] T031 [US3] [Topology/QA/docs] Extend real-WebGL E2E for interactive grid/angle/scale snapping, explicit-target bounds-anchor command pixels, stable tie-break, nullable/unavailable bounds behavior and honest handler-to-DOM-to-next-RAF timing in `tests/e2e/scene-layout.spec.ts`

## Phase 6: User Story 4 - Preserve Layout Through The Existing Project Loop

**Independent test**: Complete the layout workflow, Undo/Redo all accepted actions, reload, round-trip JSON
and ZIP, inspect IndexedDB and prove canonical equality plus zero transient leakage.

- [x] T032 [P] [US4] [Document/runtime] Add full command/history regression coverage for monotonic execute/Undo/Redo revisions, atomic failures, validator compatibility and unchanged archive/document shapes under `packages/document/src/`
- [x] T033 [P] [US4] [Studio UI] Prove autosave/reload, project switch, Run-mode command disablement and locale/theme continuity for transient selection/settings in Studio project/session tests
- [x] T034 [US4] [Topology/QA/docs] Complete P0 browser evidence for canonical pre/post JSON, parsed ZIP, IndexedDB `documentJson`, exact ProjectRecord keys, fixture hash and forbidden transient-owner scans in `tests/e2e/scene-layout.spec.ts`

## Final Phase: Responsive Evidence, Review And Delivery

- [x] T035 [Topology/QA/docs] Capture 1440x900 English/light and 1280x720 Chinese/dark hierarchy/layout/snap screenshots plus overflow, overlap, Canvas identity, nonblank pixels and pixel-delta evidence in `tests/e2e/scene-layout.spec.ts`
- [x] T036 [Topology/QA/docs] Run coded-point/task extraction plus feature-owned format, lint, E2E typecheck, focused E2E, fixture hash and diff gates; record exact counts and artifacts for the main-controller full E2E/root-gate rerun in T038
- [x] T037 [Topology/QA/docs] Write stable implementation and verification SSoT, then resume independent contract/runtime/frontend/QA reviewers; classify every area and send each finding back to its original fixed implementation conversation for rework
- [x] T038 [Main controller] Integrate reviewed rework, rerun affected and full gates, mark acceptance/task status, close the workbench task, commit one coherent slice and push `main` to `origin`

## Dependencies

- T005-T011 freeze command, transient API, measurement and fixture boundaries before story implementation.
- US1 depends on T005-T010 and establishes hierarchy plus multi-selection for all later stories.
- US2 depends on accepted same-parent selected roots and current spatial snapshots from US1.
- US3 depends on runtime selection/spatial foundations but can build setting and anchor unit logic in
  parallel with late US2 UI work.
- US4 depends on all authored command variants and transient boundaries.
- T035-T037 require all focused story evidence; T038 requires zero unresolved review findings.

## Parallel Opportunities

- T005-T008, T010 and T011 use disjoint document/runtime, Studio and fixture write sets.
- Within US1, command/runtime work and tree/i18n work can proceed in parallel after API types stabilize.
- T019-T021, T022-T023 and T025 are owned by separate fixed lanes.
- T026-T028, T030 and test planning for T031 can proceed in parallel against the frozen contract.
- Topology/QA/docs may design E2E and payload oracles early but does not patch implementation files.

## Main-Controller Execution Strategy

1. Freeze API/types and land tested command/spatial foundations without persistence changes.
2. Accept Group/reparent plus tree/Canvas multi-selection as the first independent browser slice.
3. Add deterministic align/distribute/duplicate on that stable hierarchy boundary.
4. Add snap/feedback through focused runtime modules, preserving Viewer lifecycle and package boundaries.
5. Collect P0 persistence and responsive Canvas evidence before review.
6. Resume the original reviewers and return findings to the original implementation conversations.
7. Accept and deliver only after full gates and zero unresolved findings.
