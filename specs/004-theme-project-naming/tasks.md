# Tasks: Theme And Scene Naming

## Phase 1: Setup

- [x] T001 Write requirements and quality checklist in `specs/004-theme-project-naming/spec.md` and `checklists/requirements.md`
- [x] T002 Write architecture decisions and verification plan in `specs/004-theme-project-naming/plan.md` and `research.md`
- [x] T003 Write data boundaries and acceptance flow in `specs/004-theme-project-naming/data-model.md` and `quickstart.md`

## Phase 2: Foundational

- [x] T004 [P] Implement shared theme resolution, persistence and provider utilities in `apps/shared/theme.ts` and `ThemeProvider.tsx`
- [x] T005 [P] Implement the accessible icon theme control and semantic light/dark tokens in `apps/shared/ThemeSwitch.tsx` and `theme.css`
- [x] T006 [P] Add `rename-document` execution/history coverage in `packages/document/src/commands/`
- [x] T007 Enforce the document-name/project-name invariant in `apps/studio/src/project/` and workspace history transitions

## Phase 3: User Story 1 - Name A Scene Before Creation

**Independent test**: Cancel/invalid attempts preserve the current project; one valid confirmation creates
exactly one trimmed named scene.

- [x] T008 [P] [US1] Add bilingual create/rename dialog catalog entries in `apps/studio/src/i18n/catalog.ts`
- [x] T009 [US1] Build the focused reusable naming dialog in `apps/studio/src/features/SceneNameDialog.tsx`
- [x] T010 [US1] Change Studio new-scene orchestration to require a submitted name in `apps/studio/src/App.tsx`, `ProjectMenu.tsx` and `useStudioWorkspace.ts`
- [x] T011 [US1] Add dialog and create/cancel tests in `apps/studio/src/` and `tests/e2e/`

## Phase 4: User Story 2 - Rename The Current Scene

**Independent test**: Rename, Undo, Redo, autosave, reload and export preserve one consistent name.

- [x] T012 [US2] Wire the Edit-mode Rename scene action through the naming dialog and document command in `apps/studio/src/`
- [x] T013 [US2] Add repository/history/name-consistency unit and E2E coverage in `apps/studio/src/project/`, `packages/document/src/commands/` and `tests/e2e/`

## Phase 5: User Story 3 - Choose A Comfortable Interface Theme

**Independent test**: Both apps detect, toggle and restore independent preferences without replacing the
Viewer canvas or changing business state.

- [x] T014 [P] [US3] Add bilingual theme labels and mount shared theme controls in `apps/studio/src/` and `apps/factory-demo/src/`
- [x] T015 [US3] Replace app-local light-only literals with semantic theme tokens in both application stylesheets
- [x] T016 [US3] Add theme utility, accessibility, persistence, continuity and layout tests in `apps/shared/` and `tests/e2e/`

## Final Phase: Polish And Cross-Cutting Concerns

- [x] T017 Write architecture facts and verification evidence in `docs/ssot/theme-and-scene-naming.md` and `specs/004-theme-project-naming/acceptance.md`
- [x] T018 Run format, lint, typecheck, unit, build, i18n, design, E2E, dual-theme screenshot and diff checks
- [x] T019 Perform independent contract and frontend review, resolve findings and close the workbench task

## Dependencies

- T004-T007 establish theme and naming contracts before user-facing integration.
- US1 depends on the naming dialog and workspace create signature.
- US2 depends on the document rename command and name synchronization invariant.
- US3 depends only on the shared theme foundation and can proceed in parallel with Studio naming UI.
- Final acceptance depends on all user stories and their evidence.

## Parallel Opportunities

- T004/T005, T006 and T008 use disjoint shared, document and Studio catalog files.
- Document command work can proceed independently from theme provider/control work.
- Theme app integration can proceed after shared exports while naming interaction is implemented.

## Implementation Strategy

1. Land the document and shared theme foundations with unit tests.
2. Complete explicit named creation, then add rename through the same dialog.
3. Integrate themes into both apps and remove light-only literals.
4. Prove persistence/data isolation and Viewer continuity in E2E before acceptance.
