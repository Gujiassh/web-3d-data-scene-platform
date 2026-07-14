# M0 垂直合同切片验证记录

> 状态：Accepted for M0
> 验证日期：2026-07-14
> 范围：本地工程与 Chromium 浏览器闭环，不代表 MVP 发布门禁全部通过

## 1. 验证对象

M0 使用同一份确定性 `SceneDocument`、GLB 和 Mock 遥测场景验证以下边界：

- `packages/document` 只持有可序列化、领域无关的持久化合同。
- `packages/runtime` 直接管理 Three.js、资产、数据顺序、规则、告警和资源生命周期。
- `packages/react` 只负责 React 挂载、属性同步、回调转发和卸载。
- Studio 与 Factory Demo 共享合同和 runtime，但各自持有 UI 与宿主业务状态。
- Factory Demo 的设备列表、KPI、操作面板和遥测场景不进入 `SceneDocument`。

## 2. 语义 Oracle 结果

| 不变量                                                                    | M0 结果 | 证据                                                              |
| ------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Runtime-only selection、camera、telemetry、connection 和 alarm 不进入文档 | Pass    | Schema negative case、`document.test.ts`、确定性序列化测试        |
| 旧 stream 或乱序 Patch 不覆盖当前 Snapshot                                | Pass    | `value-store.test.ts` 与浏览器 recovery 流程                      |
| 资产节点不通过名称、遍历顺序或 first-available 推断                       | Pass    | SHA-256 校验、GLTFLoader associations、node index 测试            |
| Studio Run 与独立 Viewer 使用同一合同和规则语义                           | Pass    | 共享 fixture、共享 runtime、Studio/Factory Playwright 流程        |
| 无效替换加载不破坏当前 Viewer                                             | Pass    | replacement failure 与 pending generation 生命周期单测            |
| Viewer 卸载后不继续持有可见 renderer 或场景资源                           | Pass    | dispose 单测、StrictMode 浏览器计时器探针、窄屏 Viewer unmount    |
| 工厂业务状态不进入平台核心                                                | Pass    | package 依赖方向、SceneDocument fixture 和 host-local UI 状态检查 |

## 3. 自动化结果

2026-07-14 最终门禁：

| 命令                                 | 结果                     |
| ------------------------------------ | ------------------------ |
| `pnpm format:check`                  | Pass                     |
| `pnpm lint`                          | Pass                     |
| `pnpm typecheck`                     | Pass                     |
| `pnpm test`                          | Pass，8 files / 36 tests |
| `pnpm test:e2e`                      | Pass，4 Chromium tests   |
| `pnpm build`                         | Pass                     |
| `./scripts/verify-product-design.sh` | Pass                     |

TypeScript、ESLint 和两个 Vite production build 共同覆盖 TS/TSX import 与未解析标识符；
源文件静态扫描没有发现 `@ts-ignore`、`@ts-expect-error`、TODO/FIXME 或调试日志残留。

## 4. 浏览器证据

Playwright 使用隔离的本地 Vite server，`reuseExistingServer=false`，避免复用旧进程掩盖当前
代码问题。

- Factory 1440 x 900：WebGL Canvas 非空；主对象颜色和 framing 使用像素比例与包围区域
  检查，不以 grid 像素代替设备渲染证据。
- 遥测完整经过 running -> fault -> cleared -> offline -> recovered；设备状态、Canvas 状态色、
  告警列表和连接状态同步变化。
- 选择设备与点击告警都会更新宿主选择并聚焦目标；桌面和平板都检查目标未被裁切。
- Studio Inspect -> Run 会建立新的 stream，恢复后 Diagnostics 为 0。
- React StrictMode 场景在首个 Snapshot 后有 4 个当前业务计时器，完整序列结束后为 0。
- Studio 768 x 1024 显示尺寸门禁并卸载 Canvas，而不是仅用 CSS 隐藏仍在运行的 Viewer。
- Factory 768 x 1024 保留目标详情、告警、诊断和 operations rail，没有页面横向或纵向溢出。
- `WEBGL_lose_context` 验证 context loss/restore 后请求重绘，Canvas 仍保持有效内容。
- 浏览器运行期间没有未处理 `pageerror` 或 `console.error`。

本地截图位于忽略提交的 `artifacts/e2e/`：

- `factory-desktop-1440x900.png`
- `factory-fault-1440x900.png`
- `factory-offline-1440x900.png`
- `factory-tablet-768x1024.png`
- `factory-context-restored-1440x900.png`
- `studio-desktop-1440x900.png`
- `studio-size-gate-768x1024.png`

## 5. 生命周期结论

- React 每次实际 mount 创建一个新 Viewer；cleanup 只 dispose 自己创建的实例。
- wrapper 在新 Viewer generation 上重置 adapter 对照表，保证 StrictMode remount 后当前 adapters
  会重新应用。
- `load()` 和 adapter mutation 分别串行化；每个 source 的 revision 防止旧 replacement 反胜。
- 新 load 会 abort 前一个 load；Viewer 持有并释放未提交的 pending generations。
- adapter `start()` 可由 AbortSignal 中断；renderer 与 GPU 资源释放不等待慢速 `stop()` 完成。
- 资产校验失败、解析后 abort、部分 generation 失败和宿主回调抛错均有独立测试。

## 6. 构建基线

两个 app 当前共享的 `three-runtime` production chunk 约为 621 kB minified、156 kB gzip。
Vite 的 500 kB warning 保持可见，没有通过提高阈值静默隐藏。M1/M4 应结合真实加载路径和
缓存策略决定是否拆分 Three.js、controls 与 loader，不能只为消除 warning 做无证据拆包。

## 7. M0 限制与后续风险

- M0 为避免共享 material 所有权和规则覆盖不明确，拒绝两个 Target 覆盖同一个 Mesh；需要
  多个逻辑 Target 共享 renderable 的能力必须先定义效果合并和命中优先级。
- `packages/runtime/src/viewer/scene-viewer.ts` 当前 810 行，M0 行为可接受，但 M1 在继续增加
  功能前应按 Viewer lifecycle、adapter ownership 和 rendering/interaction 拆分职责。
- 当前只有 Playwright Chromium 证据，没有 Firefox、Safari 或移动浏览器证据。
- 没有在 `validation-plan.md` 指定的参考硬件和固定大场景上执行性能基准。
- 没有完成 3 至 5 名目标开发者访谈、外部任务测试或 15 分钟嵌入验证。
- ZIP 归档、安全压力测试、完整键盘可访问性和正式开源发布材料仍属于后续里程碑。

因此 M0 结论仅是“垂直合同切片实现与本地验收通过”，不是“产品已验证”或“可生产发布”。
