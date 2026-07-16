# Tasks: Theme-Aware Scene Background

## Contract And Migration

- [x] T001 Freeze the approved 1.1.0 environment, migration and persistence contract.
- [x] T002 [Document] Preserve the 1.0.0 schema/validator and generate the current 1.1.0 validator.
- [x] T003 [Document] Implement deterministic 1.0.0 validation/migration and current-only parse APIs.
- [x] T004 [Document] Add `set-scene-background` command, no-op/reject/history/Undo/Redo tests.
- [x] T005 [Document] Update JSON/archive import/export and truthful manifest scene version handling.

## Runtime And Studio

- [x] T006 [Runtime] Add in-place transient theme background reconciliation with load-race tests.
- [x] T007 [React] Add controlled `themeBackground` prop with Canvas/Viewer lifecycle tests.
- [x] T008 [Studio] Make new scenes 1.1.0 theme-mode documents.
- [x] T009 [Studio] Transactionally migrate and rewrite all persisted IndexedDB project documents.
- [x] T010 [Studio] Add Project menu Scene settings entry and accessible bilingual settings dialog.
- [x] T011 [Studio] Implement live preview, Cancel restoration and one-command Apply.

## Acceptance

- [x] T012 [QA] Prove old JSON/ZIP and multi-record IndexedDB migration to persisted 1.1.0.
- [x] T013 [QA] Prove follow-theme same-Canvas behavior and custom preview/Apply/Undo/Redo/reload.
- [x] T014 [QA] Prove JSON/ZIP round trips, exact ProjectRecord keys and no runtime/presentation leakage.
- [x] T015 [QA] Capture 1280 Chinese/dark and 1440 English/light visual/overflow evidence.
- [x] T016 Resume independent contract/frontend reviewers and close every finding in original lanes.
- [x] T017 Update SSoT/roadmap, run full gates, close workbench, commit and push one coherent slice.
