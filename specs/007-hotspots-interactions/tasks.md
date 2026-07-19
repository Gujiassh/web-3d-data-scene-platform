# Tasks: Hotspots And Declarative Interactions

**Status**: Complete with an explicit Owner Waiver for unavailable representative-user evidence

**Date**: 2026-07-18

## Pre-Implementation Gates

- [x] T001 Freeze Canvas-first UX and complete data/save direction review.
- [x] T002 Receive user direction approval without unfreezing SceneDocument 1.3.
- [x] T003 Build benchmark-local dynamic marker/DOM/picking/occlusion candidate.
- [x] T004 Run zero/200 hardware calibration, real pointer input and Chrome trace.
- [x] T005 Persist fixture, raw samples, trace events, screenshots and hashes.
- [x] T006 Close same-session Critical calibration re-review and CHK031.
- [x] T007 Receive explicit user approval for the calibrated complete package and close CHK032.

T007 completed on 2026-07-18. Production tasks may proceed in the approved order below.

## Document And Persistence

- [x] T010 Add frozen 1.3 validator entry and current 1.4 schema/type/semantic validation.
- [x] T011 Implement deterministic 1.3 Annotation -> opaque Legacy anchor migration with invalid-intermediate tests.
- [x] T012 Add complete-snapshot add/update/remove Annotation commands, lock rules and no-op/stale/history tests.
- [x] T013 Extend delete-subtree cascades and prove duplicate-subtree never copies annotations.
- [x] T014 Extend raw JSON/ZIP import through 1.4 and current-only export without changing archive container 1.0.0.
- [x] T015 Rewrite every legacy ProjectRecord in one IndexedDB transaction, null rewritten export revisions and retain
      already-current bytes exactly.

## Runtime

- [x] T020 Implement exact rigid surface index and unsupported-surface classification.
- [x] T021 Implement dynamic InstancedMesh marker overlay, stable ID mapping and complete resource disposal.
- [x] T022 Implement DOM proxy projection, roving focus, frustum/opaque occlusion and pointer-pick parity.
- [x] T023 Implement placement/reposition session controller, active-only raycasts and authority cancellation handshake.
- [x] T024 Implement closed action interpreter, point focus and bounded Viewer activation/error events.
- [x] T025 Add thin viewport lifecycle/render forwarding without hotspot policy accumulation.
- [x] T026 Add exact resolution, occlusion, overlap, stale-session, mode-race, StrictMode and disposal tests.

## React And Studio

- [x] T030 Add stable React hotspot handle/events and controlled mode/session forwarding.
- [x] T031 Add canonical `H` command, toolbar button, Help entry and direct placement cursor/reticle state.
- [x] T032 Add adjacent one-line create/rename editor with Enter/confirm and Escape/cancel atomic semantics.
- [x] T033 Add marker selection, compact popover, drag reposition and lock/visibility/delete actions.
- [x] T034 Add separate Hotspots rail view with roving keyboard focus and hidden/unresolved parity.
- [x] T035 Add progressive Hotspot Inspector for plain/trusted content and four dedicated action controls.
- [x] T036 Add Run marker/DOM/list activation surfaces and prove zero mutation reachability.
- [x] T037 Add exact English/Chinese copy, accessible names, live regions and reduced-motion behavior.

## Acceptance

- [x] T040 Add document/persistence unit and rollback coverage for every version and write failure.
- [x] T041 Add Runtime/React integration coverage for every semantic oracle and race.
- [x] T042 Add desktop bilingual/theme/reduced-motion pointer and keyboard E2E at 1280x720 and 1440x900.
- [x] T043 Rewire `bench:hotspot-007` to production controllers and rerun the fixed hardware protocol.
- [x] T044 Record the owner-approved usability waiver; retain first-attempt and timing targets as unproven residual risk.
- [x] T045 Run full typecheck, lint, tests, build, i18n, design, topology, format and diff gates sequentially.
- [x] T046 Return implementation findings to original owners, close rework and obtain independent Critical PASS.
- [x] T047 Update SSoT/spec/acceptance artifacts and prepare Feature 008 publish/embed handoff.

## Required Production Evidence

- current/1.0/1.1/1.2/1.3 standalone validators and invalid intermediate migrations;
- command revision/history/redo and byte-identical rejection snapshots;
- all-record IndexedDB before/after/idempotence/rollback payloads;
- JSON/ZIP raw-version and current-only export payloads;
- exact surface identity, unsupported surface and unavailable diagnostics;
- marker/DOM/list visibility, focus, overlap, occlusion and action identity;
- pointer/keyboard add, rename, reposition, manage and Run activation;
- authority cancellation, late callback, StrictMode and dispose counts;
- production-path raw hardware samples, trace, GPU query, screenshot/pixel and fixture hashes.
