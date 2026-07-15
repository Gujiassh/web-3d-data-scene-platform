# Implementation Plan: 中英文界面国际化

**Branch**: `main` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)
**Input**: Studio 与 Factory Demo 全部固定界面文案支持 `en` / `zh-CN`，不改变场景、存档或遥测合同。

## Summary

在 `apps/shared` 建立零依赖 locale 检测、归一化、持久化和语言切换控件；两个应用分别维护
递归类型校验的本地词典和 React context。固定文案、可访问名称及数字/日期格式通过词典渲染，
用户数据与协议值保持原文。runtime 增加 Canvas 可访问名称的原位更新能力，确保切换语言不重建
Viewer。Factory 通过稳定设备 key、协议枚举和已知 `ruleId` 做展示映射，未知诊断与告警保留原文。

## Technical Context

**Language/Version**: TypeScript 6.0.3, React 19.2.7
**Primary Dependencies**: Three.js 0.185.1, Vite 8.1.4；不新增 i18n 依赖
**Storage**: 每个应用独立的 `localStorage` 语言偏好；不进入 IndexedDB project record 或 archive
**Testing**: Vitest 4.1.10, Playwright 1.61.1, TypeScript, ESLint, Prettier
**Target Platform**: Node.js 22.12+ 构建，现代桌面浏览器
**Project Type**: pnpm workspace，两个 React 应用 + shared/runtime/react packages
**Performance Goals**: 语言切换在一个动画帧内更新固定文案，不触发 Viewer、adapter 或 session 重建
**Constraints**: 不新增网络请求；不改变 SceneDocument、ProjectRecord、archive、runtime snapshot 或遥测值
**Scale/Scope**: Studio 当前编辑工作区与 Factory reference demo 的全部固定 UI copy

## Architecture Check

- **SSoT**: `spec.md` 定义行为，`docs/ssot/i18n-architecture.md` 固化展示/数据边界。
- **Contracts**: SceneDocument、ProjectRecord、command history、archive 与 telemetry 协议均不修改。
- **Public API**: runtime/react 仅新增可选 `canvasLabel` 与 `setCanvasLabel`，现有调用保持有效。
- **Identity**: locale 不参与 document/entity/project/business ID 或 revision 计算。
- **Lifecycle**: locale provider 只更新 React 展示和现有 Canvas 属性，不重建 Viewer 或 adapter。
- **Diagnostics**: 已知应用状态翻译；未知 runtime/browser message 与 diagnostic code 保留原值。
- **Quality gates**: format check、lint、typecheck、unit、build、全量 E2E、产品设计 verifier。

设计复核结论：无数据合同变化，无外部服务，无迁移与兼容层；架构门通过。

## Performance Evidence Plan

N/A。未修改渲染、场景生成或遥测热路径。通过组件/runtime 单测和 E2E 断言 Canvas 节点身份、
revision 与 connection 状态在语言切换前后不变。

## Project Structure

```text
apps/shared/
├── i18n.ts                 # locale detection, persistence, typed utilities
├── LanguageSwitch.tsx      # shared segmented language control
└── theme.css               # shared language control styling

apps/studio/src/i18n/
├── catalog.ts
├── error-presentation.ts
└── I18nProvider.tsx

apps/studio/src/errors.ts  # stable app-owned error codes and technical details

apps/factory-demo/src/i18n/
├── catalog.ts
└── I18nProvider.tsx

packages/runtime/src/
├── types.ts
└── viewer/three-scene-viewport.ts

packages/react/src/
├── SceneViewer.tsx
└── AuthoringScene.tsx

tests/e2e/i18n.spec.ts
```

**Structure Decision**: 共享层只拥有 locale 基础设施和通用控件；业务词典留在各应用，避免
Factory 演示语义进入 domain-neutral core。runtime 只接收最终 Canvas label，不依赖翻译系统。

## Complexity Tracking

无架构例外。
