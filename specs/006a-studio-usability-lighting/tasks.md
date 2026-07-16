# Tasks: Studio Usability And Scene Lighting

## Phase 1: Approved Contract And Planning

- [x] T001 Record 1.2 lighting and real migration approval in `specs/006a-studio-usability-lighting/spec.md`
- [x] T002 [P] Define architecture, data model and internal contracts in `specs/006a-studio-usability-lighting/`
- [x] T003 [P] Update delivery order in `specs/001-product-foundation/delivery-plan.md`

## Phase 2: 006A.1 Foundations

- [x] T004 Add shared finite/normalized/positive/no-op transform invariants and unit tests in `packages/document/src/commands/`
- [x] T005 Create canonical command registry and exact shortcut resolver tests in `apps/studio/src/session/`
- [x] T006 Extract modal/active-drag shortcut orchestration from `apps/studio/src/App.tsx`

## Phase 3: User Story 1 - Discover Commands

**Independent test**: Tooltips and searchable bilingual Help expose the same executable command registry;
modal, input, drag and Run gates have no accidental mutation.

- [x] T007 [P] [US1] Add bilingual command labels/categories/descriptions in `apps/studio/src/i18n/`
- [x] T008 [P] [US1] Build accessible searchable Help dialog in `apps/studio/src/help/`
- [x] T009 [US1] Bind toolbar tooltips and Help trigger to canonical commands in `apps/studio/src/features/StudioToolbar.tsx`
- [x] T010 [US1] Add shortcut/help unit and Playwright evidence in `apps/studio/src/session/` and `tests/e2e/`

## Phase 4: User Story 2 - Exact Rotation And Reset

**Independent test**: Single/multi local degree edits and component/all resets are atomic, no-op when
unchanged, reject invalid/stale/effectively-hidden selections and Undo exactly.

- [x] T011 [P] [US2] Implement intrinsic XYZ/quaternion projection and tests in `apps/studio/src/transform/`
- [x] T012 [P] [US2] Implement reset planners/capabilities and tests in `apps/studio/src/transform/`
- [x] T013 [US2] Extract transform editor UI from `apps/studio/src/features/EntityInspector.tsx` into `apps/studio/src/transform/`
- [x] T014 [US2] Integrate single/multi reset commands and authoritative invalid-draft recovery in `apps/studio/src/layout/` and `apps/studio/src/App.tsx`
- [x] T015 [US2] Add transform/reset Playwright and persistence evidence in `tests/e2e/studio-usability.spec.ts`
- [x] T016 [US2] Complete 006A.1 independent review, original-worker rework and checkpoint in `specs/006a-studio-usability-lighting/tasks.md`

### 006A.1 implementation and review checkpoint

- Command boundary: shared finite/normalized/positive validation, full `before` checks, exact no-op identity and
  redo preservation are implemented. Single invalid/stale and batch second-item invalid/stale tests prove no
  document/history mutation; batch Undo/Redo proves exact state apart from monotonic revision.
- Shortcut boundary: one canonical registry drives executable chords, platform display, toolbar labels and Help.
  Exact modifiers plus modal, editable target, active drag and Run gates are covered without adding an event variant.
- Transform draft: intrinsic XYZ degrees are derived from authoritative quaternion TRS. A row-level authoritative
  display equality gate prevents untouched or restored high-precision drafts from dispatching; invalid drafts remain
  visible, while valid rejected/stale actions restore authority.
- Runtime boundary: gizmo attachment uses effective hierarchy visibility but local-only lock. Entering Run uses the
  existing `setTool("select")` boundary synchronously before mode state, detaching controls and reverting active drag
  without Canvas/Viewer recreation or a new authoring-enabled API.
- Test/a11y discipline: complete typed React/layout mocks prevent fixture drift; disabled reasons augment rather than
  replace command accessible names; browser selectors use exact canonical names and Enter for explicit row commit.
- Review adjudication: rejected immediate invalid-draft rebound and the broad claim that Run permanently retains the
  gizmo; accepted and closed the narrower effect timing window, high-precision false commit, hidden-ancestor gizmo,
  and missing atomic history evidence findings.
- Evidence: focused unit 17 files / 106 tests; final unit 76 files / 373 tests; root/workspace TypeScript,
  ESLint, production build, i18n, design, topology, Prettier and diff checks passed; dedicated 006A.1
  Playwright 2/2, related M1/scene-layout Playwright 3/3 and full Playwright 21/21 passed.
- Independent closure: original findings for Run transition, high-precision blur, hidden-ancestor transform
  attachment and transform history evidence are closed. Immediate invalid-draft rebound was rejected against
  the approved visible-error contract. Final independent re-review returned PASS with no blocking findings.
- Evolution rule: 006A.2 must use a dedicated Runtime `smart-align` module and an independent Studio smart-align hook.
  Do not add candidate planning, preferences or guide lifecycle to the 654-line `useStudioSceneLayout` hook.

## Phase 5: User Story 3 - Smart Alignment Guides

**Independent test**: Fixed X/Y/Z/plane drags choose the specified per-axis oracle, render matching guides,
commit once, bypass with Alt and retain only the local preference.

- [x] T017 [P] [US3] Implement pure candidate/reference/threshold oracle and benchmark in `packages/runtime/src/authoring/smart-align/`
- [x] T018 [P] [US3] Implement disposable guide overlay and tests in `packages/runtime/src/authoring/smart-align/`
- [x] T019 [US3] Add TransformControls active-axis/modifier preview integration in `packages/runtime/src/authoring/transform-authoring-controller.ts`
- [x] T020 [US3] Add stable Runtime/React Smart Align controlled API in `packages/runtime/src/` and `packages/react/src/`
- [x] T021 [P] [US3] Add versioned local preference and toolbar switch in `apps/studio/src/smart-align/`
- [x] T022 [US3] Integrate revision-bound reference/selection/load cleanup in `packages/runtime/src/` and preference orchestration in `apps/studio/src/App.tsx`
- [x] T023 [US3] Add 500-entity benchmark and real-WebGL guide/drag/payload evidence in `tests/e2e/studio-usability.spec.ts`
- [x] T024 [US3] Complete 006A.2 independent review, original-worker rework and checkpoint in `specs/006a-studio-usability-lighting/tasks.md`

### 006A.2 implementation checkpoint

- Planner: frozen revision-bound snapshots feed per-axis sorted indexes and binary range lookup. The exact
  lexicographic candidate tuple, entity-before-origin tie, selected hierarchy exclusions, locked/hidden/null-bounds
  rules and 8 CSS-pixel camera threshold are covered by pure tests.
- Transform semantics: raw world preview is evaluated once; Smart Align wins per active axis, otherwise fixed
  Position step matches Three.js r185 world rounding. Rotated/scaled parents convert snapped world coordinates back
  to local. Preview and final commit share the same transform and one drag emits at most one commit.
- Lifecycle: guides and frozen references clear on release, cancel, any selection collection change, tool/mode
  transition, superseded load and dispose. Guide clear disposes geometry. Physical Alt state survives consecutive
  drags while held and bypasses both smart and fixed snap without changing the preference.
- Studio/API: Runtime owns planning and guides; React forwards one controlled boolean; Studio owns versioned
  `web3d.studio.smart-align.v1`, exact `S`, Magnet pressed state and bilingual Help. Run disables interaction without
  resetting preference. No Smart Align responsibility entered `useStudioSceneLayout` or persisted document state.
- Performance: 500 entities / 1,497 anchors per axis / 200 warm / 1,000 measured runs produced median 0.694ms,
  p95 1.249ms and max 3.415ms on 2026-07-16, passing the p95 <= 4ms gate.
- Browser evidence: actual Chromium/WebGL X/Y/Z axis and XY plane TransformControls drags commit
  `[-0.17,0,2.25]`, `[-0.75,0.45,2.25]`, `[-0.75,0,2.21875]` and `[-0.17,0.45,2.25]`; inactive axes remain exact
  and matching guide pixels clear on release. Undo/Redo works, Alt commits unsnapped x=-0.27214460920524886,
  Canvas identity survives controlled changes, preference survives reload, and JSON/ZIP/IndexedDB scans contain
  no Smart Align transient state.
- Gate discipline: typecheck/build invoke document validator generation and must finish before Vite/Playwright.
  A parallel review typecheck caused transient HMR default-export failures and three unrelated browser failures;
  after one sequential validator generation, all three failed flows passed 3/3. Final full Playwright evidence is
  recorded only from the non-concurrent run.
- Final gates: 79 files / 411 unit tests, root/workspace TypeScript, ESLint, production build, i18n, product design,
  single-Studio topology, Prettier and diff checks passed; final sequential Chromium/WebGL passed 23/23.
- Independent closure: initial review findings for exhaustive relation order, actual X/Y/Z/plane WebGL evidence and
  the stale T022 ownership label were accepted. The original Runtime worker added 9 rank mappings, 8 adjacent
  equal-delta competitions and actual X/Y/Z/XY pointer flows with guide/inactive-axis evidence; T022 now names the
  Runtime/App owners. Independent static re-review returned PASS with no remaining finding.

## Phase 6: User Story 4 - Scene Appearance And 1.2 Migration

**Independent test**: Valid 1.0/1.1 projects migrate and render the current baseline; mixed invalid records
roll back; appearance preview/apply/cancel/undo round-trips as current 1.2 without Viewer recreation.

- [ ] T025 [P] [US4] Freeze 1.1 schema/validator and add 1.2 lighting schema/types in `specs/001-product-foundation/contracts/` and `packages/document/src/`
- [ ] T026 [US4] Implement chained semantic-first migration and current validation tests in `packages/document/src/`
- [ ] T027 [US4] Implement atomic scene-environment command and tests in `packages/document/src/commands/`
- [ ] T028 [US4] Implement all-record IndexedDB rewrite/rollback and archive current-only tests in `apps/studio/src/project/` and `apps/shared/src/`
- [ ] T029 [P] [US4] Extract in-place lighting controller and tests in `packages/runtime/src/viewer/scene-lighting-controller.ts`
- [ ] T030 [US4] Reconcile authored/preview lighting through stable Runtime/React APIs in `packages/runtime/src/` and `packages/react/src/`
- [ ] T031 [P] [US4] Detect/exclude imported punctual lights and test diagnostics in `packages/runtime/src/assets/` and import inspection modules
- [ ] T032 [US4] Build flat Appearance/Lighting settings tabs and presets in `apps/studio/src/scene-settings/`
- [ ] T033 [US4] Integrate one apply/cancel/preview command lifecycle in `apps/studio/src/App.tsx`
- [ ] T034 [US4] Add migration, JSON/ZIP/IndexedDB, first-frame and real-WebGL appearance evidence in `tests/e2e/scene-appearance.spec.ts`
- [ ] T035 [US4] Complete 006A.3 Critical reviews, original-worker rework and checkpoint in `specs/006a-studio-usability-lighting/tasks.md`

## Phase 7: Full Acceptance

- [ ] T036 Update `docs/ssot/` and all 006A acceptance/task evidence
- [ ] T037 Run unit, typecheck, lint, build, i18n, design, topology, format and full Playwright gates
- [ ] T038 Run reverse Critical review for migration/save/runtime lifecycle and close all findings
- [ ] T039 Commit the accepted feature with a coherent Chinese commit and push `main`

## Dependencies

`T001-T003 -> T004-T006 -> US1/US2 -> T016 -> US3 -> T024 -> US4 -> T035 -> T036-T039`.

US1 and US2 have disjoint implementation modules after T004-T006 and may proceed in parallel, but both are
required for 006A.1 acceptance. 006A.2 depends on stable transform drag/reset semantics. 006A.3 may prepare
contract tests after approval but does not integrate until 006A.2 is accepted so lifecycle evidence remains
attributable.

## Implementation Strategy

Ship in ordered coherent slices, not one unreviewable change. Keep every slice usable: 006A.1 already
improves daily editing, 006A.2 adds direct manipulation, and 006A.3 adds durable appearance. Do not defer
contract migration, payload evidence or lifecycle checks to a frontend-only cleanup pass.
