# Research: 中英文界面国际化

## Typed catalog without a third-party dependency

- **Decision**: 用英文 catalog 推导递归结构，中文 catalog 以同结构类型声明；组件通过 app-local
  context 读取完整 catalog 与格式化器。
- **Rationale**: 当前只有两个 locale、两个小型应用；TypeScript 可在编译期发现缺 key，不引入
  ICU runtime、异步词典或额外 bundle。
- **Alternatives considered**: `react-i18next` / `FormatJS`。它们适合更多语言和复杂复数规则，但
  当前范围会增加配置和运行时成本。

## Locale selection and persistence

- **Decision**: 只接受 `en` 和 `zh-CN`；保存值优先，其次扫描 `navigator.languages`，任意 `zh`、
  `zh-CN`、`zh-Hans` 归一化为 `zh-CN`，最终回退英文。Studio 与 Factory 使用不同 storage key。
- **Rationale**: 两个应用可能独立部署在不同 origin，也可能由同一 origin 托管；独立偏好避免
  演示应用互相污染，同时保持规则可预测。
- **Alternatives considered**: URL locale、服务端 profile。当前是静态前端，没有路由或账户系统。

## Runtime accessibility

- **Decision**: `CreateViewerOptions` 接受可选 `canvasLabel`，Viewer 暴露 `setCanvasLabel(label)`；
  React wrapper 在 prop 变化时调用 setter。
- **Rationale**: Canvas 由 runtime 创建，宿主无法可靠声明其 aria label；setter 可以更新现有 DOM
  节点，避免因 locale 变化重建 WebGLRenderer。
- **Alternatives considered**: 只给外层 section 加 label，或把 locale 传入 runtime。前者未覆盖可
  聚焦 Canvas，后者会让 domain-neutral runtime 依赖应用语言。

## Factory business presentation

- **Decision**: 设备元数据存稳定 translation key；连接/设备状态按协议枚举映射；已知 demo 告警
  按稳定 `ruleId` 映射，未知 alarm message 原样显示。
- **Rationale**: UI 能翻译演示内容，同时避免 name-as-ID、英文 message 猜测或修改 telemetry。
- **Alternatives considered**: 翻译所有 `alarm.message` 或改 SceneDocument rule message。两者都会
  破坏诊断原义或 canonical document 不变性。

## Locale-aware formatting

- **Decision**: 日期、整数、字节统一通过当前 locale 的 `Intl` formatter；ID、revision 数字、
  quaternion、hash、pointer 与格式名保持 locale-neutral。
- **Rationale**: 人类阅读的数据遵循语言习惯，技术标识保持可复制和跨语言一致。
- **Alternatives considered**: 全部数字本地化。会改变技术值的显示和现有自动化选择器。
