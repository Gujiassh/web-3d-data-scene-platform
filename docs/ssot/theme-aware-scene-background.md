# Theme-Aware Scene Background

> 状态：Implemented and Accepted
> 决策日期：2026-07-16
> 当前场景合同：`SceneDocument 1.1.0`

## 产品语义

场景背景有两种显式 authored mode：

- `theme`：使用宿主提供的 transient 主题背景；当前 Studio light/dark 分别为 `#F4F6F5` 和
  `#111715`。
- `custom`：始终使用 `environment.background`，不随宿主主题变化。

`environment.background` 始终保留最后一次自定义颜色，同时是主题宿主未提供颜色时的 fallback。
应用主题偏好 `light | dark` 仍只保存在 `web3d.studio.theme`，不得进入 SceneDocument、archive、
ProjectRecord 或 history。

新场景默认 `backgroundMode: "theme"`。旧场景不从颜色猜测意图；即使原颜色恰好等于默认浅色，
迁移后也必须是 `custom`，从而保持升级前的固定视觉语义。

## 数据迁移

Document package 保留不可变的 1.0.0 schema/validator，并把 1.1.0 作为唯一 current schema。
统一读取流程为：

1. 读取原始 `schemaVersion`。
2. 1.0.0 使用历史 validator 严格验证。
3. 保留所有字段和 revision，设置 `schemaVersion: "1.1.0"` 与
   `environment.backgroundMode: "custom"`。
4. 使用 current validator 和语义 validator 复验。

`validateSceneDocument`、save 和 export 只接受 current 1.1.0；`parseSceneDocument`、JSON import 和
ZIP import 接受合法 1.0.0 并只返回 1.1.0。

Studio 打开 IndexedDB 后，在任何正常 list/open/save 操作完成前，用一个 readwrite transaction
扫描 `projects` store 的全部记录。每条 `documentJson` 都经过统一 parse/migrate/canonical serialize，
有任意无效记录则整笔 transaction abort；成功后旧数据已实际重写，不保留 render-time 或
open-current-only 兼容层。

迁移不改变 `ProjectRecord` 八个 key、timestamps、`lastSavedRevision`、`lastExportedRevision`、scene
revision、asset records 或 IndexedDB version 1。

## Archive 版本

ZIP 结构未变，因此 `archiveVersion` 保持 `1.0.0`。Manifest 的 `sceneSchemaVersion` 支持原始
`1.0.0 | 1.1.0`；导入在 migration 前比较 manifest 与原始 `scene.json` version，新导出如实写
`1.1.0`。

## 命令与设置

Project menu 在 Edit mode 提供 Scene settings；Run mode 保留入口但禁用 authored mutation。
设置对话框提供 Follow interface theme / Custom color、native color picker、`#RRGGBB` 输入、实时
Canvas preview、Apply 和 Cancel，并支持中英文、焦点约束、Escape 和焦点恢复。

Apply 使用一个带完整 before/after 的 `set-scene-background` DocumentCommand。有效变化只增加一次
revision/history，参与 Undo/Redo 和 autosave；无变化、非法颜色或 stale before 不修改文档。
Cancel 立即清除 preview。Apply 后 preview 会保留到匹配 project/document/revision 的 Viewer ready，
避免异步 source load 完成前闪回旧背景。

## Runtime 边界

Runtime 只接收框架无关的 transient `themeBackground` 和 `backgroundPreview`，不读取 DOM、React、
Studio theme context 或 CSS variables。有效背景优先级为：

```text
preview > custom document color > theme input > document fallback
```

背景直接更新现有 `THREE.Scene.background` 并 request render，不重建 Canvas、Viewer generation、
TransformControls、adapter、timer 或 listener。React Wrapper 以受控 props/handle 转发这两个输入，
独立于 `source` reconciliation。

## Verification

最终证据：

- root unit：70 files / 354 tests；
- focused Feature 004A Chromium：3/3，通过 theme/custom、preview/Cancel/Apply、立即 Undo/Redo、
  reload、JSON/ZIP 和多记录 IndexedDB migration；
- full Chromium：19/19，6 workers，34.2s，exit 0；
- lint、typecheck、production build、i18n、product design、single-Studio topology、format 和 diff
  check 全部通过；build 只有既有 Three.js 649.59 kB chunk warning；
- P0 contract/data 与 frontend/runtime 两条独立 Critical review 均为 zero remaining findings；
- delayed-GLB reverse reproduction 证明 Apply load 被立即 Undo supersede 后，最新 revision 会接管
  Canvas，stale preview 不残留。

截图：

| Artifact                                     | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `studio-scene-settings-light-1440x900.png`   | `cfc8c3e0879576a9cd2ad2deead03a27d56bbca404b10c83df92e02eb65ff0de` |
| `studio-scene-settings-dark-zh-1280x720.png` | `fb58e45f9bd30029c67c9124f2bacbd38142140875cdf984c780ce8b45ba0ef0` |
