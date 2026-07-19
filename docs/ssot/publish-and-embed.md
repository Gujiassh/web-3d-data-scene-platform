# 发布与嵌入

> 状态：Feature 008 规格完成，等待实现
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

## 关键 Oracle

1. 相同输入跨重复运行产生 byte-identical manifest、静态文件和 ZIP。
2. 发布成功、拒绝、失败或取消都不改变 document/save/history/export/runtime state。
3. 静态 loader 在 Runtime 激活前完成 manifest、scene 和 asset 完整性验证。
4. Studio Run 与最小宿主消费同一 canonical document 和 adapter 语义。
5. 宿主映射 trusted content，发布产物不持久化宿主值。

## 下一步

按 `specs/008-publish-embed/tasks.md` 实现 publish package，再接 Studio、minimal host、CSP/教程和 Critical 验收。
