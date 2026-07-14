# M1 实施计划

> 状态：Completed
> 依据：`spec.md` 与 `docs/ssot/m1-architecture.md`

## 1. 依赖顺序

```text
Document commands + history
              │
              ├── Studio session ── Scene tree / Inspector / Toolbar
              │                              │
GLTF inspection + asset repository ── Import transaction
              │                              │
              └──────── Project save ────────┤
                                             │
Archive codec + manifest ───────────── Import/Export
                                             │
Runtime authoring surface ─────────── Studio viewport
                                             │
                                  Browser acceptance
```

## 2. 模块落点

| 模块                                          | 责任                                                   | 禁止承担                 |
| --------------------------------------------- | ------------------------------------------------------ | ------------------------ |
| `packages/document/src/commands/`             | 纯文档命令、history、revision                          | DOM、Three、storage      |
| `packages/document/src/archive/`              | manifest、ZIP、URI 规范化、限制                        | IndexedDB、下载 UI       |
| `packages/runtime/src/authoring/`             | entity pick/focus、TransformControls preview/commit    | 文档 mutation、history   |
| `packages/runtime/src/assets/inspect-gltf.ts` | 模型结构检查与摘要                                     | 项目保存、UI             |
| `packages/react/src/AuthoringScene.tsx`       | authoring runtime 的 React 生命周期                    | 命令和项目业务           |
| `apps/studio/src/project/`                    | IndexedDB repository、asset resolver、autosave         | SceneDocument 语义       |
| `apps/studio/src/session/`                    | selection、tool、mode、history、dirty                  | IndexedDB/Three 私有对象 |
| `apps/studio/src/features/`                   | Project、Import、Scene tree、Inspector、Diagnostics UI | 直接改 runtime 私有状态  |

## 3. 实施切片

### Slice 1：Document editing core

- 建立命令、history、ID 注入和 revision 测试。
- 覆盖 rename、visibility、lock、transform、duplicate、delete 和 import transaction。
- 保证每个结果仍通过 SceneDocument 语义验证。

### Slice 2：Project and asset persistence

- 建立 IndexedDB schema、project repository、asset resolver 和 autosave controller。
- 覆盖 atomic save、quota/write failure、recent/open/delete 和 explicit flush。
- Studio 从 repository 的最近项目启动；首次启动创建空项目。

### Slice 3：Asset import and archives

- 实现 GLB/自包含 glTF inspection 和摘要。
- 实现 JSON/ZIP codec、manifest standalone validation 和安全限制。
- 把 asset bytes 与 document commit 组织成 Studio transaction。

### Slice 4：Authoring runtime

- 先拆分现有 Viewer 的 adapter ownership 和 rendering/interaction 责任，保持 M0 行为。
- 增加不泄露 Object3D 的 authoring surface 和 React wrapper。
- entity pick/focus 与 TransformControls 提供 stable entity ID 事件。

### Slice 5：Studio workflow

- App 只做应用组合，不继续堆叠项目、命令和导入业务。
- 动态 Project 菜单、toolbar、scene tree、viewport、inspector、import modal、diagnostics。
- 补热键、禁用态、save/export 状态和失败恢复。

### Slice 6：Acceptance and release

- 单元、集成、Playwright、截图和下载产物验证。
- 更新 README、SSoT、交付计划和工作台。
- 独立复审后提交并推送。

## 4. 风险控制

- 不用数组顺序、显示名称或 first-available 推断 ID。
- 不把 runtime visibility 当持久化 entity visibility。
- 不把 blob URL 写入文档或归档。
- 不在导入确认前写 storage/history/viewer。
- 不用成功写新 record 后再删旧 record的两阶段伪事务。
- 不把 Inspector 数值编辑当成 viewport transform 完成证据；TransformControls 必须可见并提交
  单一命令。
