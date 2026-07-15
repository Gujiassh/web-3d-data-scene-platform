# Tasks: Single Studio Data Binding

> The main controller updates status after each verified slice. The fixed document/runtime, Studio UI and
> topology/QA/docs conversations remain responsible for implementation and rework in their own write sets.

## Phase 1: Setup And Contract Freeze

- [x] T001 Write the feature requirement and quality checklist in `specs/005-single-studio-data-binding/spec.md` and `checklists/requirements.md`
- [x] T002 Write architecture, research, data ownership, contract impact and acceptance flow in `specs/005-single-studio-data-binding/plan.md`, `research.md`, `data-model.md`, `contracts/README.md` and `quickstart.md`
- [x] T003 Run fixed-lane audits for document/runtime, Studio UI and topology/QA/docs and record their semantic oracles in `specs/005-single-studio-data-binding/plan.md` and `tasks.md`
- [x] T004 Obtain explicit approval for the additive public authoring Viewer/React API described in `specs/005-single-studio-data-binding/contracts/README.md`

## Phase 2: Foundational Boundaries

- [x] T005 [P] Add atomic target/source/binding-rule-set/remove-source/remove-binding command variants and command/history tests in `packages/document/src/commands/`
- [x] T006 [P] Validate canonical RFC 6901 pointer syntax for newly configured bindings in `packages/document/src/commands/` without changing legacy SceneDocument load semantics
- [x] T007 [P] Implement strict selected-entity to root-target resolution and deterministic Mock scenario/field helpers with unit tests in `apps/studio/src/data-binding/`
- [x] T008 [P] Implement Studio-local transient preview reducer/types and lifecycle tests in `apps/studio/src/data-binding/`
- [x] T009 Update current single-Studio product scope and milestone ownership in `docs/ssot/`, `specs/001-product-foundation/` and `README.md`

## Phase 3: User Story 1 - Use One Coherent Product

**Independent test**: One `pnpm dev` command serves Studio on strict port 4173; Edit and Run use the same
project/scene/selection and no second user-facing application is needed.

- [x] T010 [P] [US1] Move the unchanged fixed M0 asset to `tests/fixtures/m0-factory/` and update non-product fixture references without changing its GLB hash
- [x] T011 [P] [US1] Add a topology verifier that rejects active Factory package/port/server references in `scripts/` and root `package.json`
- [x] T012 [US1] Migrate Factory runtime, theme and i18n browser evidence into Studio Run tests in `tests/e2e/`
- [x] T013 [US1] Remove `apps/factory-demo`, Factory-only shared code/dependencies, port 4174 and the second Playwright server from `apps/`, `apps/shared/`, `package.json`, `playwright.config.ts` and `pnpm-lock.yaml`

## Phase 4: User Story 2 - Map A Scene Object To Business Data

**Independent test**: Select one imported asset root, save a business ID, create a Mock source, select a
sample path and save a binding; Undo/Redo, reload and JSON/ZIP round trips preserve every ID and meaning.

- [x] T014 [P] [US2] Add target business-ID and Mock-source form models, validation and command builders with tests in `apps/studio/src/data-binding/`
- [x] T015 [P] [US2] Build deterministic sample-field browsing and binding form controls in `apps/studio/src/data-binding/` and thin feature components under `apps/studio/src/features/`
- [x] T016 [P] [US2] Add Chinese/English mapping, validation, status and accessibility catalog entries/tests in `apps/studio/src/i18n/catalog.ts` and catalog tests
- [x] T017 [US2] Integrate the selected target and data configuration panel through thin workspace/app orchestration in `apps/studio/src/workspace/` and `apps/studio/src/App.tsx`
- [x] T018 [US2] Prove command/history, autosave/reload and JSON/ZIP ID/meaning invariants in `packages/document/`, `apps/studio/src/project/` and `tests/e2e/`

## Phase 5: User Story 3 - Configure Visual State Rules

**Independent test**: Configure three ordered equality rows with colors and one optional alarm; each valid
submission is one revision and invalid/unsupported content creates no partial mutation or semantic loss.

- [x] T019 [P] [US3] Add equality-rule form conversion, JSON primitive parsing, writes derivation and unsupported-content detection tests in `apps/studio/src/data-binding/`
- [x] T020 [P] [US3] Build compact rule rows with color swatches, alarm controls, reorder/remove actions and bilingual validation in `apps/studio/src/data-binding/`
- [x] T021 [US3] Submit Binding and RuleSet atomically through the document command boundary and handle no-op/conflict states in `apps/studio/src/workspace/` and `apps/studio/src/data-binding/`
- [x] T022 [US3] Add deterministic priority, duplicate alarm suppression, writer-conflict and unsupported-content preservation tests in `packages/document/`, `packages/runtime/` and `apps/studio/src/data-binding/`

## Phase 6: User Story 4 - Preview Live Behavior In Studio

**Independent test**: Enter Run and observe connection, current binding value, color and alarm in Studio;
return to Edit and confirm the same Viewer/selection plus restored material and cleared transient state.

- [x] T023 [US4] Add approved authoring data-runtime enablement, binding state events/snapshots and baseline effect restoration in `packages/runtime/src/` with focused lifecycle tests
- [x] T024 [US4] Expose the approved additive runtime contract through `packages/react/src/AuthoringScene.tsx` and public barrels with reconciliation/StrictMode tests
- [x] T025 [P] [US4] Create adapters from persisted supported Mock sources and reduce Viewer events into Studio preview state in `apps/studio/src/data-binding/`
- [x] T026 [P] [US4] Build Run connection/value/alarm/diagnostic surfaces and responsive styling in `apps/studio/src/data-binding/`, `apps/studio/src/features/` and `apps/studio/src/styles.css`
- [x] T027 [US4] Integrate Edit/Run lifecycle without Viewer, adapter, timer or selection recreation in `apps/studio/src/workspace/` and `apps/studio/src/App.tsx`
- [x] T028 [US4] Add real-WebGL E2E for runtime latency, state color, alarm, stale/offline recovery, context restoration, locale/theme continuity and cleanup in `tests/e2e/`

## Final Phase: Review, Acceptance And Delivery

- [x] T029 Write stable implementation facts and runtime evidence in `docs/ssot/single-studio-data-binding.md`, `docs/ssot/m2-verification.md` and `specs/005-single-studio-data-binding/acceptance.md`
- [x] T030 Run format, lint, typecheck, unit, build, i18n, design, topology, E2E, screenshots, Canvas pixel and diff checks from `specs/005-single-studio-data-binding/quickstart.md`
- [x] T031 Resume the existing contract and frontend reviewer conversations, classify every area pass/not-applicable/blocked, and return findings to the original implementation conversations for rework
- [x] T032 Re-run affected and full verification, close the workbench task, commit one coherent Chinese slice and push `main` to `origin`

## Dependencies

- T005-T008 establish authoring/runtime ownership before user-facing forms and Run integration.
- US2 depends on document commands and strict target/scenario helpers.
- US3 depends on US2 target/source/binding context and atomic Binding/RuleSet command semantics.
- US4 depends on configured data from US2-US3 and the approved additive runtime API.
- T012 must prove equivalent Studio runtime behavior before T013 deletes Factory Demo.
- Final acceptance depends on all four user stories and zero unresolved reviewer findings.

## Parallel Opportunities

- T005-T006, T007-T008 and T009 use disjoint document, Studio feature and documentation files.
- T010-T011 can proceed while Studio mapping forms are built; T013 waits for T012 evidence.
- T023-T024 are owned by the document/runtime lane; T025-T026 are owned by Studio UI after the public
  contract is available.
- SSoT/evidence work remains owned by the topology lane throughout implementation and review rework.

## Main-Controller Execution Strategy

1. Freeze contracts and land tested document/runtime foundations without touching persisted schemas.
2. Complete the authoring flow from selected root target through Mock source, field, binding and rules.
3. Enable Run observability and cleanup through the approved runtime API, then prove the full loop in
   Studio browser tests.
4. Only after replacement evidence is green, remove Factory Demo and enforce the single-server topology.
5. Resume existing independent reviewers, send findings back to the responsible fixed conversation, and
   accept only after full runtime and persistence evidence passes.
