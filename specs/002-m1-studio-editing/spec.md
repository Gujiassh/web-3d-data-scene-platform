# M1 Studio 编辑闭环规格

> 状态：Implemented and accepted locally
> 日期：2026-07-14
> 上游需求：FR-001 至 FR-005、FR-010；AC-001、AC-002、AC-003、AC-009

## 1. 目标

把 M0 的只读合同控制台升级为可在浏览器内完成本地项目创建、模型导入、场景编辑、撤销
重做、自动保存和 JSON/ZIP 往返的 Studio。M1 完成后，用户能够从一个模型文件开始形成可
重复打开和导出的有效 `SceneDocument`，而不需要修改代码。

## 2. 范围

### Must

- 创建、打开、最近项目切换和删除本地项目。
- IndexedDB 原子保存项目文档与资产 Blob；500ms 自动保存和显式 flush。
- 导入 GLB 或自包含 glTF，先验证并显示摘要，确认后再事务提交。
- 动态场景树、视口与树选择同步、重命名、隐藏、锁定、复制和删除。
- Move、Rotate、Scale authoring 工具；拖动期间只预览，结束时提交一个命令。
- 所有持久化编辑通过 `DocumentCommand`，支持 Undo/Redo 和 dirty 状态。
- JSON 文档导入导出；包含 manifest、scene 和资产的 ZIP 导入导出。
- schemaVersion 不兼容、资产损坏、归档不安全或保存失败时保留当前有效项目。

### Non-goals

- 不实现 M2 的 Binding/Rule 编辑器、WebSocket 配置或更多 DataAdapter。
- 不改变 `SceneDocument` Schema，不增加项目 UI/session/runtime 字段。
- 不支持含外部 `.bin`、纹理或网络 URI 的多文件 glTF；M1 只接受 GLB 和资源内嵌的 glTF。
- 不做多人协作、云端项目、权限、物理、在线建模或材质编辑。
- 不发布 npm packages；公开仓库仍是源码 preview。

## 3. 状态边界

| 状态                            | 所有者                    | 持久化位置                        |
| ------------------------------- | ------------------------- | --------------------------------- |
| SceneDocument                   | `packages/document`       | IndexedDB project record / export |
| Asset bytes                     | Studio project repository | IndexedDB asset store / ZIP       |
| Project metadata                | Studio project repository | IndexedDB project record          |
| Undo/Redo history               | Studio edit session       | memory only                       |
| Selection/tool/panel/modal      | Studio edit session       | memory only                       |
| Renderer/Object3D/gizmo preview | Runtime authoring surface | memory only                       |
| Telemetry/connection/alarm      | Runtime                   | memory only                       |

以下字段不得写入 `SceneDocument`：current project、selected entity、active tool、save status、
last exported revision、recent projects、panel state、Object3D、blob URL、telemetry 和 alarm。

## 4. 持久化语义

- 本地资产 URI 固定为 `asset://<sha256>`；资产 bytes 以 SHA-256 为 IndexedDB 主键。
- ZIP 内的 `scene.json` 将 URI 临时规范化为 `assets/<sha256>.<ext>`；导入本地项目时恢复为
  `asset://<sha256>`，不得导出 blob URL、绝对路径或本机 URL。
- 每次 execute、undo 或 redo 只让 `revision` 单调增加一次；预览、选择、工具切换和 Run/Edit
  切换不增加 revision。
- 一次项目保存使用单个 IndexedDB transaction 写入 project 和新增资产；失败时旧 project
  record 与旧资产保持可用。
- `lastExportedRevision` 属于 project metadata，不属于 SceneDocument。当前 revision 更大时 UI
  显示 `Export outdated`。
- JSON 导入只接受资产已存在于本地 asset store 的文档；需要携带资产的交换使用 ZIP。

## 5. 命令语义

所有命令是纯函数，不访问 DOM、Three.js、IndexedDB、时间或随机数。命令需要的 ID 和时间由
调用方注入。

- Rename：只改变实体 name。
- Visibility/Lock：只改变持久化实体字段；运行时规则 visibility 不反写。
- Transform：提交完整 before/after transform；一次 gizmo drag 形成一个命令。
- Duplicate：复制选中实体子树并为所有新实体和从属 Target 生成稳定新 ID；保留 asset hash
  与 node index 语义，不复制 Binding/Annotation 到不明确的业务目标。
- Delete：删除实体子树，并级联删除引用该子树 Target 的 Binding 和 Annotation；完整快照可撤销。
- Import asset instance：一次提交 asset、entity 和 root target；失败不进入 history。
- Undo/Redo：恢复命令内容但使用新的单调 revision，不恢复旧 revision 数值。
- Run 模式不得 execute `DocumentCommand`。

## 6. 导入限制

- 单个模型入口最大 50 MiB。
- GLB 通过 magic/version/length 和 GLTFLoader 校验；glTF 必须为合法 JSON 且只使用 data URI
  或内嵌 bufferView 资源。
- 导入摘要至少包含文件名、media type、byte length、SHA-256、node、mesh、material 和 triangle
  数量，以及预算警告。
- 摘要确认前不得写项目、资产库、命令历史或当前 Viewer。
- 资产哈希已存在时复用 bytes，但仍允许创建新的实例。

## 7. 归档限制

- Archive version 和 Scene schema version 必须为 `1.0.0`。
- 最多 128 个文件；单文件最大 50 MiB；总展开大小最大 150 MiB。
- 拒绝绝对路径、反斜杠、空段、`.`、`..`、重复路径、额外文件和 hash/length/media type
  不匹配。
- `manifest.json` 不列出自身；必须包含 `scene.json` 和文档引用的全部资产，且不得包含额外
  payload。
- 归档 parse、validate、hash、asset resolve 全部成功后才允许替换当前项目。

## 8. 验收矩阵

| ID     | 可验证不变量                                                   | 必须证据                           |
| ------ | -------------------------------------------------------------- | ---------------------------------- |
| M1-A01 | 新建项目可保存、重载并恢复相同 canonical document              | repository unit + browser reload   |
| M1-A02 | 有效 GLB 先显示摘要，确认后新增 asset/entity/target            | import unit + Playwright           |
| M1-A03 | 无效 GLB/glTF 不改变 document、asset store 或 history          | transaction unit + Playwright      |
| M1-A04 | 树选择与视口选择使用同一 entity ID                             | runtime event test + Playwright    |
| M1-A05 | Rename/visibility/lock/transform/duplicate/delete 都可撤销重做 | command unit + Playwright sequence |
| M1-A06 | 三次 Undo 恢复三步前内容，三次 Redo 恢复最终内容               | AC-003 unit + Playwright           |
| M1-A07 | Run 模式不产生文档命令或 revision                              | session unit + Playwright          |
| M1-A08 | JSON 往返保留稳定 ID、层级、变换、binding 和 rule              | canonical JSON comparison          |
| M1-A09 | ZIP 往返 canonical local document diff 为零且资产 hash 相同    | archive unit + downloaded artifact |
| M1-A10 | 保存或归档导入失败时旧项目继续可编辑                           | repository/archive failure tests   |
| M1-A11 | session/runtime state 不出现在保存和导出文档                   | forbidden-field scan + unit test   |
| M1-A12 | narrow Studio gate 仍卸载 Viewer，Factory M0 行为不回归        | existing and expanded E2E          |

## 9. 完成定义

- M1-A01 至 M1-A12 全部有当前代码对应的自动化或浏览器证据。
- `pnpm format:check`、lint、typecheck、unit、E2E、build 和 product verifier 全部通过。
- 关键浏览器流程无 `pageerror`、`console.error`、页面溢出或空 Canvas。
- SSoT、交付计划、工作台 checkpoint 和 README 状态同步。
- 独立复审通过目标、数据合同、保存语义、边界、测试真实性和运行时证据。
