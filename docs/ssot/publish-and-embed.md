# 发布与嵌入

> 状态：Feature 008 publish package、Studio 与 minimal host 已完成；最终验收待执行
>
> 日期：2026-07-19

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

## 下一步

`@web3d/publish`、Studio 与 minimal host 的实现切片已完成。下一步执行 Studio Run/minimal-host snapshot parity、
双桌面尺寸 host Chromium/CSP/static-path 证据、focused/full gates、最终 Critical reverse review，并为 15 分钟外部
开发者结果取得真实证据或单独的 Owner Waiver。
