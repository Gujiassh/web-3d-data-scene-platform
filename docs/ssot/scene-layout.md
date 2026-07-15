# Scene Layout

> 状态：Implemented and Accepted
> 实施日期：2026-07-16
> 持久化合同：`SceneDocument 1.0.0`、archive manifest/ZIP 与 `ProjectRecord` shape 不变

## 当前产品事实

Feature 006 在单一 Studio 内提供场景层级组织和确定性空间布局，不引入第二个前端、服务或端口。
用户通过 Scene Tree 的稳定 entity ID 多选对象，在 Inspector 中执行 Group、显式 reparent、bounds
对齐、equal-clear-gap 分布、多根偏移复制和 bounds-anchor 吸附，并通过既有 TransformControls
执行平移、旋转和缩放步进。

该功能不是浏览器建模器。自定义 pivot、持久化 sibling order、lasso、vertex/edge/surface snap、
任意多选旋转/缩放、连接点语义、物理和自动 packing 均不属于 Feature 006。bounds anchor 只是
`{entityId, anchorKind}` transient 几何引用，不从名称、metadata、Target 或 Annotation 推断业务含义。

## 所有权边界

| 层                  | 稳定职责                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/document` | 原子 Group/reparent/batch transform/multi-root duplicate、before snapshot 校验、revision/history |
| `packages/runtime`  | 受控多选投影、TransformControls、当前 world matrix/pivot/bounds 测量和 transient overlay         |
| `packages/react`    | approved handle/controlled props 转发，保持 Viewer、Canvas 和 controls 生命周期                  |
| `apps/studio`       | multi-selection/primary、selected-root reduction、world/local planning、能力状态和双语 UI        |
| `tests/e2e`         | 真实 Chromium/WebGL、公开 UI、持久化、像素、响应式、时序和 fixture oracle                        |

Studio 通过批准的 additive authoring API 使用 `selectEntities`、`setTransformSettings` 和
`getEntitySpatialSnapshots`。Canvas 的既有 `entity-selection-change` 仍只表示 viewport single/primary
选择；多选集合由 Studio session 持有。locale、theme、selection 和 transform settings 更新不得重建
Canvas。

## 层级与布局语义

- Group 和 reparent 只处理同一显式 before parent 下的 selected roots；ancestor 与 descendant 同时
  入选时只提交 ancestor root。
- reparent 目标只能是 scene root 或一个显式 unlocked Group，且必须保持 world pose。新的 local
  matrix 不能在固定 epsilon 内分解为 position/quaternion/positive scale 时，整次动作拒绝。
- lock 是 local-edit lock。locked entity 不能被直接 group/reparent/align/distribute/snap/transform；
  locked source 可以被复制，copy 继承 lock，source 不变。
- align 使用当前 visible world AABB 的 min/center/max；distribute 使用 center 加 stable ID 排序，
  固定两端并产生 equal clear gaps。名称和 document array order 都不参与语义。
- duplicate 是一个 atomic multi-root command。每个 copy 保持 source parent，只有 copied root 应用
  显式 offset；descendant local transform 保持。新 Target 不复制 `businessId`，Binding、RuleSet、
  Annotation 和 DataSource 不复制或改义。
- 每个 accepted command 产生一次 revision 和一个 history entry。Undo/Redo 使用既有完整文档恢复
  与单调 revision 规则。被 capability 拦截的 invalid target 不改变 document/revision/history。

## 变换与空间反馈

translation、rotation 和 scale step 都是 finite positive transient setting，留空表示关闭。它们只
配置当前 TransformControls，不进入 SceneDocument、project record、autosave 或 archive。

Studio 从 revision-bound spatial snapshot 构建 selection pivot、world/local proposal 和
bounds-anchor delta。空 Group 仍有 world matrix/pivot，但 `worldBounds === null`；只有依赖 bounds 的
Group pivot、align/distribute 和 anchor snap 被禁用，reparent 仍可用。动作 handler 的 revision 与
critical spatial DOM 必须在下一 `requestAnimationFrame` 前完成，固定 fixture 上限为 100ms；Canvas
readback 在该时序断言之后单独采样。

## 持久化与交换

所有 authored 结果只使用既有 Group `SceneEntity`、`parentId` 和 local TRS。以下状态递归禁止进入
document、IndexedDB `documentJson`、JSON 或 ZIP：selection/primary、transform settings、snap、anchor、
pivot、world matrix/bounds、hover、preview、Object3D、layout diagnostic 及 data-runtime transient。

浏览器验收机器比较 canonical JSON、parsed ZIP document 和 IndexedDB `documentJson`。每个
`ProjectRecord` 仍精确包含 8 个 key：`id`、`name`、`createdAt`、`updatedAt`、`lastOpenedAt`、
`lastSavedRevision`、`lastExportedRevision`、`documentJson`。JSON 和 ZIP 重导各创建独立 project，
canonical document 深等。共享 GLB 保持 1216 bytes，SHA-256 为
`e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8`。

## Browser Evidence

根级单测最终为 64 files / 325 tests。`tests/e2e/scene-layout.spec.ts` 有 7 条真实 WebGL
流程，Chromium 单 worker 最终 7/7 通过，耗时 29.2s；完整 6-worker Chromium 套件最终
18/18 通过，耗时 33.4s。场景布局浏览器证据覆盖：

- fixture ZIP import、非空 Canvas、live selection pivot/bounds、oracle world matrix 和 asset hash；
- Ctrl multi-select、Canvas single replace、Group、reparent in/out、world pose、Undo/Redo 和 invalid target no-op；
- 固定 Z-min align oracle、X equal-clear-gap distribute、重复命令 exact no-op、ancestor suppression 和
  atomic multi-root duplicate；
- locked-source copy、inherited lock、parent/target/businessId/Binding/RuleSet/Annotation 语义；
- 真实 gizmo pointer translation/rotation/scale snap、跨原点反向 scale drag no-commit、Inspector
  zero-scale reject、anchor snap、normal snapshot refresh 和 null bounds；
- Run 下 16 个 layout config control 及全部 mutation disabled，document/revision 不变；
- JSON/ZIP/IndexedDB 深等、递归 transient scan、Canvas identity、像素 delta 和零 page/console error；
- 1440x900 English/light 与 1280x720 Chinese/dark 的 overflow、region overlap 和 control clipping。

截图：

| Artifact                            | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `006-hierarchy-1440x900.png`        | `5b72b8cbf97838f3ffe56f0e088aec585d8717cf2297b8a61b318864868d8b29` |
| `006-align-distribute-1440x900.png` | `6f7330b3a8a019979cc5f56bc23adaceae9dd84a304e979d879a40e8f6a3824b` |
| `006-round-trip-1440x900.png`       | `36fdaa65da9da8b1ab64e4bd9e143313feb4ff844360561d75e99fcb94932b7f` |
| `006-snap-1280x720.png`             | `56150e6501318cb0843fdbb6bf7f6b4d068991befbc36caa2203404c268c21c3` |

## Review Closure

返工后的最终验证关闭了全部 browser finding：

- Rotate idle feedback 接受 nullable delta，真实 Y-axis pointer 提交 15-degree snap，无 page error；
- 重复 Align 和 Distribute 在当前 snapshot 下返回 unchanged，revision 保持 2，第二次导出与第一次
  accepted document 深等，fixed outer transform 保持 byte exact；
- Inspector `Scale X=0` 设置 `aria-invalid=true`，blur 后 revision/document scale 不变，恢复 accepted
  value 后无状态污染；
- anchor action 在 handler-to-next-RAF 后经历正常 target-driven snapshot refresh，source/target feedback
  仍可读且无 snapshot-unavailable；selection change 清除 anchor feedback。
- Run Inspector 使用一个内部滚动区承载 runtime preview 和 disabled layout panel，告警 focus 按钮
  不再被布局面板覆盖；真实 M2 浏览器流程验证 focus 点击和 16 个 Run-disabled layout control。
- M2 并行 E2E 从 Run 开始记录 connection status class transition，并断言有序 `offline -> online`；
  因此测试不会因执行较慢、错过短暂 recovery 窗口而把后续自然 offline 误判为恢复失败。

最终 review 分类：goal alignment、user-visible flow/timing、architecture boundaries、data/save
contracts、implementation quality、responsive/accessibility 和 verification/evolution 均为 pass。
`SceneDocument 1.0.0`、archive、ProjectRecord 和 autosave/save 语义无变化；没有未解决 finding。
