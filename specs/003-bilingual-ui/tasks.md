# Tasks: 中英文界面国际化

## Phase 1: Setup

- [x] T001 固化需求、数据边界和验收口径到 `specs/003-bilingual-ui/spec.md`
- [x] T002 编写技术计划与研究结论到 `specs/003-bilingual-ui/plan.md` 和 `research.md`
- [x] T003 编写模型边界、验收步骤与架构 SSoT 到 `data-model.md`、`quickstart.md`、`docs/ssot/i18n-architecture.md`

## Phase 2: Foundational

- [x] T004 [P] 在 `apps/shared/i18n.ts` 实现 locale 归一化、检测、持久化和 typed catalog 工具
- [x] T005 [P] 在 `apps/shared/LanguageSwitch.tsx` 与 `apps/shared/theme.css` 实现可访问语言分段控件
- [x] T006 在 `packages/runtime/src/types.ts`、`viewer/three-scene-viewport.ts` 和 React wrappers 实现 Canvas label 原位更新
- [x] T007 为 locale 工具和 Canvas label 生命周期添加 Vitest 回归测试

## Phase 3: User Story 1 - 使用熟悉的界面语言

- [x] T008 [P] [US1] 在 `apps/studio/src/i18n/` 建立 typed 中英文 catalog/provider/formatters
- [x] T009 [US1] 将 `apps/studio/src/App.tsx` 与 `features/*.tsx` 的固定文案和可访问名称接入 catalog
- [x] T010 [US1] 将 `apps/studio/src/workspace/useStudioWorkspace.ts` 的应用状态、固定错误与创建默认名接入翻译边界
- [x] T011 [P] [US1] 在 `apps/factory-demo/src/i18n/` 建立 typed 中英文 catalog/provider/formatters
- [x] T012 [US1] 将 `apps/factory-demo/src/App.tsx` 的固定文案、状态、设备和已知告警接入显式展示映射
- [x] T013 [US1] 在 `tests/e2e/i18n.spec.ts` 覆盖中英文首次加载和核心 Studio/Factory 流程

## Phase 4: User Story 2 - 切换并记住语言

- [x] T014 [P] [US2] 在 Studio 与 Factory 首屏挂载 `LanguageSwitch` 并同步 title、HTML lang 和应用专用偏好
- [x] T015 [US2] 在 `tests/e2e/i18n.spec.ts` 覆盖显式切换、即时更新、刷新恢复与无效偏好 fallback

## Phase 5: User Story 3 - 保持数据原义

- [x] T016 [US3] 在 `tests/e2e/i18n.spec.ts` 断言切换前后 Canvas 节点、revision、selection、connection 和 canonical document 不变
- [x] T017 [US3] 添加固定文案扫描或等价覆盖守卫，白名单技术标识和未知诊断

## Final Phase: Polish & Cross-Cutting Concerns

- [x] T018 在 1440x900、1280x720、768x1024 执行中文截图与 overflow 验收
- [x] T019 运行 format、lint、typecheck、unit、build、E2E 和产品设计 verifier
- [x] T020 执行独立合同与前端/runtime review，并回写 `specs/003-bilingual-ui/` 验收状态

## Dependencies

- T004-T007 是两个应用本地化的共同前置。
- US1 提供完整翻译层；US2 在同一 provider 上增加切换和持久化；US3 验证合同不变。
- Studio 与 Factory 文案接入可在共享基础完成后并行，E2E 在二者集成后执行。

## Independent Test Criteria

- **US1**: 中文和英文浏览器首次打开两个应用时，全部固定 UI 与 aria copy 使用预期语言。
- **US2**: 显式切换无需 reload，刷新后恢复，HTML lang 与当前选择一致。
- **US3**: 切换前后 SceneDocument、revision、selection、Viewer Canvas 与 telemetry 语义不变。
