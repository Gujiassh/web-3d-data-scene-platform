# 发布与嵌入

> 状态：Feature 008 实现与自动化 Critical 验收已完成；T045 外部计时或本次 Owner Waiver、T046 交付关闭待完成
>
> 日期：2026-07-20

## 稳定裁决

- 发布是新分发产物，不改 SceneDocument 1.4、ProjectRecord、IndexedDB、autosave 或既有 project archive 1.0。
- `@web3d/publish` 负责 readiness、严格 manifest、确定性静态文件/ZIP 和静态 loader；不创建 Three.js Viewer。
- Runtime 继续负责几何、Surface hotspot resolution、adapter 与交互；React 只包装同一个 Runtime。
- Legacy hotspot、缺失/过期/未解析的 Surface evidence、坏资产或非 current document 都阻止发布。
- manifest 只声明文件哈希、data source/adapter 需求和 trusted-content key，不携带凭据、endpoint、实时 payload、
  当前选择、告警实例或 host content value。
- 最小宿主位于 `examples/`，证明公共集成边界，不成为第二个 Studio、产品前端或行业 dashboard。
- Feature 008 不做 npm release；Feature 009 负责 release packaging、跨浏览器与外部开发者发布门禁。

## Studio 发布边界

- 工具栏提供独立 Publish 命令，发布成功下载 `.web3d.zip`，不调用现有 `markExported`，也不写 ProjectRecord。
- Studio 从当前 AuthoringScene handle 逐个读取 Surface hotspot view state，并绑定当前 document ID/revision；缺失证据由
  publish readiness 阻断，不猜测 Runtime 状态。
- blocker 只通过稳定 code 映射成本地化修复提示；UI 不展示 annotation ID、asset ID、路径或 resolver 原始错误。
- checking、blocked、failed、published 都是瞬态 UI；关闭、Escape、项目/revision 变化或组件卸载会中止当前任务。
- Publish 对话框接入既有 modal shortcut gate，打开期间全局撤销/重做与编辑快捷键不执行。

## 最小宿主边界

- `examples/minimal-host` 是 framework-neutral Runtime 集成样例，不导入 Studio，不保存项目，也不复制编辑能力。
- 宿主先用 `loadPublishedScene` 校验 manifest/scene，再把同一个 document 与 verified AssetResolver 交给 Runtime。
- fixture 生成器复用仓库内 CC0 工厂 GLB，重复生成并比较 exploded files/ZIP；report 不含时间戳。
- manifest 只声明 `factory-telemetry/mock` 与 `inspection-card`；adapter 实例、endpoint、payload 和 trusted content
  value 均由宿主本地提供。
- 生产验证器检查 ZIP/exploded parity、loader round-trip、真实 GLB hash、无内联脚本与 emitted JS 无
  `eval`/`new Function`。
- dev/preview 对缺失 `/published/*` 返回 404，不允许 SPA fallback 把缺失 bundle 路径伪装成 HTML 200。
- 静态托管必须通过响应头发送 CSP；`frame-ancestors` 不能只依赖 meta CSP。

## 关键 Oracle

1. 相同输入跨重复运行产生 byte-identical manifest、静态文件和 ZIP。
2. 发布成功、拒绝、失败或取消都不改变 document/save/history/export/runtime state。
3. 静态 loader 在 Runtime 激活前完成 manifest、scene 和 asset 完整性验证。
4. Studio Run 与最小宿主消费同一 canonical document 和 adapter 语义。
5. 宿主映射 trusted content，发布产物不持久化宿主值。

## 自动化验收

- Studio Run 与 minimal host 读取 byte-identical `scene.json`，并达到同一 normalized ready Runtime snapshot：
  document/revision 相同、无选择、`factory-telemetry=online`、零告警。
- Studio 侧同时验证两条 binding 均为 `ready/Good`、零诊断和 ready 绿色 Canvas；这避免用文档常量掩盖仍在
  `Connecting/Bad` 的 Runtime。
- publish-host Chromium 4/4 通过：1280x720、1440x900 桌面交互/CSP/静态路径和 390x844 移动布局均无
  page/console error；viewer-origin selection、API-origin focus/selection 与 trusted content 映射均通过。
- 聚焦 publish/Runtime/React/host 测试 12 文件 / 88 测试，全仓 Vitest 116 文件 / 765 测试；typecheck、ESLint、
  recursive build、i18n、design、topology、Prettier 和 diff 门禁通过。
- fixture ZIP SHA-256 为 `a769c6a4b75af84876c8f18fd9167e1eafa3cfd78968695372ecbbbabafe4ded`；生产
  loader/ZIP parity、JSON/GLB MIME、缺失路径 404 与 2 个 emitted JS no-eval 检查通过。
- T044 Critical reverse review 对目标、时序、架构、data/save 合约、public API、host-only 值、CSP/static path、
  TS/import 和测试诚实性均判定 pass。

## 下一步

T040-T044 已完成。T045 必须记录真实 15 分钟外部开发者结果，或取得本次明确 Owner Waiver 且保留未验证风险；
不得复用 Feature 007 waiver 或编造计时。随后完成 T046 的 commit/push 和 delivery ledger，Feature 009 才可开始。
