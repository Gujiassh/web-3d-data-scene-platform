# 发布与嵌入

> 状态：Feature 008 publish package 与 Studio 集成已完成；minimal host 待实现
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

## 关键 Oracle

1. 相同输入跨重复运行产生 byte-identical manifest、静态文件和 ZIP。
2. 发布成功、拒绝、失败或取消都不改变 document/save/history/export/runtime state。
3. 静态 loader 在 Runtime 激活前完成 manifest、scene 和 asset 完整性验证。
4. Studio Run 与最小宿主消费同一 canonical document 和 adapter 语义。
5. 宿主映射 trusted content，发布产物不持久化宿主值。

## 下一步

`@web3d/publish` 已交付 exact readiness、严格 manifest/schema、确定性静态文件/ZIP 和 abortable loader；Studio
已接入独立发布服务、本地化状态与 exact Runtime Surface evidence。真实 Chromium 已验证确定性 bundle 的
manifest/scene/GLB、Legacy 阻断与 in-flight cancel，三条路径均保持 document/history/save/export/selection/runtime
可见状态不变。下一步实现 minimal host、真实发布 fixture、CSP/静态托管教程和最终 Critical 验收。
