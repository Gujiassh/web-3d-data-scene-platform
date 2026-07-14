# M1 Studio 架构裁决

> 状态：Accepted
> 日期：2026-07-14

## AD-M1-001：不扩展 SceneDocument

M1 的项目名称、最近项目、保存状态、导出 revision、选中项、工具和面板都不属于场景交换
合同。继续使用 `SceneDocument 1.0.0`，不增加 Editor 或 IndexedDB 字段。

## AD-M1-002：命令纯函数，revision 由 history 管理

`packages/document` 定义纯 `DocumentCommand`。命令保存内容 before/after，不自行读取时间、
随机数或外部状态。History 在 execute/undo/redo 后统一把 revision 设为当前 revision + 1，避免
undo 回退 revision 或不同命令重复 bump。

## AD-M1-003：本地资产按内容寻址

Studio 以 SHA-256 存储资产 Blob，SceneDocument 使用 `asset://<sha256>`。Viewer 通过显式
AssetResolver 从 IndexedDB 取 Blob，不读取临时 blob URL。归档边界负责 URI 规范化，
SceneDocument Schema 不需要变化。

## AD-M1-004：导入与打开都是 candidate-first transaction

模型、JSON 和 ZIP 先完成 parse、Schema、semantic、hash 与依赖检查，生成不可变 candidate；
确认且持久化 transaction 成功后，Studio 才替换当前 document/history/viewer。失败不得通过
兼容分支或部分状态继续。

## AD-M1-005：Authoring 是 Runtime 的独立公开表面

嵌入式 `SceneViewer` 保持只读合同。M1 在 runtime/react 新增 authoring-specific surface，
只交换 stable entity ID、transform 和工具事件，不向 Studio 暴露 Object3D、材质或 renderer。

## AD-M1-006：M1 glTF 支持边界

现有 SceneAsset 和 archive manifest 只描述一个模型文件，没有外部依赖文件集合。M1 因此
支持 GLB 和资源自包含的 glTF；发现外部 `.bin`、纹理或网络 URI 时明确拒绝。支持多文件
glTF 需要未来单独评审并显式变更资产合同，不能在 Studio 内用隐式 sidecar 映射绕过。

## AD-M1-007：先无损拆 Viewer，再加 authoring

`scene-viewer.ts` 在 M0 已达到 810 行。M1 先按 rendering/interaction、adapter ownership 和
orchestration 拆分并跑 M0 回归，再增加 TransformControls，避免在混合职责文件上继续叠加
项目功能。
