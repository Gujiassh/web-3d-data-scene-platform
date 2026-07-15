# MVP 交付计划

> 状态：Current roadmap
> 初始日期：2026-07-13
> 路线修订：2026-07-15，由 `../005-single-studio-data-binding/spec.md` 接管单 Studio 主线
> 说明：使用里程碑和质量门禁，不承诺未经验证的日期。

## 已完成基础

### M0：垂直合同切片

> 状态：Completed and accepted locally on 2026-07-14

交付了 SceneDocument 1.0.0、独立验证、Three.js Runtime、React Wrapper、Mock 数据顺序、
规则/告警、真实 GLB node mapping 和浏览器 WebGL 证据。原浏览器证据包含独立 Factory host；
该事实保留在 `docs/ssot/m0-verification.md`，通用证据已由 feature 005 迁入 Studio Run，原
host 已删除。

### M1：Studio 编辑闭环

> 状态：Completed and accepted locally on 2026-07-14；实施规格见
> `../002-m1-studio-editing/spec.md`

交付了本地项目、IndexedDB 资产、事务模型导入、场景树、选择与变换、锁定/隐藏/复制/删除、
命令历史、autosave 和 JSON/ZIP 往返。完整证据见 `docs/ssot/m1-verification.md`。

### 横切能力 003/004

中英文界面、主题和场景命名已完成历史验收。其 Factory-specific 证据仍是当时有效事实，但
Factory 产品表面由 feature 005 supersede；Studio 的 i18n/theme/naming 合同继续有效。

## 005：单 Studio 数据绑定

> 状态：Implemented and locally verified on 2026-07-15；规格见
> `../005-single-studio-data-binding/spec.md`

### 交付

- Studio 成为唯一产品前端，Edit 与 Run 使用同一项目、SceneDocument、Viewer 和选择上下文。
- 为导入资产根 Target 编辑稳定 business ID。
- 创建确定性 Mock source，从 sample payload 选择规范 RFC 6901 pointer。
- 创建 Binding，并编辑 equality -> color/optional alarm 规则。
- Studio Run 显示连接、当前值、颜色、告警和诊断，退出时清理 transient state。
- Factory 通用 runtime/theme/i18n/WebGL 证据已迁入 Studio；legacy app 和第二 server 已删除。
- 固定 M0 GLB/SceneDocument/manifest 迁为 `tests/fixtures/m0-factory`，不进入 Studio production build。

### 退出门禁

- feature 005 的 FR-001 至 FR-018、NFR-001 至 NFR-006 和 SC-001 至 SC-006 全部有证据。
- `SceneDocument 1.0.0` 和 archive shape 零字段变化。
- Mock update 到可见 color/alarm 的固定场景响应不超过 100ms。
- Edit/Run、locale 和 theme 循环不重复 Viewer、adapter、timer、listener 或事件。
- 根开发命令只启动 Studio strict port 4173，仓库没有 active Factory package/port/server 引用。

## 006：场景布局

### 所有权

006 只负责空间组织和编辑效率，不扩展 data-source/runtime 合同。

### 交付

- Group 创建、层级 reparent 和多实体布局。
- 网格、轴向、角度和连接点吸附。
- 对齐、分布、复制布局和稳定 pivot/transform 反馈。
- 大纲树与视口对层级、选择、锁定和撤销保持一致。

### 退出门禁

- 每个布局修改是可撤销、可重做、可 autosave 的原子 DocumentCommand。
- 不通过名称、遍历顺序或 first-available 推断层级/Target 含义。
- 1280x720 和 1440x900 的主要布局流程无溢出或控件遮挡。

## 007：热点与交互

### 所有权

007 只负责精确表面目标、标注和声明式交互，不实现任意脚本或宿主业务路由。

### 交付

- 选择明确 glTF node/surface 并创建稳定 Target/热点。
- 3D Annotation、可访问替代列表和热点检查器。
- 持久化声明式 click/selection action，使用稳定 ID 和受限 action type。
- Edit authoring、Run preview 和 Viewer 事件保持同一语义。

### 退出门禁

- 热点不依赖节点名称猜测，资产版本变化时显式报告重新映射。
- action 不执行用户脚本，不把宿主路由或运行时选择写入 SceneDocument。
- 键盘和非 Canvas 路径可以定位同一热点。

## 008：发布与嵌入

### 所有权

008 负责分发产物、公共 API、宿主集成和静态部署，不重新引入行业 dashboard 产品。

### 交付

- 发布前校验、版本化 archive/static bundle 和可复现产物 metadata。
- framework-neutral Runtime 与 React Wrapper 的发布边界。
- 一个最小宿主示例，证明 load、adapter 注入、selection event 和 focus command。
- 静态托管、CSP、asset resolver 和 15 分钟嵌入教程。

### 退出门禁

- Studio Run 与最小宿主对同一 document/snapshot 产生相同规范化结果。
- 发布产物不包含凭据、runtime payload、当前选择或告警实例。
- 新开发者可按文档在 15 分钟内完成嵌入任务。

## 009：性能、可用性与开源发布

### 所有权

009 负责证据和发布质量，不用优化口号替代固定基准，也不新增未验证产品范围。

### 交付

- 固定参考设备、场景、数据负载和可复现 benchmark 报告。
- Chromium、Firefox 和 Safari 的目标流程与兼容性记录。
- 3 至 5 名目标开发者的任务测试和修正记录。
- 在线 Studio、README、架构/协议/教程、贡献说明、许可证和 release packaging。

### 退出门禁

- `validation-plan.md` 的 Product、Contract、Runtime、UI、Performance、Assets 和 Open source gates
  全部通过或有明确阻塞裁决。
- 不把 CI 软件渲染结果伪装成参考硬件 GPU 结论。
- 仓库中不存在来源或许可证不明的资产。

## 需求映射

| 阶段 | 主要责任                                                    |
| ---- | ----------------------------------------------------------- |
| M0   | SceneDocument、Runtime、React Wrapper 和真实 WebGL 合同基础 |
| M1   | FR-001 至 FR-005、FR-010 的 Studio 编辑与往返基础           |
| 005  | FR-006 至 FR-009、FR-012 至 FR-013；单 Studio 数据运行闭环  |
| 006  | FR-003、FR-004、FR-101；布局和层级扩展                      |
| 007  | FR-102、FR-103；热点、标注和声明式交互                      |
| 008  | FR-011、FR-106；发布产物和嵌入证明                          |
| 009  | NFR-001 至 NFR-009；性能、可用性和开源门禁                  |

## 不提前进入的工作

- 005 未通过前不扩展高级布局、node/surface hotspot 或任意 action。
- 006 未通过前不让热点 authoring 绕过稳定 Target/transform 边界。
- 007 未通过前不把临时 Studio 内部状态包装成发布合同。
- 008 未通过前不宣称 15 分钟嵌入、跨框架发布或静态部署已经完成。
- 009 未通过前不宣称产品满足性能、外部可用性或生产发布门槛。
- MVP 发布前不实现账号、协作、插件市场、真实工业协议、设备控制或物理仿真。
