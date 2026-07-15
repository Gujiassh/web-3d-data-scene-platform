# 技术设计：Web 3D 数据场景平台

> 状态：Accepted for MVP
> 日期：2026-07-13
> 单 Studio 修订：2026-07-15，由 `../005-single-studio-data-binding/plan.md` 接管当前拓扑
> 依据：`spec.md`、`product-design.md`、`docs/ssot/product-decisions.md`

## 1. 架构目标

- SceneDocument 不依赖 Three.js、React 或具体业务领域。
- Editor 与 Viewer 共享同一套文档解释、规则执行和资产解析语义。
- 持久化状态、运行时遥测状态、编辑器会话状态和宿主业务状态保持分离。
- Viewer 可以静态部署并嵌入非 React 页面，React 包装层不改变核心接口。
- 数据适配器不持有场景知识，场景规则不执行任意代码。
- 所有外部输入先验证，再以事务方式替换当前有效状态。

## 2. 代码组织

```text
apps/
├── studio/                唯一产品前端，包含 Edit 与 Run
└── shared/                内部展示偏好和控件支持，不是产品入口
packages/
├── document/              Schema、验证、迁移、命令和序列化
├── runtime/               Three.js Viewer、规则执行、拾取和诊断
└── react/                 Viewer React wrapper
tests/
└── fixtures/m0-factory/   固定 GLB、SceneDocument、manifest、生成器和许可证
benchmarks/
└── reference-scene/       固定模型、数据负载和测量脚本
```

MVP 不单独创建 adapters 包。Mock 和 WebSocket 适配器位于 `runtime`，当出现第三种稳定
适配器并证明独立发布价值后再拆分。

## 3. 依赖方向

```text
document  <-  runtime  <-  react
    ^            ^
    │            │
    └──────── studio
```

- `document` 不导入 Three.js、React、DOM 或网络 API。
- `runtime` 可以导入 `document` 和 Three.js，不导入 Studio。
- `react` 只管理 Viewer 生命周期和宿主事件。
- `studio` 使用公共 document/runtime API，不访问运行时私有 Three.js 对象。
- feature 008 的最小宿主只通过发布的 runtime/react API 证明嵌入，不依赖 Studio 内部模块。

## 4. 状态所有权

| 状态         | 所有者          | 是否持久化 | 示例                                   |
| ------------ | --------------- | ---------- | -------------------------------------- |
| 场景文档     | document        | 是         | 实体、资产、变换、绑定、规则、视图     |
| 编辑器会话   | studio          | 否         | 当前选择、展开节点、面板尺寸、活动工具 |
| 命令历史     | studio/document | 仅本次会话 | 移动、重命名、删除、绑定修改           |
| 运行时遥测   | runtime         | 否         | 当前值、质量、连接状态、告警实例       |
| 渲染对象     | runtime         | 否         | Scene、Object3D、材质实例、控制器      |
| 宿主业务状态 | host app        | 由宿主决定 | 设备详情、用户权限、告警确认、路由     |

禁止把 Three.js UUID、Object3D 引用、当前选择、相机过渡、WebSocket 实例和实时值写入
SceneDocument。

## 5. 场景文档边界

SceneDocument 是平台唯一持久化合同，完整定义见 `contracts/scene-document.md` 和
`contracts/scene-document.schema.json`。

### 资产不可变

- 每个资产通过 SHA-256 内容哈希识别具体版本。
- 替换文件会创建新资产版本，不覆盖旧哈希。
- glTF 内部节点使用该资产版本中的全局 node index 引用，不使用名称或“第一个匹配”。
- 资产版本变化时，旧 node index 不自动猜测迁移；Studio 显示重新映射任务。

### 场景实体与资产节点

- Entity 表达场景组合：Group 或 Asset Instance。
- Target 表达可绑定和可选择的业务目标，可以指向整个 Entity 或具体 glTF node index。
- Target 拥有稳定 ID；Binding 只引用 Target ID，不直接引用 Three.js 节点。
- 同一个资产可实例化多次，每个实例下的 Target 独立。

## 6. 文档生命周期

```text
File / URL / Archive
        ↓
Parse JSON
        ↓
Schema validation
        ↓
Semantic validation
        ↓
Resolve assets and hashes
        ↓
Build candidate runtime
        ↓
Atomic swap with current runtime
        ↓
Dispose previous runtime
```

解析、验证、资产解析或运行时构建任一步骤失败，都不得破坏当前有效场景。

### 语义验证

- ID 唯一且引用存在。
- Entity 层级无循环。
- Asset Entity 必须引用资产。
- Target 的 node index 必须存在于指定资产版本。
- Binding 的 Target、DataSource 和 RuleSet 必须存在。
- 同一 Target 属性不能由多个启用 Binding 无序写入。
- 规则优先级和 fallback 必须能产生确定性结果。
- SceneDocument 不包含已知凭据字段或运行时值。

## 7. Editor 命令模型

所有持久化修改通过命令执行：

```ts
interface DocumentCommand {
  id: string;
  label: string;
  apply(document: SceneDocument): SceneDocument;
  revert(document: SceneDocument): SceneDocument;
  mergeWith?(next: DocumentCommand): DocumentCommand | null;
}
```

- 指针拖动期间更新临时预览，结束时提交单个 TransformCommand。
- 连续文本输入可在时间窗口内合并，失焦时形成命令边界。
- 删除不弹确认框，但必须保存完整可恢复快照供 Undo。
- 导入资产是事务命令；失败不进入历史。
- Run 模式禁止发出 DocumentCommand。

## 8. 规则执行

规则引擎输入包括绑定值、质量和连接状态，输出仅为声明式效果。

### 确定性原则

1. 数据路径使用 RFC 6901 JSON Pointer。
2. 规则按 `priority` 降序、规则 ID 升序计算。
3. 每个 Binding 对目标属性拥有唯一写权限。
4. 第一个匹配规则生效；没有匹配时使用 fallback。
5. 同一文档和数据快照必须产生相同结果。
6. 不执行 `eval`、Function、用户脚本、模板 HTML 或动态模块。

### 效果类型

- Color：目标材质状态色，不修改源材质定义。
- Visibility：运行时可见性。
- Label：纯文本模板，不渲染不可信 HTML。
- Alarm：生成运行时告警事件，宿主决定是否持久化或确认。
- Animation：选择 glTF 中已存在的动画 clip 并控制播放状态。

Label 只允许 `{{value}}`、`{{quality}}`、`{{connection}}` 和 `{{sourceTime}}` 四个 token。
未知 token 是规则验证错误；所有替换结果按纯文本处理。

告警实例使用 `(targetId, bindingId, ruleId)` 作为运行时键：首次匹配产生 `opened`，级别或
消息变化产生 `updated`，规则不再匹配或 `level=none` 产生 `cleared`。同一状态的重复 Patch
不重复发告警事件；确认状态属于宿主业务，不进入 Runtime。

## 9. 数据流

```text
Host secrets/config
        ↓
DataAdapter.start()
        ↓
Snapshot / Patch / Connection envelope
        ↓
Ordering + validation + stale timer
        ↓
Runtime value store
        ↓
Affected bindings only
        ↓
Rule evaluation
        ↓
Render-state projection + host events
```

- 高频 Patch 在一帧内可以合并，但必须保留每个 JSON Pointer 的最后值。
- 规则执行只处理受变更路径影响的 Binding，不全量扫描场景。
- UI 状态更新和 Three.js 投影使用同一个规范化结果，避免状态色与告警不一致。
- 断线后保留最后快照并进入 stale；超过阈值进入 offline。
- 重连必须先接收新 streamId 的 Snapshot，再接受该流的 Patch。

## 10. Viewer 生命周期

```text
created → loading → ready → updating → disposed
                    ↘ error (recoverable by load)
```

- `load` 是事务操作，允许从 error 或 ready 重新加载。
- `dispose` 幂等，释放 RAF、事件监听、控制器、材质、几何缓存和适配器订阅。
- ResizeObserver 负责容器变化；Viewer 不读取全局窗口尺寸作为布局来源。
- 相机聚焦动画可被下一次输入、选择或 `focusEntity` 调用打断。
- Viewer 不渲染宿主设备面板、告警历史或权限 UI。

公共接口见 `contracts/viewer-api.md`。

## 11. 本地项目和发布

### Studio 本地存储

- IndexedDB 保存项目元数据、SceneDocument 和资产 Blob。
- 本地项目变更使用单调递增 revision。
- 浏览器存储不足时，在写入前报告并保持旧版本。
- 自动保存不替代显式 Export；用户可清理本地项目和资产。

### 导出归档

```text
project-name.scene.zip
├── manifest.json
├── scene.json
└── assets/
    ├── <sha256>.glb
    └── ...
```

`manifest.json` 保存归档格式版本、SceneDocument 版本、入口文件、资产哈希和生成时间。
归档不包含数据源 URL、令牌、运行时快照、Studio 会话状态和告警历史。

Manifest 的机器合同见 `contracts/archive-manifest.md` 和
`contracts/archive-manifest.schema.json`。

### 静态托管

解压后的文件可以放入任意静态服务器。宿主应用通过场景 URL和 `assetResolver` 定位资源，
并按 DataSource ID 注入运行时适配器。

## 12. 安全边界

- 所有 JSON 和 glTF 输入在进入有效状态前验证。
- 不执行归档中的脚本、HTML、插件或动态 import。
- ZIP 解压限制文件总数、单文件大小、总展开大小和相对路径，防止 zip bomb 与路径穿越。
- URI 默认只允许同源、Blob 和显式允许的 HTTPS 域；禁止 `javascript:`。
- 数据源认证由宿主应用提供，错误日志做字段级脱敏。
- Label 和 Annotation 只传递文本/contentKey，富文本由宿主可信组件渲染。
- Viewer 不发送设备控制命令。

## 13. 故障与诊断

诊断项具有稳定代码、严重度、来源、实体/资源引用、消息和建议动作。

```text
ASSET_HASH_MISMATCH
ASSET_NODE_MISSING
DOCUMENT_VERSION_UNSUPPORTED
DOCUMENT_REFERENCE_INVALID
DATASOURCE_CONNECTION_FAILED
DATASOURCE_PATCH_OUT_OF_ORDER
RULE_EVALUATION_FAILED
RENDERER_CONTEXT_LOST
```

错误日志采用平坦格式，例如：

```text
viewer_error code=ASSET_NODE_MISSING entity=press-01 target=press-door node_index=7
```

## 14. 性能策略

- 只在画面、相机、动画或绑定结果变化时请求渲染；Run 模式动画场景才持续 RAF。
- 限制 pixel ratio，默认不超过 2，并允许宿主覆盖。
- 静态重复对象通过实例化批处理，但保持 Target 到 instanceId 的可逆拾取映射。
- 材质状态使用共享变体和有限缓存，避免每次数据更新创建新材质。
- 资产按内容哈希缓存；同一资产的多个实例复用几何、纹理和动画数据。
- 大纹理、过多材质、过高三角面和 draw call 在导入摘要中预警。
- 性能基准与预算见 `validation-plan.md`。

## 15. 测试边界

- document：Schema、语义验证、迁移、命令往返、序列化确定性。
- runtime：规则引擎、数据顺序、stale/offline、实体投影、生命周期释放。
- react：属性更新、事件、ref 命令、卸载清理。
- studio：关键用户流程、Undo/Redo、导入失败不破坏当前项目。
- Studio Run：adapter、规则、告警、选择联动、断线恢复和 transient state 清理。
- contract：Studio Run 与发布 Viewer 对同一 fixture 的输出一致性。
- visual/performance：Playwright 截图、Canvas 像素检查和固定场景基准。

## 16. 明确延后

- 服务端存储、账号和协作。
- 数据源插件动态加载。
- glTF 资产自动猜测迁移。
- 任意脚本规则。
- 真实 IoT/PLC 连接和设备控制。
- 物理引擎、流程优化和仿真求解。
