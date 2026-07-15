# Acceptance: Single Studio Data Binding

> 验收日期：2026-07-15
> 结论：Implemented and Accepted；FR/NFR/SC 全部 PASS
> 独立复审：T031 complete；frontend 与 contract 均无剩余 finding

## 方法与范围

`extract-coded-points.sh --json --feature 005` 得到 30 个定义：18 FR、6 NFR、6 SC；重复定义 0，
orphan reference 0。`extract-tasks.sh --json --feature 005` 未发现重复 Task ID。requirements
checklist 全部完成。验收以当前实现、44 files / 222 unit tests、11/11 Playwright tests、构建/静态门禁
和产物解析为依据。

仓库没有 `.specify/memory/constitution.md`，因此本记录不声称 constitution verdict；合同约束以
`spec.md`、`plan.md`、`contracts/README.md` 和既有 product SSoT 为准。T031 已完成；T032 的
commit/push 交付仍未执行，不影响本地实现验收结论。

## Functional Requirements

| Code   | Status | 实现与验证证据                                                                                                                                              | Tasks                    |
| ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| FR-001 | PASS   | root `pnpm dev` -> sole Studio strict 4173；single Playwright baseURL/server；topology gate                                                                 | T009-T013                |
| FR-002 | PASS   | `App.tsx` 的同一 project/document/AuthoringScene；M2 remembered Canvas、selection、revision 4                                                               | T027-T028                |
| FR-003 | PASS   | `selected-target.ts` 按 entity/target ID 严格解析；Data panel 展示 target 与 Business ID                                                                    | T007,T014,T017           |
| FR-004 | PASS   | target command validation/history tests覆盖 no-op、Undo/Redo、单调 revision；M2 autosave/reload                                                             | T005,T014,T018           |
| FR-005 | PASS   | typed Mock source editor/command；unit 覆盖 create/edit/threshold validation；M2 保存 source                                                                | T005,T014,T017           |
| FR-006 | PASS   | deterministic sample leaf enumeration、RFC 6901 escaping/sort；M2 选择 `/telemetry/status`                                                                  | T006-T007,T015           |
| FR-007 | PASS   | atomic configure/toggle/remove binding commands 与 UI；command tests 覆盖引用和 orphan RuleSet                                                              | T005,T015,T021           |
| FR-008 | PASS   | 三条 ordered equality/color rows 与 optional alarm 已通过；Studio string equality authoring 160 字符 guard 与 focused tests 已验证，schema/legacy load 不变 | T019-T021                |
| FR-009 | PASS   | deterministic priority/writes builder；duplicate value、writer conflict、shared/unsupported tests                                                           | T019,T022                |
| FR-010 | PASS   | 所有持久化变化经过 DocumentCommand/history；unit 覆盖原子提交、拒绝、no-op、monotonic revision                                                              | T005,T018,T021           |
| FR-011 | PASS   | Run 派生 Mock adapter，经 runtime value/rule/effect pipeline 投影；M2 critical/offline/recovery                                                             | T023-T025,T027-T028      |
| FR-012 | PASS   | Run panel 显示 Sources、Binding values、Active alarms、Runtime diagnostics；M2 DOM assertions                                                               | T008,T025-T028           |
| FR-013 | PASS   | preview/runtime 与 document 分离；Run 全程 revision 4；post-Run JSON/ZIP/IndexedDB owner 字段无 runtime state                                               | T008,T023,T028           |
| FR-014 | PASS   | Edit stop/unsubscribe、clear alarm/value/connection、restore material；M2 active timers 0 与 pixel clear                                                    | T023-T025,T027-T028      |
| FR-015 | PASS   | M2 reload/import round-trip 及 post-Run JSON、ZIP、IndexedDB `documentJson` 均与 pre-Run canonical 深比较                                                   | T018,T028                |
| FR-016 | PASS   | typed en/zh-CN catalog、accessible controls、shared themes；i18n/theme tests 和 M2 continuity                                                               | T016,T020,T026,T028      |
| FR-017 | PASS   | Factory app/package/port/server/key 已删除；M2 替代证据先通过；`pnpm verify:topology` PASS                                                                  | T010-T013                |
| FR-018 | PASS   | `SceneDocument 1.0.0`/archive codecs与字段 shape未改；schema/archive/type diff为空且 contract tests PASS                                                    | T004-T006,T018,T023-T024 |

## Non-Functional Requirements

| Code    | Status | 实现与验证证据                                                                                                               | Tasks               |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| NFR-001 | PASS   | M2 独立测量 timer handler -> critical DOM -> next RAF，`criticalLatency <= 100ms`；不含 scenario delay                       | T028,T030           |
| NFR-002 | PASS   | 同一 Canvas；首次 5 timers，偏好切换不变，第二轮累计 10 且 max active 5；unit max subscription 1                             | T023-T028           |
| NFR-003 | PASS   | M2 1440x900/1280x720 screenshot、page overflow检查；完整 Studio suite覆盖中文与两主题                                        | T026,T028,T030      |
| NFR-004 | PASS   | document command/history与 StudioPreviewState/runtime snapshot分属 typed ownership 和独立 lifecycle                          | T005,T008,T023-T027 |
| NFR-005 | PASS   | post-Run JSON/ZIP/IndexedDB 显式拒绝 connection/value/quality/alarm/diagnostic runtime owner 字段；diagnostic只展示稳定 code | T008,T018,T023,T028 |
| NFR-006 | PASS   | README 仅一个 `pnpm dev`/Studio URL；lockfile无 Factory importer；topology/i18n/package graph gates PASS                     | T009-T013,T030      |

## Success Criteria

| Code   | Status | 实现与验证证据                                                                                                                                                    | Tasks               |
| ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| SC-001 | PASS   | M2 从 GLB import 到 mapping/source/path/3 rules/Run 全程使用一个 Studio UI，无代码编辑                                                                            | T014-T021,T028      |
| SC-002 | PASS   | canonical document含 ready/warning/critical 三值与颜色；scenario unit覆盖全序列；critical handler -> DOM -> next RAF 实测 <=100ms，Canvas redRatio 为随后独立证据 | T019-T022,T028      |
| SC-003 | PASS   | command/history覆盖 Undo/Redo；M2 reload/import 与 post-Run JSON/ZIP/IndexedDB 对 pre-Run canonical 深比较保持 ID/meaning                                         | T005,T018,T028      |
| SC-004 | PASS   | Run/Edit、language、theme保留同一 Canvas/selection；timer与subscription oracle证明无重复                                                                          | T023-T028           |
| SC-005 | PASS   | README单 URL；Factory app/package/port/key为零 active reference；窄历史 allowlist 与 topology gate PASS                                                           | T009-T013,T030      |
| SC-006 | PASS   | persistence schema/archive/type source无 diff；现有 validator、archive与 document tests全部通过                                                                   | T004-T006,T018,T030 |

## Quality Gates

| Gate                | Result                                                  |
| ------------------- | ------------------------------------------------------- |
| Format              | PASS                                                    |
| Lint                | PASS                                                    |
| Typecheck           | PASS                                                    |
| Unit                | PASS，44 files / 222 tests                              |
| Build               | PASS，Studio-only；既有 Three runtime 649.55 kB warning |
| i18n                | PASS                                                    |
| Product design      | PASS                                                    |
| Topology            | PASS                                                    |
| Focused M2 E2E      | PASS，3/3；16.1s / 2.2s / 1.7s                          |
| Full Chromium E2E   | PASS，11/11，21.6s                                      |
| Fixture bytes/hash  | PASS，1216 bytes / accepted SHA-256                     |
| Contract shape diff | PASS，zero files                                        |

详细命令、像素阈值、延迟边界、timer lifecycle 与截图列表见
`docs/ssot/m2-verification.md`。

## Review Closure

Frontend review 已关闭且无剩余 finding。Contract review 原五项均已完成 implementation 与 focused
evidence，包括 160 字符 Studio authoring guard、Run 前后 JSON/ZIP/IndexedDB canonical 深比较、
runtime-state leakage 拒绝、Run Undo/Redo 不变式、跨项目相同 document ID remount 与 legacy
WebSocket 错误/清理证据；contract closure 已确认原五项全部关闭，主控仍负责 T032 commit/push。

`packages/runtime/src/viewer/three-scene-viewport.ts` 的 1008 行规模记录为下一切片 architecture
watch，不是 feature 005 blocker。
