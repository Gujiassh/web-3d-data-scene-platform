# Acceptance: Light Entity Authoring

> 验收日期：2026-07-17
> 结论：Implemented and Accepted；27 个 FR/子项与 5 个 NFR 全部 PASS
> 独立复审：Critical closure PASS；无剩余功能 finding

## 方法与范围

feature 目录使用既有 `006b-*` 编号，不符合当前 speckit 抽取器只接受 `NNN-*` 的限制。因此本次用
确定性定义行扫描得到 27 个 FR/子项和 5 个 NFR：重复定义 0、orphan reference 0；本 spec 没有 SC 编码。
仓库没有 `.specify/memory/constitution.md`，治理判断以 feature spec/plan/contracts 和产品 SSoT 为准。

验收依据是 current source、90 files / 533 unit tests、standalone validator smoke、22/22 Chromium/WebGL、
RTX 3090 hardware benchmark、完整 static/build gates 和 reverse Critical review。

## Functional Requirements

| Codes                             | Status | 实现与验证证据                                                                                             | Tasks               |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| FR-001                            | PASS   | current 1.3 schema/types 保留 exact 1.2 environment lighting；migration diff test 只改 version             | T009-T011           |
| FR-002, FR-003                    | PASS   | strict LightEntity union、root/no-child/max-eight/excluded kind/property semantics tests                   | T009-T010,T014      |
| FR-003a, FR-003b                  | PASS   | unitless 0-1000、slider/input、range/decay/shadow direct Runtime mapping tests                             | T010,T015,T029      |
| FR-004, FR-007                    | PASS   | exact Point/Spot TRS invariants；Studio 与 Runtime 双层 tool gate、gizmo E2E                               | T009,T019-T021,T030 |
| FR-005                            | PASS   | generic Group/Reparent/layout/target exclusions、parent-to-light semantics、branch tests                   | T013-T014,T025-T027 |
| FR-006, FR-006a, FR-006b, FR-006c | PASS   | three exact snapshot commands、locked rules、unlocked Duplicate、ten generic-route rejection/redo matrix   | T012-T014,T025-T030 |
| FR-008, FR-008a                   | PASS   | controlled React/Runtime mode；sync drag revert；双向 deferred mode-race tests                             | T020-T023,T030,T034 |
| FR-009, FR-009a                   | PASS   | bilingual accessible menu/Inspector；finite immutable creation frame；focus/disabled reason E2E            | T022,T028-T030      |
| FR-010, FR-011                    | PASS   | frozen validators per hop、invalid intermediate rejection、schemaVersion-only 1.2 migration                | T007-T011,T033      |
| FR-012, FR-012a                   | PASS   | one IndexedDB transaction、all-record rollback、legacy export revision null、current bytes exact           | T032                |
| FR-013                            | PASS   | raw 1.0-1.3 JSON/ZIP import、current-only export、raw manifest version、container 1.0.0                    | T031,T033           |
| FR-014                            | PASS   | imported light neutral replacement preserves tree/associations/targets/nodesByIndex                        | T024                |
| FR-015, FR-015a, FR-015b, FR-015c | PASS   | validation/revision before exact classifier；atomic fast path、identity/failure/stale/supersede/race tests | T016-T020,T034      |
| FR-016                            | PASS   | approval preceded production；calibration and independent review records complete                          | T001-T006a,T034     |

## Non-Functional Requirements

| Code    | Status | 实现与验证证据                                                                                            | Tasks               |
| ------- | ------ | --------------------------------------------------------------------------------------------------------- | ------------------- |
| NFR-001 | PASS   | system Chrome 150、RTX 3090/D3D11、1440x900 DPR1；two production fixtures、compile separated、30+300      | T032a-T033          |
| NFR-002 | PASS   | JSON report includes median/p95/max/drawCalls/triangles；mixed p95 0.20/0.30ms <=33.3ms；runner hard gate | T033                |
| NFR-003 | PASS   | exact command/history snapshots prove one revision/Undo and rejection identity/history/redo               | T012-T014           |
| NFR-004 | PASS   | fast-path and Edit/Run identity tests plus real E2E retain Canvas/generation                              | T018,T020,T030,T034 |
| NFR-005 | PASS   | typed en/zh copy、ARIA/menu keyboard/focus、slider+number non-color state、22/22 E2E                      | T028-T030,T033      |

## Quality Gates

| Gate                     | Result                                                      |
| ------------------------ | ----------------------------------------------------------- |
| Full unit                | PASS, 90 files / 533 tests                                  |
| Standalone validators    | PASS, current/1.0/1.1/1.2 smoke plus Document 17/17         |
| TypeScript               | PASS, root, E2E and five workspaces                         |
| Lint                     | PASS                                                        |
| Production build         | PASS, Studio 1926 modules; existing chunk-size warning only |
| i18n / design / topology | PASS                                                        |
| Prettier / diff check    | PASS                                                        |
| Focused light E2E        | PASS, 2/2                                                   |
| Full Chromium/WebGL      | PASS, 22/22                                                 |
| Hardware performance     | PASS, 006 0.20ms / PBR 0.30ms mixed-eight warmed p95        |

## Review Closure

Initial Critical review found four blockers: stale Edit mode publication during in-flight light-only reconciliation,
SwiftShader evidence presented as production timing, a current/legacy standalone smoke fixture mismatch, and a benchmark
command that reported without enforcing acceptance. All four were reproduced and closed with tests or hard gates.

The original reviewer Nash returned empty `completed` twice during closure, so the original documentation owner Boole
performed the replacement independent review. It confirmed the four closures and CHK038 PASS with no new functional
finding. Its temporary BLOCKED verdict concerned only missing T033 summary and T034 SSoT writeback; this acceptance file,
the updated project SSoT and the complete controller gate results close those administrative conditions.

Remaining evolution watch: `three-scene-viewport.ts` is 1142 lines and should be split by load orchestration versus
viewport interaction before another substantial load strategy is added.
