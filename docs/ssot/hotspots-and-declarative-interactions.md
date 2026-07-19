# 热点与声明式交互

> 状态：SceneDocument 1.4、Runtime/React、Studio、自动化生产验收与 Critical reverse review 已完成；真实五用户可用性验收待执行
>
> 校准日期：2026-07-18
>
> 当前生产合同：SceneDocument 1.4.0

## 当前裁决

- 用户面向的 Hotspot 复用现有 Annotation，不增加平行集合。
- 创建主流程是 `H -> 点击受支持模型表面 -> 邻近单行标题 -> Enter`，确认前不改文档。
- 新 Surface anchor 只使用精确 Asset entity、asset hash、glTF node index、node-local point/normal。
- 旧 Annotation 迁为 opaque Legacy anchor，不解释旧 `localOffset` 坐标系；显式 Reposition 才转 Surface。
- 一个热点只有一个声明式行为：展示内容、聚焦自身、聚焦既有 Target、打开绝对 HTTPS 链接。
- 链接必须以精确的小写 `https://` 开头，不要求输入等于 URL parser 的 canonical `href`；大写 scheme、HTTP、
  relative、credentials 和超长输入均拒绝，Runtime 复用 Document 的同一校验 helper。
- 不允许脚本、Action JSON、宿主路由、自动 Target、名称/顺序/nearest/first-available 猜测。
- 不设产品数量上限。200 个首屏可见 Surface 热点只是固定性能基线，不是容量。

## 交互与模块边界

- Runtime 专用 surface index 负责 exact rigid node resolution 和受支持表面判断。
- Runtime 专用 overlay controller 负责动态 InstancedMesh、DOM button proxies、投影、遮挡、拾取和资源释放。
- Runtime interaction/action controller 负责 transient session、放置/重定位和四种受限激活。
- Studio 负责命令、标题 editor、popover、Hotspots list、Inspector、焦点和双语反馈。
- `three-scene-viewport.ts` 只负责 authority、render scheduling 和 controller lifecycle 转发，不吸收热点策略。
- Runtime-only selection、hover、draft、session、occlusion、action result 和 host content 不进入 SceneDocument。

V1 遮挡只把可见 opaque depth-writing geometry 当作遮挡物；transparent、transmission、`depthWrite=false`、
zero-opacity 或 invisible material 不隐藏 marker/DOM proxy。

## 校准事实

固定 fixture SHA-256：`3958d1fb5060a36a9e0db7374a6361abdc61770f74114c296418fab047485e4a`。

硬件环境：Windows Chrome 150、RTX 3090、ANGLE D3D11、1440x900 DPR1。主要结果：

- 200 热点完整 CPU frame work p95 `1.00ms`，零热点 p95 `0.30ms`，增量 `0.70ms`；
- 呈现 RAF interval p95 `16.80ms`，大于 `25ms` 的 dropped interval 为 0；
- GPU timer p95 `1.71ms`；
- projection/occlusion p95 `0.70ms`，DOM/marker update p95 `0.70ms`；
- marker picking p95 `0.10ms`，300/300 ID 正确；
- 真实 Playwright pointer event 到后续 Chrome Paint p95 `0.836ms`；330 组 mark/Paint correlation 持久化后，
  去掉 30 条 warmup 可独立重算得到相同结果；
- 200/200 marker、DOM proxy 和 Canvas pixel location；DOM projection error 小于 `0.001px`；
- 50 组 opaque 遮挡/可见配对、300 帧零闪烁、rigid transform 翻转和 camera hidden->visible；
- edit-idle、placement-disabled、Run 各 2 秒 surface placement raycast 增量 0；
- 错误 entity/hash/node 三种 anchor 均 unresolved、无 DOM、无 WebGL pick；
- 5 次 create/update/dispose 后 scene/DOM/geometry/texture baseline 完全恢复，listener/session/RAF 为 0，
  GC 后 heap delta 为 0；
- long task 0，Chrome trace 每个 120 帧窗口 style/layout 各 1 次，artifact 绑定全部 harness source hash。

完整摘要、raw samples、raw trace events、fixture 与双截图位于 `artifacts/performance/007-hotspot-*`。

## 数据与批准边界

SceneDocument 1.4、migration、commands、IndexedDB rewrite、JSON/ZIP current-only export 已于 2026-07-18 获得明确
实施批准，CHK032 已关闭；实现与真实 Chromium 迁移/回滚验收已通过，1.4.0 现为生产权威。

批准后必须真实刷写旧 ProjectRecord，不能只在前端/Runtime 做兼容。任一记录解析、验证或写入失败，整个
transaction 回滚；已是 current 的 record 字节保持不变，重写旧 record 的 `lastExportedRevision` 置 null。

## 验收与下一步

1. T010-T043 与 T045-T047 已完成：热点聚焦测试 17 文件 / 158 测试、全仓 109 文件 / 728 测试、热点 Chromium
   21/21、原生 IndexedDB 4/4、生产性能 wiring 5/5 和完整串行门禁均通过；九张双语/双主题/双视口截图及哈希已保留。
2. T044 仍需五名未使用过该功能的 solution engineer 按 `usability-protocol.md` 完成真实录屏或观察记录；五人
   必须全部首次无协助通过，中位创建不超过 12 秒、重定位不超过 5 秒。
3. 独立 Critical reverse review 已无 P0-P2 发现并关闭 T046；Feature 007 只剩 T044，必须完成后才能正式通过。
4. T047 已准备 Feature 008 handoff：必须复用 SceneDocument 1.4、同一 Runtime controllers 和四动作解释器，只新增 publish
   readiness、宿主 trusted-content 映射与 embed 集成；unresolved hotspot 是否阻止发布由 Feature 008 明确负责。
   按 delivery plan，在 Feature 007 通过 T044 前不得开始 publishing-contract 实施。
5. 若后续需要改变持久化含义、保存语义、archive container、ProjectRecord、anchor、action set 或数量策略，
   必须先重新取得明确批准。
