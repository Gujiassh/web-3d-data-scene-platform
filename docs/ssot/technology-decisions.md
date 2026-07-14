# M0 技术决策

> 状态：Accepted for M0
> 核验日期：2026-07-14

## 版本基线

| 能力              | 选择              | 核验版本      | 许可证     |
| ----------------- | ----------------- | ------------- | ---------- |
| Node.js           | Node 22 LTS line  | 22.22.0 local | MIT        |
| Package manager   | pnpm workspace    | 10.33.4 local | MIT        |
| Language          | TypeScript        | 6.0.3         | Apache-2.0 |
| App bundler       | Vite              | 8.1.4         | MIT        |
| UI                | React / React DOM | 19.2.7        | MIT        |
| 3D runtime        | Three.js          | 0.185.1       | MIT        |
| Three.js types    | @types/three      | 0.185.1       | MIT        |
| Schema validation | AJV               | 8.20.0        | MIT        |
| Archive codec     | fflate            | 0.8.3         | MIT        |
| Unit tests        | Vitest            | 4.1.10        | MIT        |
| Browser tests     | Playwright        | 1.61.1        | Apache-2.0 |

TypeScript 不使用当前最新 7.0.2，因为 `typescript-eslint@8.63.0` 的 peer range 是
`>=4.8.4 <6.1.0`。M0 使用 6.0.3，避免 lint 工具链处于未支持组合。

Vite 8 要求 Node `^20.19.0 || >=22.12.0`，本地 Node 22.22.0 满足要求。

## TD-001：使用 pnpm workspace，不引入 Turborepo

M0 只有三个 package 和两个 app，使用 pnpm filter/recursive scripts 足以表达依赖顺序。
在实际构建时间或任务图出现问题前不增加任务编排层。

## TD-002：Viewer 使用原生 Three.js

`packages/runtime` 直接管理 Three.js Scene、Renderer、Camera、Controls、GLTFLoader 和资源
生命周期。React 不进入 runtime，`packages/react` 只包装容器、属性同步和 dispose。

这比在 runtime 内使用 React Three Fiber 更符合框架无关 Viewer 合同，也能明确证明
Three.js 资源管理能力。

## TD-003：glTF node index 使用 loader associations

Three.js r185 的 GLTFLoader 为已加载对象维护 `parser.associations`：

```ts
const reference = gltf.parser.associations.get(object);
const nodeIndex = reference?.nodes;
```

当前 `@types/three` 同样公开该 Map 和 `GLTFReference.nodes`。Runtime 用资产内容哈希、
Asset Entity 和 node index 建立 Target 映射，不从名称、遍历顺序或第一个 Mesh 推断。

限制：associations 仅对精确资产版本有效；资产哈希变化必须重新映射，不能自动继承。
应用自行 clone Object3D 后 associations 不会自动扩展到 clone。M0 每个资产版本只激活一个
glTF scene，并在加载完成后立即建立自己的 `nodeIndex -> Object3D` Map；多场景资产和共享
资产多实例克隆留到该映射策略有独立测试后再开放。

M0 还拒绝两个 Target 的遍历范围包含同一个 Mesh。当前规则效果会隔离并修改 Target material，
如果允许父子 Target 或其他重叠 Target 同时拥有同一 renderable，效果合并、raycast 命中和
资源释放语义都会不明确。后续只有在这些优先级形成独立合同和测试后才能解除限制。

## TD-004：资产哈希使用 Web Crypto

浏览器和 Node 22 均使用 `crypto.subtle.digest("SHA-256", arrayBuffer)`。哈希计算在资产
激活前完成；M0 先在主线程处理小资产，达到可测性能瓶颈后再考虑 Worker。

## TD-005：Schema 使用 AJV draft 2020-12

- `packages/document` 使用 `Ajv2020` 在构建阶段生成 standalone ESM validator。
- JSON Schema 负责结构验证。
- 独立语义验证负责引用、层级循环、资产哈希、Target node index 和 Binding 冲突。
- 验证失败返回稳定诊断代码，不直接抛出 AJV 内部错误到 UI。

AJV 运行时编译依赖 `new Function`，会让嵌入式 Viewer 要求 CSP `unsafe-eval`。因此固定
Schema 的运行路径不得在浏览器中动态编译；生成器和 AJV 仅用于开发/构建。

## TD-006：ZIP 使用 fflate，但不进入首个 Viewer 闭环

fflate 体积小、无运行时依赖，适合浏览器 ZIP。M0 首先完成直接 SceneDocument + Asset
Resolver 加载；归档导入在合同闭环稳定后接入，避免同时调试场景解释和 ZIP 安全。

## TD-007：资源释放由 Runtime 显式负责

- Viewer 持有 RAF、ResizeObserver、DOM listener、Controls 和 adapter subscription。
- Asset cache 记录 geometry、material、texture 的引用计数。
- `dispose()` 幂等，最后一个实例释放后调用 Three.js resource dispose。
- React unmount 必须 await/触发同一 Runtime dispose 路径，不另写清理逻辑。
- M0 测试通过探针验证 dispose 后没有 RAF、监听器和 adapter 更新。

React StrictMode 开发环境会重复执行 setup/cleanup。Viewer 创建、异步 load 取消、Adapter
启动停止和 dispose 必须在该行为下保持幂等。M0 的实际策略是：

- React 每次实际 mount 创建独立 Viewer，cleanup 只释放该次创建的实例。
- 新 Viewer 创建后重置 wrapper 的 adapter 对照表，使当前 adapters 在 StrictMode remount 后
  重新应用，而不是被上一代实例的引用比较跳过。
- `load()` 与 adapter mutation 各自串行化；每个 source 使用 revision 拒绝旧异步操作反胜。
- 新 load 和 adapter replacement 使用 AbortSignal 中断旧工作，Viewer 持有并释放所有未提交
  RuntimeGeneration。
- dispose 先释放 renderer、scene、observer、listener、timer 和 animation frame，再等待可能
  很慢的 adapter `stop()`，避免外部清理延迟 GPU 资源释放。

## TD-008：测试分层

- Vitest/node：Schema、语义验证、规则、数据顺序和生命周期纯逻辑。
- Vitest/jsdom：React wrapper 挂载、属性变更和卸载。
- Playwright/Chromium：真实 WebGL、Canvas 像素、选择、聚焦和截图。
- Firefox/Safari 等跨浏览器验证在 M3/M4 执行，M0 先证明 Chromium 闭环。

2026-07-14 的 M0 门禁结果为 36 个 Vitest tests 和 4 个 Playwright Chromium tests 全部通过。
浏览器测试还覆盖状态色像素、桌面/平板 framing、StrictMode 计时器、窄屏 unmount 和 WebGL
context restore；完整证据见 `docs/ssot/m0-verification.md`。

## TD-009：M0 不使用 Rapier 和 Zustand

M0 没有物理需求。Studio 仅为合同控制台，局部 React state 足够；Zustand 在 M1 完整
编辑器出现共享命令、选择、面板和项目状态后再引入。

## TD-010：保留 Three.js chunk warning

2026-07-14 production build 中，两个 app 的 `three-runtime` chunk 都约为 621 kB minified、
156 kB gzip，超过 Vite 默认 500 kB warning。M0 保留 warning，不通过提高
`chunkSizeWarningLimit` 隐藏基线。

Three.js、OrbitControls 和 GLTFLoader 是首屏 Viewer 闭环的实际依赖。是否动态拆分必须在
M1/M4 用真实缓存、首屏和交互测量决定；当前不为消除告警引入没有运行时证据的加载复杂度。

## 核验来源

- npm registry：版本、engines、peerDependencies 和许可证。
- Three.js r185 `examples/jsm/loaders/GLTFLoader.js`：associations 和 nodes mapping。
- DefinitelyTyped `GLTFLoader.d.ts`：公开 parser/associations 类型。
- 本地 Node 22：`globalThis.crypto.subtle.digest` 可用。
- 项目合同：`specs/001-product-foundation/contracts/`。
- M0 实现证据：`docs/ssot/m0-verification.md`。
