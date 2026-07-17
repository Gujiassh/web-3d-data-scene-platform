# Tasks: Light Entity Authoring

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md),
[contracts/scene-document-1.3.md](contracts/scene-document-1.3.md)
**Status**: T001-T034 implemented and accepted

## Phase 1: Findings, Design-Time Calibration And Complete Approval

- [x] T001 Run independent Critical review across units, migration, commands, hierarchy, Runtime authority,
      authoring mode, accessibility, calibration, performance and imported-node integrity
- [x] T002 Incorporate all current controller/reviewer findings consistently across the seven 006B artifacts
- [x] T003 Run temporary real Chromium/Three r185 calibration without production/schema edits. Record that 006
      MeshBasicMaterial is light-insensitive and use a temporary PBR fixture matching 006 camera/scale/fill-key
- [x] T004 Record evidence under `/home/cc/tmp/web3d-light-calibration*.json/png`; freeze unitless `[0,1000]`, Point 25,
      Spot 10, scale-relative creation frame and Duplicate `[1,0,0]`; preserve 006 for final production performance only
- [x] T005 Fold calibrated values and evidence into all seven 006B artifacts
- [x] T006 Close the received final Critical findings and obtain reviewer final PASS
- [x] T006a Obtain one explicit user approval for the complete model, defaults/cap, required legacy
      `lastExportedRevision = null`, commands, migration, archive, IndexedDB, Runtime, React, Studio and acceptance contract

**Production gate**: T006a completed on 2026-07-17. No temporary unbounded production 1.3, minimal production Runtime
harness or partial approval path is allowed.

## Phase 2: Document Contract - Implemented

- [x] T007 Freeze `specs/001-product-foundation/contracts/scene-document-1.2.schema.json`; add the 1.2 generator entry
      in `packages/document/scripts/generate-validators.mjs` and generated
      `packages/document/src/generated/scene-document-1.2.validator.js/.d.ts`
- [x] T008 Add 1.2 result/import/function in `packages/document/src/structure.ts`, add
      `validateSceneDocument1_2` plus public export in `packages/document/src/validate.ts`/`index.ts`, and extend
      `packages/document/scripts/smoke-standalone-validator.mjs` for current/1.0/1.1/1.2 standalone independence
- [x] T009 Write red current-1.3 structure/semantics tests for `type: "light"`, nested kind, unitless intensity
      `[0,1000]`, excluded unit fields, range/angle/penumbra, exact transforms, cap/no-child/parent-to-light diagnostics
- [x] T010 Implement current 1.3 types/schema/semantics with the approved measured upper bound and regenerate current
- [x] T011 Write migration tests for every hop and invalid structural/semantic 1.1/1.2 intermediates; implement validate
      1.0 -> 1.1 -> 1.2 -> current and schemaVersion-only 1.2 migration
- [x] T012 Write exact-snapshot tests for only add/update/remove, locked visibility/unlock exceptions, locked-source
      Duplicate -> unlocked copy, stale/no-op/invalid/Undo/Redo and max eight
- [x] T013 Add atomic rejection/no-redo-clear matrix for `rename-entity`, `set-entity-visibility`, `set-entity-lock`,
      `transform-entity`, `transform-entities`, `delete-subtree`, `duplicate-subtree`, `duplicate-subtrees`, `create-group`,
      `reparent-entities`; implement rejection and light-specific commands
- [x] T014 Audit/test `packages/document/src/types.ts`, `commands/types.ts`, `commands/document-command.ts` cloneEntity,
      `commands/layout-command.ts` duplicate/reparent and `semantics.ts` targets/references/parent-to-light behavior

## Phase 3: Runtime Authority And React - Implemented

- [x] T015 Implement direct unitless brightness mapping/resource tests: defaults 25/10, bounds 0/1000,
      null-range distance 0, fixed decay 2, shadows false,
      angle/penumbra and stable fill/key
- [x] T016 Add validation-before-classification tests: invalid current source rejects before classification/mutation
      and retains old Runtime; non-light change/entity reorder/other classification false invokes existing full load
- [x] T016a Add exact viewer-load revision tests before classification: same-document lower rejects/no ready; equal
      canonical+semantic-identical no-ops/no ready; equal conflict rejects/no ready; only greater may fast/full load;
      different-document lower numeric revision remains a valid project switch. Every rejection preserves old Runtime
- [x] T017 Implement pure exact classifier in `packages/runtime/src/viewer/light-only-source-update.ts` and staged
      resources in `authored-light-controller.ts`; update `three-scene-viewport.ts` to atomically publish same-document
      light-only document/revision/resources/matching ready
- [x] T018 Test add/update/remove/Undo/Redo fast path plus failure/stale/superseded loads; assert retained Canvas,
      generation, assets, adapters, camera/OrbitControls target, controls, selection and fill/key
- [x] T019 Audit/test `packages/runtime/src/document-contract.ts` and `viewer/runtime-generation.ts` exhaustive light
      handling; test `viewer/object-picker.ts` and `viewer/selection-overlay.ts` for Edit picks and Run suppression
- [x] T020 Add controlled Runtime `setAuthoringMode` tests: Edit -> Run synchronously cancels/reverts drag, suppresses
      preview/commit, detaches controls, removes helpers/proxies/overlay/picks; Run -> Edit restores once
- [x] T021 Implement Runtime authoring mode independent of `dataRuntimeEnabled`, disposable helpers/proxies and
      type-specific Point/Spot tool/shortcut/imperative-call rejection before preview
- [x] T022 Add immutable finite `getLightCreationFrame(): { position; target } | null` to Runtime and React; test
      `position = target + [0, clamp(length(camera-target) * 0.2, 0.5, 5), 0]`, ready/loading/error/disposed lifecycle
      and no fallback
- [x] T023 Add controlled React `authoringMode` prop/method and stable source/mode forwarding
- [x] T024 Implement/test imported neutral replacement preserving descendants/associations/targets and rebuilding or
      patching post-replacement `nodesByIndex`

## Phase 4: Studio Branch Audit And Workflow - Implemented

- [x] T025 Audit/test `apps/studio/src/features/SceneTree.tsx`, `scene-tree-model.ts`, `EntityInspector.tsx` and
      `StudioInspector.tsx` for light icon/model, Inspector ownership and update/remove routing
- [x] T026 Audit/test `apps/studio/src/layout/layout-selection.ts`, `layout-capabilities.ts`, `layout-planners.ts`,
      `useStudioSceneLayout.ts` and `transform/transform-reset.ts` for no Group/Reparent/layout/scale/reset bypass
- [x] T027 Audit/test `apps/studio/src/data-binding/useStudioDataBinding.ts` so lights never become data targets
- [x] T028 Build compact Lighting menu with bilingual labels, `n/8`, ARIA roles, Arrow/Home/End, Escape/outside close,
      Run/8-of-8/not-ready localized disabled reasons, Add close/select/focus transfer and settings focus restoration
- [x] T029 Build `Brightness` slider `[0,100]` plus exact numeric input through `1000`, with no explanatory copy,
      first-invalid focus, visible focus, non-color-only state and three-command orchestration outside environment draft
- [x] T030 Add E2E evidence for Point Translate only, Spot Translate/Rotate only, Scale never, synchronous Run,
      selection policy, creation-frame gating, Duplicate and one command/revision per commit

## Phase 5: Archive, Persistence And Acceptance - Complete

- [x] T031 Extend archive `SceneSchemaVersion`/manifest to 1.3; test raw 1.0/1.1/1.2/1.3 import, current-only export
      and archive container 1.0.0
- [x] T032 Add all-eight-key ProjectRecord success/idempotence/failure rollback tests and implement one transactional
      canonical rewrite: rewritten legacy records require `lastExportedRevision = null`; already-current valid 1.3
      records are byte-identical
- [x] T032a Add durable deterministic lit fixture ownership under `tests/fixtures/006b-light-performance-pbr/**`, with
      accepted scene scale/fixed camera and bounded PBR material variety for punctual shader cost; document that it has
      no visual business-meaning oracle
- [x] T033 Run focused/full unit, standalone validator smoke, typecheck, lint, build, i18n, topology, format and real
      WebGL Playwright gates; on both 006 overhead and lit PBR shader-cost fixtures in production path/system Chromium
      at 1440x900 DPR1, test zero, one Point 25, one Spot 10 and eight-light 4+4 mix; record shader spike, then serially
      await 30 warm-up and 300 measured events per state; require each eight-light p95 <=33.3ms
- [x] T034 Run reverse Critical review and write accepted evidence/regression rules to project SSoT

## Dependency Order

1. T001-T002 current finding closure
2. T003-T005 design calibration and writeback complete
3. T006 reviewer final PASS and T006a complete user approval complete
4. T007-T014 Document
5. T015-T024 Runtime/React and T025-T030 Studio
6. T031-T034 archive/persistence/final acceptance

## Mandatory Regression Rules

- Complete current validation always precedes light-only classification.
- Same-document revision gating precedes both fast/full path: lower reject, equal identical no-op, equal conflict reject,
  only greater proceeds; none of the first three emits ready.
- Invalid source rejects before either mutation path and retains old Runtime.
- Every migration intermediate passes its own frozen structure+semantics validator.
- No generic mutation route accepts a light or clears redo on rejection.
- No entity is parented to a light; no light becomes a semantic/data target.
- No authoring mode behavior depends on `dataRuntimeEnabled`.
- No Add falls back when a finite ready creation frame is unavailable.
- Requested render samples count only after corresponding performance events are observed.
- T006a complete user approval was recorded before production/schema work began.
