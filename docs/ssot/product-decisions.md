# 产品决策记录

> 状态：Accepted for MVP
> 初始日期：2026-07-13
> 当前产品拓扑：2026-07-15 由 `specs/005-single-studio-data-binding` 修订
> 适用范围：产品设计与 MVP 实现

## PD-001：主要目标用户

**决策：** 主要用户是需要交付 Web 3D 业务功能的前端工程师和解决方案工程师，
不是工厂操作员或专业 3D 设计师。

**理由：** 求职目标要求项目能体现通用前端工程能力，具体行业宿主 UI 不应主导平台内核。

## PD-002：产品定位

**决策：** 产品是数据驱动的 Web 3D 场景搭建与嵌入平台，不是在线建模器、游戏引擎
或工业 IoT 后端。

**理由：** 通用场景编辑器已有成熟竞品，数据绑定和可嵌入运行时才是本项目的有效切口。

## PD-003：产品表面

**决策：** Studio 是唯一用户可见产品前端；Viewer Runtime 和 React Wrapper 是独立可复用
库边界，不是第二个产品应用。

- Studio 负责本地项目、场景编辑、数据绑定、规则和 Run 预览。
- Viewer Runtime 负责加载、解释、渲染和宿主事件。
- React Wrapper 提供声明式集成与命令句柄。
- 发布与嵌入能力通过 feature 008 的最小宿主示例验收。

**Supersession：** 2026-07-13 的原决策包含独立 Factory Demo。feature 005 认定双应用和双端口
会分裂主流程，因此将其退役。Factory 的通用 adapter、规则、告警和 WebGL 证据必须先迁入
Studio Run 与自动化测试，不能通过直接删除降低覆盖。替代浏览器证据于 2026-07-15 通过后，
原应用、第二 dev server 和产品偏好 key 已删除。

## PD-004：运行时框架边界

**决策：** Viewer Runtime 基于 TypeScript 和 Three.js，公开框架无关的容器式 API；
React Wrapper 只负责生命周期、属性同步和命令句柄。

**理由：** 宿主不应被迫采用 React，Studio 也不得通过私有 Three.js 对象绕开公共合同。

## PD-005：本地优先

**决策：** Studio MVP 使用浏览器本地存储和文件导入导出，不实现账号和云项目服务。

**理由：** 本地优先足以验证场景生产链路，并避免把后端账号系统带入当前核心问题。

## PD-006：发布产物

**决策：** Studio 输出标准 ZIP 归档，包含 `manifest.json`、`scene.json` 和 `assets/`；
feature 008 再定义发布页面和最小嵌入宿主。

**理由：** 版本化静态产物可审查、可缓存、可自托管，也不要求平台服务持有用户资产。

## PD-007：实时数据与凭据

**决策：** SceneDocument 只保存逻辑 DataSource 描述，不保存 token、认证 Header 或运行时
payload。凭据和 adapter 实例由 Run 会话或外部宿主注入。

**理由：** 场景归档必须可安全共享，运行时状态与持久化合同必须分离。

## PD-008：数据路径和规则

**决策：** 数据路径使用 RFC 6901 JSON Pointer；规则保持声明式、确定性且不执行用户脚本。

**理由：** 避免点号路径歧义、保证确定性，并缩小嵌入场景的安全面。

## PD-009：参考资产策略

**决策：** 固定 M0 工厂 GLB、manifest、SceneDocument、生成器和许可证保留在
`tests/fixtures/m0-factory/`，作为真实文件、节点映射、archive 和 runtime 的确定性 oracle。
生成的 GLB 使用 CC0-1.0；平台与生成器代码使用 MIT。

**理由：** fixture 的字节、SHA-256 和节点索引已有回归价值，但不再代表独立产品表面。

## PD-010：响应式范围

**决策：** Studio 支持宽度不低于 1280px 的桌面环境；发布 Viewer 的平板与桌面范围在
feature 008 验收。更窄设备不提供完整编辑能力。

**理由：** 复杂场景编辑需要稳定的多面板尺寸，强行压缩到手机会损害核心工作流。

## PD-011：首版数据适配器

**决策：** feature 005 先完成 Mock 数据 authoring 和 Run 闭环；WebSocket 保留为后续 adapter
扩展，REST 轮询继续保留为 Could。

**理由：** 先用确定性输入证明编辑、保存、规则和运行语义，避免把连接配置问题混入首个闭环。

## PD-012：求职交付标准

**决策：** 完整交付必须同时包含在线 Studio、开源仓库、架构文档、协议文档、自动化测试、
性能基准和一条可复现的嵌入教程。

**理由：** 单张效果图或单一 3D 场景无法证明产品工程能力。

## PD-013：后续里程碑所有权

**决策：** feature 005 先闭合数据绑定；006 只负责布局；007 只负责热点与交互；008 负责
发布与嵌入；009 负责性能、可用性和开源门禁。

**理由：** 将 authoring、interaction、distribution 和 release evidence 分开验收，避免临时
演示壳或跨层捷径重新成为产品结构。

## PD-014：主题感知场景背景与 1.1 迁移

**决策：** Feature 004A 不占用既定 Feature 007。SceneDocument 升级为 1.1.0，并以 required
`environment.backgroundMode: theme | custom` 区分宿主主题解析和固定 authored color。新场景默认
theme；所有旧 1.0.0 数据迁为 custom 并实际重写 IndexedDB/导入结果。

**理由：** 单一颜色无法区分“跟随主题”和“用户恰好选择同色”。显式 mode 可以保证自定义颜色
不被主题切换覆盖，并让 JSON/ZIP 在不同宿主中保留确定语义；真实迁移避免长期兼容分支进入业务
路径。
