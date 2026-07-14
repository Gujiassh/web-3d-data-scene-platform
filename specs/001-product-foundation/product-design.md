# 产品与交互设计

> 状态：Accepted for MVP
> 日期：2026-07-13
> 对应需求：FR-001 至 FR-013、NFR-001、NFR-007、NFR-008

## 1. 产品结构

### Studio

桌面端场景生产工具，包含项目管理、资产、场景树、3D 视口、属性、数据绑定、规则、
诊断和运行预览。

### Viewer Runtime

不带固定业务面板的 3D 运行时。宿主应用决定导航、设备详情、告警列表和其他业务 UI，
Viewer 只提供场景、选择、聚焦、数据和诊断接口。

### React Wrapper

将 Viewer 生命周期映射为 React 组件和命令句柄，不重新定义运行时语义。

### Factory Demo

一个独立宿主应用，组合 Viewer、设备列表、KPI、告警和模拟数据。它证明嵌入能力，
不作为 Studio 内置页面。

## 2. Studio 信息架构

```text
Project
├── Assets
│   ├── Imported models
│   └── Environment resources
├── Scene
│   ├── Entity hierarchy
│   ├── Views / camera bookmarks
│   └── Annotations
├── Data
│   ├── Data sources
│   ├── Bindings
│   └── Rules
├── Preview
│   ├── Runtime state
│   └── Alarm events
└── Diagnostics
    ├── Assets
    ├── Data connections
    ├── Rules
    └── Rendering
```

## 3. Studio 工作区布局

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Project  Undo Redo  Select Move Rotate Scale  Edit|Run  Export  Preview │
├──────────────┬───────────────────────────────────────┬───────────────────┤
│ Assets       │                                       │ Properties        │
│ Scene        │              3D Viewport              │ Data              │
│              │                                       │ Rules             │
│              │                                       │ Annotation        │
├──────────────┴───────────────────────────────────────┴───────────────────┤
│ Diagnostics: Assets | Connections | Rules | Performance                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 稳定尺寸

- 顶部工具栏：48px，高度固定。
- 左侧导航：280px，允许在 240 至 400px 之间调整。
- 右侧检查器：320px，允许在 280 至 440px 之间调整。
- 底部诊断区：折叠时 32px，展开时默认 180px。
- 视口最小有效尺寸：640 x 480px。
- 图标按钮：32 x 32px；工具栏命令不得因标签变化而改变尺寸。

面板是工作区区域，不使用浮动卡片；属性组使用分隔线和可折叠区块，视觉表面嵌套不超过
两层。

### 项目入口和本地保存

- Studio 启动后直接打开最近项目；没有最近项目时进入可立即导入模型的空工作区，
  不展示营销首页。
- 顶部 Project 菜单提供 New、Open Local、Import Archive、Recent 和 Delete Local。
- 每次 DocumentCommand 后 500ms 自动保存到 IndexedDB；`Cmd/Ctrl+S` 立即 flush。
- 顶部状态明确区分 `Saving`、`Saved locally` 和 `Save failed`。
- Export 状态与本地保存分离；本地 revision 高于最近导出 revision 时显示 `Export outdated`。
- 切换项目时如果本地保存成功，不弹确认框；保存失败或仍有未 flush 命令时必须阻止
  静默切换，并提供 Retry 或 Export recovery copy。

## 4. 导航与模式

### Edit 模式

- 允许改变 SceneDocument。
- 数据适配器默认暂停，用户可打开绑定测试快照。
- 选择实体后显示 Transform、Metadata、Data 和 Rules。
- 所有持久化变化进入命令历史并标记项目为 dirty。

### Run 模式

- SceneDocument 只读。
- 启动已配置的数据适配器和规则执行。
- 显示运行时状态、告警和连接健康度。
- 相机和当前选择属于会话状态，不进入保存文档。
- 返回 Edit 模式时恢复编辑选择，但丢弃运行时瞬时状态。

### Preview

在独立浏览器标签加载真实 Viewer 和当前导出快照，用于发现 Studio 内预览无法暴露的
集成差异。

## 5. 核心交互

### 导入模型

1. 用户从 Asset 面板执行 Import。
2. 文件先完成类型、大小和 GLTF 结构校验，不立即修改当前项目。
3. 校验通过后显示导入摘要：节点数、网格数、材质数、三角面和警告。
4. 用户确认后写入本地资产库，并在场景根创建资产实例。
5. 校验失败时保留当前项目，错误定位到文件和原因。

### 选择与变换

- 单击视口或场景树选择一个实体。
- `Shift` 单击进行多选；多选属性仅显示可共同编辑的字段。
- Move、Rotate、Scale 使用图标工具和 `W`、`E`、`R` 快捷键。
- `F` 聚焦选择；`Esc` 清除选择或取消当前变换。
- 变换拖拽期间只更新预览；释放指针后生成一个可撤销命令。
- 锁定实体不显示变换手柄，隐藏实体仍可从场景树恢复。

### 数据绑定

1. 用户选择实体并打开 Data 标签。
2. 选择逻辑数据源 ID，再从最新快照树中选择 JSON Pointer。
3. 系统显示当前值、质量和更新时间，但不写入文档。
4. 用户选择目标属性并配置规则。
5. 系统阻止同一实体目标属性出现未排序的冲突规则。

### 规则编辑

- 每条规则包含条件、效果、优先级和可选 fallback。
- 条件使用结构化控件，不提供脚本输入框。
- 状态颜色使用色板；告警级别使用枚举菜单；可见性使用开关。
- 输入测试值时，视口显示临时结果，关闭测试后恢复编辑状态。
- 无法求值的规则进入 Diagnostics，不静默忽略。

### 导出与发布

1. Export 前执行引用、规则、版本和缺失资产检查。
2. 阻塞错误必须修复；非阻塞警告允许用户带警告导出。
3. 输出 ZIP 包含清单、场景和资产，不包含数据凭据或运行时快照。
4. Studio 显示产物版本、文件大小和内容哈希。

## 6. 命令与快捷键

| 命令                               | 快捷键                            |
| ---------------------------------- | --------------------------------- |
| Undo / Redo                        | `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` |
| Select / Move / Rotate / Scale     | `Q` / `W` / `E` / `R`             |
| Focus selection                    | `F`                               |
| Duplicate                          | `Cmd/Ctrl+D`                      |
| Delete                             | `Delete`，需要可撤销，不弹确认框  |
| Save local snapshot                | `Cmd/Ctrl+S`                      |
| Clear selection / cancel operation | `Esc`                             |

快捷键在文本输入和组合框聚焦时不得触发场景命令。所有图标按钮提供 tooltip 和可访问名称。

## 7. 状态设计

| 状态            | 3D 视口                     | 2D UI                       | 用户可执行动作         |
| --------------- | --------------------------- | --------------------------- | ---------------------- |
| 空项目          | 工程网格和原点              | Asset 面板提供 Import       | 导入模型、打开项目     |
| 模型加载中      | 保留当前场景，不显示半成品  | 文件级进度和取消            | 取消导入               |
| 模型失败        | 当前场景不变                | 错误进入 Diagnostics        | 查看原因、重试其他文件 |
| 数据 Connecting | 保持设计外观                | 数据源显示 connecting       | 停止连接               |
| 数据 Online     | 应用规则                    | 显示更新时间和质量          | 查看绑定、进入 Run     |
| 数据 Stale      | 保留最后值并增加 stale 标识 | 显示持续时间                | 重连、检查数据源       |
| 数据 Offline    | 应用显式 offline 效果       | 显示断线原因                | 重连、停止             |
| 规则错误        | 使用 fallback 或设计外观    | 指向规则和实体              | 编辑规则、测试值       |
| WebGL 不可用    | 不创建 Canvas               | 显示兼容性错误              | 查看要求               |
| 本地保存等待    | 正常编辑                    | 显示 Saving，不阻塞继续编辑 | 立即保存、继续编辑     |
| 本地保存失败    | 正常编辑                    | 显示 Save failed 和原因     | 重试、导出恢复副本     |
| 导出已过期      | 正常编辑                    | 显示 Export outdated        | 导出新归档             |

状态不能只依赖颜色。故障、陈旧、离线和错误必须同时使用图标、文本或图案。

## 8. Factory Demo 信息架构

```text
Factory Demo
├── Overview KPIs
├── Equipment list / filters
├── 3D Viewer
├── Selected equipment details
├── Alarm feed
└── Simulation controls
```

- Viewer 是主工作区，不放入装饰卡片。
- 左侧设备列表和右侧详情是可折叠停靠面板。
- KPI 使用紧凑数据条，不使用营销式大数字卡片墙。
- 告警点击调用 `focusEntity`，Viewer 选择事件驱动宿主详情面板。
- 模拟控制仅包含播放、暂停、速度和注入故障，不暴露平台内部调试开关。

## 9. 视觉规范

### 方向

采用明亮、克制的工程工作台风格：浅中性表面、深色文本、青绿色主操作、蓝色选择、
安全黄警告和红色故障。界面不能呈现为深色科幻控制台，也不使用渐变光球或装饰性卡片。

### 色彩令牌

| Token           | Value     | 用途               |
| --------------- | --------- | ------------------ |
| `canvas`        | `#F4F6F5` | 视口和页面底色     |
| `surface`       | `#FFFFFF` | 工具栏和面板       |
| `surface-muted` | `#E8ECE9` | 选项区和禁用区域   |
| `ink`           | `#18201D` | 主文本             |
| `ink-muted`     | `#5B6762` | 辅助文本           |
| `border`        | `#C9D1CD` | 分隔线和控件边界   |
| `accent`        | `#0B6E69` | 主命令和激活状态   |
| `selection`     | `#2D6CDF` | 选择轮廓和变换手柄 |
| `success`       | `#2E7D4D` | 正常和恢复         |
| `warning`       | `#A96800` | 陈旧和警告         |
| `danger`        | `#B93632` | 故障和阻塞错误     |

颜色需通过最终组件对比度测试后才能冻结；以上值是实现基线。

### 字体与密度

- UI：IBM Plex Sans，正文 13px，控件 12px，面板标题 13px/600。
- 数据与路径：IBM Plex Mono，12px。
- 字号不随视口宽度缩放，字距为 0。
- 基础间距为 4px，常用间距为 8、12、16、24px。
- 圆角默认为 4px，菜单和对话框最大 6px。

## 10. 动效与反馈

- Hover/focus：120ms。
- 面板和菜单：180ms。
- 相机聚焦：240ms，必须可被新输入打断。
- 告警定位不得闪烁整屏；使用轮廓、图标和一次性 240ms 聚焦过渡。
- 运行状态变化不使用无限脉冲；故障可使用低频边框提示，并尊重 reduced motion。
- 加载进度只在可测量时使用进度条，否则使用稳定尺寸的忙碌指示器。

## 11. 响应式和可访问性

- Studio 在低于 1280px 时显示尺寸要求，不提供压缩的完整编辑布局。
- Viewer 在 768px 至 1279px 保持完整 Canvas，宿主面板变为抽屉。
- Viewer 的 Canvas 使用稳定 `aspect-ratio` 或填充明确容器，不由内容改变尺寸。
- 场景树支持键盘上下移动、展开、选择、重命名和删除。
- 控件满足 WCAG 2.2 AA 的键盘、焦点和文本对比要求。
- 重要状态同时提供文本；Canvas 中的对象信息可从宿主列表或场景树访问。
- `prefers-reduced-motion` 下移除非必要动效，并将相机过渡缩短为近即时切换。

## 12. 设计验收

- 三条 PRD 用户流程在上述信息架构中均有唯一、连续路径。
- Edit 和 Run 模式对持久化状态的权限无歧义。
- 空、加载、失败、断线、陈旧、恢复和版本错误均有明确反馈。
- 工厂宿主 UI 不进入 Viewer Runtime 的固定接口或场景文档。
- 所有常用命令既能通过 UI 完成，也有键盘访问路径。
- 视觉层级不超过两层表面，不出现卡片嵌套和不必要说明模块。
