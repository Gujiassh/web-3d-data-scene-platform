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

### 004A：主题感知场景背景

> 状态：Implemented and accepted on 2026-07-16；规格见
> `../004a-theme-aware-scene-background/spec.md`

004A 修订 Feature 004 的场景背景隔离规则，但不占用已分配给热点与交互的 Feature 007。当前
SceneDocument 升级为 1.1.0，以显式 `theme | custom` 模式区分宿主主题解析和固定 authored color；
旧 1.0.0 项目、JSON 和 ZIP 必须真实迁移，不能只在渲染层兼容。

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

## 006A：编辑易用性与场景灯光

> 状态：006A.1/006A.2/006A.3 accepted；产品规格见
> `../006a-studio-usability-lighting/spec.md`。用户已批准 `SceneDocument 1.1.0 -> 1.2.0`、
> `environment.lighting` 和真实 IndexedDB 数据迁移。

### 所有权

006A 是已验收 006 的后续子阶段，负责现有编辑能力的可发现性、变换回正、拖拽智能对齐和场景级
外观设置。它不占用 007 热点与交互编号，不把 Studio 扩展成建模器，也不引入任意灯光实体。

### 交付

- 006A.1：先统一变换命令不变量，在工具 tooltip 和双语 Help 中公开快捷键，并交付角度输入和回正。
- 006A.2：交付可关闭、可临时绕过且带 world-bounds 边缘/中心参考线的确定性智能对齐。
- 006A.3：在 Scene settings 中统一背景、既有网格开关和一组易用的场景级 fill/key 灯光。
- 灯光值随场景、JSON 和 ZIP 持久化；编辑器快捷键、snap 偏好和 preview 继续留在本地表现层。

### 退出门禁

- 新用户无需外部文档即可在两分钟内完成工具切换、一次智能对齐、旋转回正和 Undo。
- reset/snap/environment 的 accepted/no-op/rejected 命令、revision、history 和 autosave 语义有直接证据。
- 旧项目迁移后的首帧灯光与当前固定 Runtime 灯光一致，IndexedDB/JSON/ZIP 只产出 current schema。
- 1280x720 与 1440x900 的中英文、明暗主题 Help/Scene settings/Canvas 无重叠和裁切。

### 后续产品表面调整

2026-07-16 根据实际使用反馈精简 Studio：Scene settings 与应用 Settings 移到 Help 旁；语言和主题只在
应用 Settings 管理；Project menu 不再重复设置入口。Object inspector 只保留对象信息、数据与精简
Hierarchy，暂不公开 Transform、Arrange、Transform snap、anchor snap 和 Spatial status。没有真实诊断时
底部 Diagnostics 不渲染。底层 transform/layout/smart-align contracts 与 tests 保留，下一阶段的灯光实体
直接复用 scene tree、selection、TransformControls、DocumentCommand 和 persistence，不重新造编辑链路。

## 007：热点与交互

> 状态：2026-07-19 完成；T044 因代表用户不可得由项目所有者明确 Owner Waiver，未证明的可用性风险转入 009

### 所有权

007 只负责精确表面目标、标注和声明式交互，不实现任意脚本或宿主业务路由。

### 交付

- 点击明确的受支持 glTF node/surface 并创建稳定 Surface hotspot；不自动创建或猜测 Target。
- 3D Annotation、可访问替代列表和热点检查器。
- 持久化声明式 click/selection action，使用稳定 ID 和受限 action type。
- Edit authoring、Run preview 和 Viewer 事件保持同一语义。

### 退出门禁

- 热点不依赖节点名称猜测，资产版本变化时显式报告重新映射。
- action 不执行用户脚本，不把宿主路由或运行时选择写入 SceneDocument。
- 键盘和非 Canvas 路径可以定位同一热点。
- 自动化生产验收与 Critical reverse review 通过；Owner Waiver 允许推进，但不视为真实用户可用性证据。

## 008：发布与嵌入

> 状态：2026-07-20 完成；自动化 Critical 验收通过，T045 外部计时由明确 Owner Waiver 关闭并将风险转入 009

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

> 状态：2026-07-21 工程实现完成，本地 release candidate；外部生产声明仍 blocked。Owner 明确要求把 90 m2
> 全屋智能参考内容作为 clean-profile 默认体验，同时保持核心合同领域中立

### 所有权

009 负责证据和发布质量，不用优化口号替代固定基准。2026-07-20 Owner 明确扩展本阶段范围：使用其提供的
`smart_home_90sqm` 资产建立 clean-profile 默认参考工程和状态绑定；该内容只能作为模板复用现有合同，不得把
房间、设备能力或实时状态写入通用领域模型。

### 交付

- 固定参考设备、场景、数据负载和可复现 benchmark 报告。
- 一个可编辑、可运行的全屋智能默认参考工程，证明真实家居资产布局与状态绑定，不改变保存合同。
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
| 006A | 006 后续编辑易用性、智能对齐和场景外观                      |
| 007  | FR-102、FR-103；热点、标注和声明式交互                      |
| 008  | FR-011、FR-106；发布产物和嵌入证明                          |
| 009  | NFR-001 至 NFR-009；性能、可用性和开源门禁                  |

## 不提前进入的工作

- 005 未通过前不扩展高级布局、node/surface hotspot 或任意 action。
- 006 未通过前不让热点 authoring 绕过稳定 Target/transform 边界。
- 006A 未通过前不继续 007 热点实现，避免在不可发现的编辑基础上叠加新 authoring 流程。
- 007 未通过前不把临时 Studio 内部状态包装成发布合同。
- 008 未通过前不宣称 15 分钟嵌入、跨框架发布或静态部署已经完成。
- 009 未通过前不宣称产品满足性能、外部可用性或生产发布门槛。当前工程门禁通过或有明确 blocker/waiver，
  但 Iris Xe、稳定 Firefox、真实 Safari、E3 参与者、owner asset redistribution、npm/GitHub/Pages 和 push
  authorization 仍未满足。
- MVP 发布前不实现账号、协作、插件市场、真实工业协议、设备控制或物理仿真。
