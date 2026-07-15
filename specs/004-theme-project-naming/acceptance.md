# Acceptance: Theme And Scene Naming

**Feature**: `004-theme-project-naming`

**Date**: 2026-07-15

**Result**: PASS (25/25 coded points)

The repository has no `.specify/memory/constitution.md`; acceptance used the project SSoT, feature
specification, product-design verifier and root quality scripts. The coded-points extractor found 25
definitions, zero duplicates and zero orphan references.

## Semantic Oracles

- Named creation: no repository mutation occurs before valid confirmation; a valid confirmation creates
  exactly one trimmed named project.
- Name consistency: `ProjectRecord.name === SceneDocument.name` after create, rename, Undo, Redo, save,
  reload and export; revisions remain monotonic.
- Theme isolation: theme changes root presentation state only; document, record, history, Viewer/runtime
  state and scene environment values remain unchanged.
- Viewer continuity: theme switching preserves the same Canvas DOM node and nonblank WebGL content.

## Acceptance Matrix

| Code    | Status | Implementation evidence                                                                       | Verification evidence                                 | Tasks                |
| ------- | ------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| FR-001  | PASS   | `App` opens `SceneNameDialog` before `createProject`                                          | named-creation E2E                                    | T009-T011            |
| FR-002  | PASS   | dialog trims/validates draft and exposes the existing 160-character limit                     | dialog SSR, command unit, E2E                         | T006, T009, T011     |
| FR-003  | PASS   | dialog cancel/Escape/backdrop only clears transient mode                                      | cancel + project-count + same-Canvas E2E              | T009-T011            |
| FR-004  | PASS   | `createNewStudioProject` and repository save align document/record names                      | named-create IndexedDB E2E                            | T007, T010-T011      |
| FR-005  | PASS   | `ProjectMenu` Edit-mode rename action and prefilled dialog                                    | rename + Run-disabled E2E                             | T008-T009, T012      |
| FR-006  | PASS   | `rename-document` uses existing history/session/autosave path                                 | command Undo/Redo unit + autosave/reload E2E          | T006-T007, T012-T013 |
| FR-007  | PASS   | command and history return original objects for unchanged trim                                | no-op history unit + revision E2E                     | T006, T013           |
| FR-008  | PASS   | workspace mirrors active/recent names; repository indexes document name; export uses document | race unit + immediate-list/reload/JSON/ZIP E2E        | T007, T013           |
| FR-009  | PASS   | shared Lucide `ThemeSwitch` mounted in Studio and Factory                                     | SSR accessibility + both-app E2E                      | T005, T014           |
| FR-010  | PASS   | `resolveTheme` uses saved preference, browser preference, light fallback                      | theme unit + dark-first/reload E2E                    | T004, T016           |
| FR-011  | PASS   | shared semantic light/dark tokens cover app surfaces and overlays                             | screenshot/overflow E2E + visual inspection           | T005, T015-T016      |
| FR-012  | PASS   | ThemeProvider uses app-local storage/root dataset only                                        | unchanged stored document E2E + contract review       | T004, T016           |
| FR-013  | PASS   | theme context does not key Viewer/adapter/project lifecycle                                   | same Canvas, revision, selection and connection E2E   | T014, T016           |
| FR-014  | PASS   | Studio/Factory typed catalogs own naming and theme labels                                     | typed catalogs, i18n verifier, bilingual E2E          | T008, T014           |
| FR-015  | PASS   | theme changes host CSS only; Viewer source/environment untouched                              | stored document equality + Canvas screenshot evidence | T015-T016            |
| NFR-001 | PASS   | `setTheme` applies root dataset/color scheme immediately without reload                       | root attribute and same-page E2E                      | T004, T016           |
| NFR-002 | PASS   | command variant and mirror logic add no document/project/archive fields                       | schema diff review, typecheck, archive regressions    | T006-T007, T013      |
| NFR-003 | PASS   | theme implementation is local React/CSS/localStorage state                                    | dependency/code review and build                      | T004-T005            |
| NFR-004 | PASS   | responsive semantic-token layouts preserve existing geometry                                  | 1440x900, 1280x720, 768x1024 overflow <=1px           | T015-T016            |
| NFR-005 | PASS   | shared focus-visible rules and theme-specific readable status tokens                          | screenshots + manual visual review                    | T005, T015-T016      |
| SC-001  | PASS   | create flow holds mutation until accepted confirmation                                        | cancelled/invalid count 0, valid count 1 E2E          | T011                 |
| SC-002  | PASS   | document name is authoritative through all history/save/export transitions                    | command/race/repository unit + full naming E2E        | T006-T007, T013      |
| SC-003  | PASS   | theme is outside Viewer/document/telemetry dependencies                                       | same-node and state-equality E2E                      | T016                 |
| SC-004  | PASS   | independent app keys persist explicit choice; invalid values fall back                        | theme unit + both-app reload E2E                      | T004, T016           |
| SC-005  | PASS   | target viewport checks and screenshot evidence cover both themes                              | automated overflow/pixel checks + visual inspection   | T016, T018           |

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 30 files / 150 tests
- `pnpm build`: PASS (existing Three.js >500 kB chunk warning remains)
- `pnpm verify:i18n`: PASS
- `npm_config_offline=true pnpm verify:design`: PASS
- `CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=250 pnpm test:e2e`: PASS, 13/13
- `git diff --check`: PASS

## Runtime Evidence

- `artifacts/e2e/studio-create-scene-dialog-light-1440x900.png`
- `artifacts/e2e/studio-dark-1440x900.png`
- `artifacts/e2e/studio-light-1280x720.png`
- `artifacts/e2e/factory-dark-1440x900.png`
- `artifacts/e2e/factory-light-768x1024.png`

Canvas pixel checks confirmed opaque, nonblank WebGL output. Automated page overflow was at most 1px.
Manual inspection found no text/control overlap and confirmed readable hierarchy in all four theme/layout
captures. The intentionally light scene background in dark host chrome remains document-driven.

## Independent Review

- Contract review initially found delayed recent-list name synchronization and missing name-aware save
  race/round-trip evidence. Rework added immediate execute/Undo/Redo list synchronization, current-name
  overlay for async save/list results, a stale-save unit oracle and renamed JSON/ZIP browser round trips.
  Focused re-review returned no remaining findings.
- Frontend review initially found long-name overflow risk, incomplete modal focus handling, weak submit
  feedback and missing interaction evidence. Rework added fixed-width ellipsis/full-name tooltip,
  background inertness, Tab trapping, focus restoration, busy/spinner/failure feedback and Escape,
  backdrop, long-name and focus E2E. Focused re-review returned no remaining findings.
- Final judgment: implementation is acceptable and preserves the intended document, project, archive,
  Viewer/runtime and theme-state boundaries.
