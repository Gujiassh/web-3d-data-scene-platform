# MVP 交付计划

> 状态：Accepted for MVP
> 说明：使用里程碑和质量门禁，不在产品设计阶段承诺未经验证的日期。

## M0：垂直合同切片

> 状态：Completed and accepted locally on 2026-07-14

### 交付

- pnpm workspace 和基础质量命令。
- document、runtime、react、studio、factory-demo 最小边界。
- 一个 GLB、两个 Target、一个 Mock 数据源和三种状态规则。
- SceneDocument Schema、示例文档和语义验证。
- 独立 Viewer 加载、选择、聚焦和 dispose。

### 退出门禁

- [x] Studio Run 与独立 Viewer 使用同一 fixture、runtime 和规则语义得到相同结果。
- [x] 无效文档、资产哈希错误和失败的替换加载不破坏当前 Viewer。
- [x] React Demo 只通过 `@web3d/react` 和公开 Runtime API 集成。

### 验收记录

- 36 个 Vitest tests 覆盖文档、规则、数据顺序、资源失败路径和 Viewer 生命周期。
- 4 个 Playwright Chromium tests 覆盖真实 WebGL、选择、聚焦、完整遥测周期、桌面/平板、
  StrictMode timer、Studio 窄屏门禁和 context restore。
- `format:check`、lint、typecheck、unit、E2E、build 和 product-design verifier 全部通过。
- 完整证据、构建基线和未完成发布门禁见 `docs/ssot/m0-verification.md`。

## M1：Studio 编辑闭环

> 状态：Completed and accepted locally on 2026-07-14；实施规格见
> `../002-m1-studio-editing/spec.md`

### 交付

- 本地项目和 IndexedDB 资产存储。
- GLB/GLTF 导入摘要和事务导入。
- 场景树、选择、变换、锁定、隐藏、复制和删除。
- 命令历史、Undo/Redo 和 dirty 状态。
- JSON/ZIP 导入导出。

### 退出门禁

- [x] FR-001 至 FR-005 的验收场景通过。
- [x] 导出导入往返一致。
- [x] 导入失败和存储不足不会损坏旧项目。

### 验收记录

- 104 个 Vitest tests 覆盖文档命令、项目原子保存、autosave、GLTF inspection、归档安全、
  authoring runtime 和 M0 行为。
- 7 个 Playwright Chromium tests 覆盖 M0 Factory、Studio 窄屏门禁和完整 M1 编辑、保存、
  导入导出与失败恢复流程。
- JSON/ZIP 下载产物经机器解析，canonical local document diff 为零，资产 SHA-256 与长度一致。
- 独立数据合同和 frontend/runtime review findings 已全部关闭；完整证据与限制见
  `docs/ssot/m1-verification.md`。

## M2：数据绑定与运行时

### 交付

- Mock 和 WebSocket DataAdapter。
- Snapshot/Patch 顺序、stale/offline 和恢复。
- 数据路径浏览、Binding 和声明式规则编辑。
- Run 模式、Diagnostics 和 Viewer 宿主事件。

### 退出门禁

- FR-006 至 FR-011 的验收场景通过。
- 旧 stream Patch 不覆盖恢复后的 Snapshot。
- 运行时状态不污染 SceneDocument。

## M3：Factory Demo 与视觉完成

### 交付

- 程序化工厂资产、manifest、许可和验证结果。
- 独立 Factory Demo 宿主。
- KPI、设备列表、详情、告警和模拟控制。
- Viewer 平板布局、状态语义和相机定位。

### 退出门禁

- FR-012、FR-013 和产品交互设计通过。
- Canvas 截图和像素检查覆盖桌面/平板。
- 工厂状态不进入平台核心领域模型。

## M4：性能与开源发布

### 交付

- 固定性能场景和基准报告。
- 外部开发者可用性测试和修正记录。
- 在线 Studio、Factory Demo 和最小嵌入示例。
- README、架构、协议、教程、贡献说明和许可证。

### 退出门禁

- `validation-plan.md` 的所有发布门禁均通过。
- 新开发者可以在 15 分钟内完成嵌入任务。
- 仓库中不存在来源或许可证不明的资产。

## 需求映射

| 里程碑 | 主要需求                         |
| ------ | -------------------------------- |
| M0     | FR-006、FR-007、FR-010、FR-011   |
| M1     | FR-001 至 FR-005、FR-010         |
| M2     | FR-006 至 FR-011、FR-013         |
| M3     | FR-012、FR-013、FR-101 至 FR-106 |
| M4     | NFR-001 至 NFR-009、开源交付标准 |

## 不提前进入的工作

- M0 已通过；M1 只进入已定义的 Studio 编辑闭环，不扩展真实协议、物理或游戏范围。
- M1 未通过前不引入更多 DataAdapter。
- M2 未通过前不制作完整工厂和复杂动画。
- M3 未通过前不宣传性能或可用性结论。
- MVP 发布前不实现账号、协作、插件市场和真实工业协议。
