# 产品与工程验证计划

> 状态：Accepted for MVP
> 日期：2026-07-13
> 单 Studio 修订：2026-07-15

## 1. 语义 Oracle

以下不变量是判断实现是否正确的权威标准：

1. 相同 SceneDocument 和数据快照在 Studio Run 与 Viewer 中产生相同规则结果。
2. 运行时选择、相机、遥测、连接和告警实例不写回持久化文档。
3. 导出导入后，稳定 ID、资产哈希、层级、变换、绑定和规则语义不变。
4. 旧连接的延迟 Patch 不得覆盖重连后的 Snapshot。
5. 数据断线只延迟显示状态，不得改变文档或宿主业务数据。
6. 资产节点含义不通过名称、顺序或 first-available 回退猜测。
7. Viewer 事件只暴露领域 ID，不泄露可变 Three.js 对象。
8. 行业 fixture、运行时值和宿主面板不会进入通用 SceneDocument 领域模型。

## 2. 产品可用性验证

### 参与者

- 5 名有 React/TypeScript 经验的前端工程师。
- 至少 2 名没有 Three.js 项目经验。
- 至少 1 名有 Web 3D 或数据可视化经验。
- 项目作者不计入参与者。

### 测试任务

| Task | 任务                                  | 成功条件                              |
| ---- | ------------------------------------- | ------------------------------------- |
| U-01 | 从 README 启动在线或本地产品          | 无口头帮助进入 Studio                 |
| U-02 | 在 Studio 导入提供的 GLB 并创建实例   | 能定位 Import、理解摘要并完成确认     |
| U-03 | 将设备绑定到状态路径并配置 fault 规则 | 正确使用 JSON Pointer，并看到测试结果 |
| U-04 | 导出场景并在独立 React 示例中加载     | 15 分钟内完成，Viewer 状态与预览一致  |
| U-05 | 找到并修复一个无效 Target 引用        | 能通过 Diagnostics 定位实体和原因     |

### 成功门槛

- 5 人中至少 4 人无需主持人代操作完成 U-01 至 U-04。
- U-04 完成时间中位数不超过 15 分钟。
- 至少 4 人能正确解释 SceneDocument 与实时数据的区别。
- 所有阻塞问题在发布前修复；非阻塞问题进入公开 backlog。

### 证据

- 脱敏任务记录、完成时间、错误路径和参与者反馈。
- 每项任务的成功/失败矩阵。
- 修改前后流程截图或录屏。
- 不把作者自测当作外部可用性证据。

## 3. 固定性能基准

### 参考设备

- 最低桌面档：Intel Core i5 11th Gen、Intel Iris Xe、16 GB RAM。
- 主浏览器：当前稳定版 Chrome，1920 x 1080，devicePixelRatio 1。
- 补充浏览器：当前稳定版 Firefox 和 Safari。
- 实际测试必须记录具体 CPU、GPU、内存、OS、浏览器版本和电源模式。

### 基准场景

| 维度          | 固定负载                                 |
| ------------- | ---------------------------------------- |
| 实体          | 300                                      |
| 可绑定 Target | 150                                      |
| 活动 Binding  | 100                                      |
| 唯一三角面    | 180,000 至 200,000                       |
| Draw calls    | 不超过 120                               |
| 资产压缩大小  | 12 至 15 MB                              |
| 数据更新      | 每秒 200 个 Patch，分布在 100 个 Pointer |
| 告警状态      | 10 个同时活动告警                        |

### 性能门槛

| 指标           | 门槛                                              | 测量方式                    |
| -------------- | ------------------------------------------------- | --------------------------- |
| 稳态帧率       | median >= 60 FPS，1% low >= 30 FPS                | 固定相机轨迹 60 秒          |
| 选择反馈       | p95 < 100ms                                       | 指针事件到选择轮廓绘制      |
| 数据到画面     | p95 < 100ms                                       | Envelope 接受到规则效果绘制 |
| 缓存后场景激活 | p95 < 2s                                          | 已下载资产到 ready 事件     |
| 长时稳定性     | 30 分钟无持续内存增长                             | 固定更新负载和相机轨迹      |
| 卸载释放       | Viewer dispose 后无 RAF、Socket 和 ResizeObserver | 浏览器性能和测试探针        |

CI 的软件渲染结果只用于回归比较，不替代参考设备上的 GPU 证据。

## 4. 契约验证

- 使用 AJV draft-2020 验证所有 SceneDocument fixtures。
- 对 ID 重复、循环层级、缺失资产、错误 node index 和 Binding 冲突做语义测试。
- 对每个 schemaVersion 保存 gold fixture 和迁移/拒绝结果。
- 用相同 fixture 对比 Studio Run 与 Viewer 的规范化 render state。
- 对 Snapshot/Patch 流做重复、乱序、旧 stream 和重连测试。
- 对 Viewer 公共事件做 API contract tests，禁止出现 Object3D。

## 5. UI 与交互验证

- Playwright 覆盖导入、选择、变换、Undo/Redo、绑定、Run、Export 和嵌入流程。
- 桌面视口：1440 x 900、1920 x 1080。
- Studio 视口：1280 x 720、1440 x 900、1920 x 1080。
- 发布 Viewer 平板视口由 feature 008 在 768 x 1024、1024 x 768 验收。
- 截图检查文字裁切、面板重叠、Canvas 空白、选择轮廓和状态色。
- Canvas 像素检查确认非空，并对主对象包围区域设置最低非背景像素比例。
- 键盘测试覆盖场景树、工具栏、检查器、对话框和 Diagnostics。
- reduced motion 模式验证相机和状态过渡不会产生持续动画。

## 6. 安全验证

- ZIP 路径穿越、zip bomb、超大文件和文件数量限制测试。
- `javascript:`、未允许跨域 URI 和哈希不匹配测试。
- Label、Annotation 和错误消息的 HTML 注入测试。
- 日志脱敏测试，保证 URL 查询、Header、Token 和数据 payload 不输出。
- Viewer 不存在设备控制或任意脚本执行接口。

## 7. 资产验证

- glTF Validator 无错误；警告必须有书面裁决。
- node manifest 与资产索引一致。
- 三角面、材质、纹理、文件大小和 draw call 不超预算。
- 正面、45 度和俯视预览图通过人工检查。
- Viewer 在桌面和平板 framing 正确，动画无穿模。
- 许可证和生成脚本随资产存在。

## 8. 发布门禁

| Gate        | 必须证据                                          |
| ----------- | ------------------------------------------------- |
| Product     | 外部任务测试达到成功门槛，未解决问题有明确裁决    |
| Contract    | Schema、语义、迁移和 Editor/Viewer 一致性测试通过 |
| Runtime     | 数据乱序、断线、恢复、dispose 和事件合同测试通过  |
| UI          | Playwright 流程、截图、Canvas 像素和键盘验证通过  |
| Performance | 参考设备基准记录通过，不使用 CI 软件渲染替代      |
| Assets      | GLB、manifest、预算、截图和许可证完整             |
| Open source | README、架构、集成教程、许可证和在线演示可访问    |
