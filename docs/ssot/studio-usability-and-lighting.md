# Studio Usability And Lighting

> 状态：006A.1/006A.2/006A.3/006B accepted；007a unified Settings/branding accepted；007b
> direct-manipulation save timing accepted
> 用户批准：2026-07-16 批准 006A；2026-07-17 批准完整 006B `SceneDocument 1.3.0` 合同及
> 007a non-contract Studio Shell refinement；2026-07-17 批准 007b Critical 保存时机变更

## 2026-07-16 产品表面精简

> 历史验收状态：本节记录 006A/006B 当时的双设置入口。2026-07-17 的 007a 已取代入口和组件结构；
> 当前产品事实以本文“007a 当前事实与验收”一节为准。

- Toolbar 将 `Scene settings` 与应用级 `Settings` 放在 Help 旁边。`Scene settings` 默认进入 Lighting，
  继续提供 Appearance/Lighting 两个平级页签，且只在 Edit 可用；应用级 `Settings` 在 Edit/Run 均可用，
  只管理持久化的中英文和浅色/深色偏好。Project menu 不再重复提供 Scene settings。
- Object inspector 不再渲染 Transform 表单。精简的 Hierarchy 仍提供 Group 与显式 reparent；Arrange、
  Transform snap、anchor snap 和 Spatial status 不进入产品 React 树。Run 只呈现运行数据，不渲染编辑层级。
- 底部 Diagnostics 不再使用 `document=valid storage=indexeddb authoring=ready` 空态；没有真实诊断时整个
  band 不渲染并释放占用高度，有诊断时仍显示实际消息和数量。
- 这次只改变 Studio surface。TransformControls、快捷键、DocumentCommand、layout planner、Smart Align、
  Undo/Redo 和 JSON/ZIP/IndexedDB 合同保持不变，供视口直接编辑和后续灯光实体 authoring 复用。
- 浏览器证据收敛到当前可见流程：固定 archive 往返、精简 Hierarchy 编组/reparent、Run mutation gate、
  真实 X/Y/Z/XY TransformControls、Smart Align guide、顶部设置、主题/语言持久化和场景外观。隐藏的
  arrange/snap 算法继续由 planner/command/unit tests 覆盖，不再伪装成公开 UI acceptance。
- 最终 Standard review 首轮发现应用 Settings 会提前清除 Apply 后的 `awaiting-ready` appearance preview、
  diagnostics 缺少正向 browser oracle、Object Transform 缺少明确不可达断言。返修增加 variant-aware
  `closeSceneSettingsDraftPreview`，只清 draft、不清 held preview；真实手动保存失败证明 diagnostics band、
  count 和 message；layout E2E 明确证明 Transform/Position X 不在产品树。原 reviewer 复审 PASS。
- 最终门禁：81 files / 435 unit tests、root/E2E/5 workspace TypeScript、ESLint、production build
  1917 modules、i18n、product design、single-Studio topology、Prettier、diff check 和 Chromium/WebGL 20/20
  全部通过。20 条浏览器流程以 4 workers 在 29.1s 完成。

## 产品边界

Feature 006A 是已验收 Scene Layout 的易用性后续阶段，按 006A.1 命令与回正、006A.2 智能对齐、
006A.3 场景外观顺序交付。它不实现建模、任意灯光实体、阴影、HDRI、快捷键自定义或等间距实时参考线，
也不占用 Feature 007 的热点/标注/声明式交互所有权。

Feature 006B 在该边界上新增受限的 root Point/Spot LightEntity authoring，不把环境 fill/key 变成实体，
也不引入 directional/sun、阴影、物理光强单位、建模、灯光子节点或灯光数据绑定。

## 006A.1 当前事实

### Command boundary and history

- Single and batch transforms share one invariant implementation: finite position/rotation/scale, normalized
  non-zero quaternion within the accepted tolerance, strictly positive scale, complete `before` validation and
  exact TRS no-op detection. Validation and full batch preflight finish before a new document is constructed.
- Exact no-op returns the same document/history object, adds no revision or history entry, and preserves the
  existing redo stack. Tests also prove that a stale/invalid single `before`, or a stale/invalid second batch
  item, leaves the complete document and both history stacks unchanged.
- A multi-entity transform is one command and one revision. Undo restores the exact pre-command document and
  Redo restores the exact post-command document, excluding only the intentionally monotonic revision number.
- Position, Rotation, Scale and Reset all reuse the existing `transform-entity`/`transform-entities` commands.
  Component reset preserves untouched TRS byte-exactly; multi-selection reset reduces selected roots and rejects
  hidden, locked, missing or mixed-invalid selections atomically. Local identity is position `[0,0,0]`, rotation
  `[0,0,0,1]`, scale `[1,1,1]`; it does not mean restoring the imported value.

### Canonical commands, Help and accessibility

- `Q/W/E/R`, Save, Undo/Redo, Duplicate, Delete, Focus, Clear, component reset and Help are defined by one
  canonical command registry. Keyboard resolution, platform chord labels, toolbar tooltips and bilingual Help
  consume that registry instead of duplicating command meaning.
- Resolution uses exact modifier matching. Scene commands are gated while an input/textarea/select/
  contenteditable owns focus, while a modal is open, during an active TransformControls drag, and in Run when
  the command mutates authoring state. Help remains available in Edit and Run and provides bilingual search,
  focus trap, Escape close and trigger focus restoration.
- Accessible selectors use the full canonical command name, for example `Move (W)`, `Rotate (E)` and `Scale (R)`,
  with exact matching in browser tests. A disabled reason augments the command accessible label/title; it never
  replaces or duplicates the command name.

### Transform draft and Runtime lifecycle

- Inspector presents intrinsic local XYZ degrees and converts to/from the authoritative normalized quaternion at
  the UI boundary. The display tuple derived from document TRS is the authoritative draft baseline; Euler values
  and drafts remain transient.
- Row-level string equality is the dirty gate. Untouched focus/blur and editing back to the authoritative display
  tuple dispatch nothing, including high-precision TRS rounded for display. Rotation still commits all three fields
  together. Invalid drafts remain visible with `aria-invalid=true` and dispatch nothing; rejected/stale valid
  actions restore the authoritative draft, while a new revision, selection or successful action remounts it.
- Runtime transform attachment uses effective live `Object3D` hierarchy visibility. A visible child under a hidden
  ancestor cannot attach or drag the gizmo; lock remains local, so a locked visible parent does not implicitly lock
  an unlocked child.
- Entering Run already reduces the Studio session tool to `select`. A lifecycle red test exposed a real click-to-
  effect window: the click originally recorded only `mode:run`. `App` now synchronously calls the existing
  `viewer.setTool("select")` before `setMode("run")`; Runtime detaches controls, cancels the active drag and restores
  the pre-drag Object3D. The controlled tool effect remains reconciliation, and the Canvas/Viewer is not recreated.
  No additional authoring-enabled public API or event variant was added.

### Test engineering rules

- Cross-layer React fixtures implement the complete imperative handle and use explicit existing contract types;
  `StudioSceneLayout` fixtures use `satisfies` so additive required fields fail typecheck instead of throwing later.
- Inspector row commit evidence moves focus within one row without dispatch, then leaves the row for exactly one
  command. Browser flows use Enter when the row must commit instead of relying on an intra-row Tab.
- Hidden and locked are independent transform gates. Undoing lock while the entity remains hidden must keep inputs
  disabled; undoing visibility then enables them. Runtime tests pair hidden-ancestor rejection with a locked-parent
  local-lock control case.

006A.1 不改 SceneDocument、archive、ProjectRecord、IndexedDB 或 autosave 合同。Help、shortcut、drag、
Euler draft、reset capability 和 selection 均为 transient。

## 006A.2 当前事实

### Deterministic Smart Align planner

- Runtime 在 translation `mouseDown` 冻结 revision-bound spatial snapshots 和每轴参考索引。参考集排除
  moving entity、祖先、后代及其他 selected roots/subtrees；hidden/null-bounds 不进入索引，locked reference
  仍可参与。scene origin 是独立 center target，不伪装成 entity。
- 每个 X/Y/Z 索引按 coordinate、stable entity ID、anchor relation 排序。候选查询先二分定位
  `[movingAnchor - threshold, movingAnchor + threshold]`，再只扫描范围内 anchors；最终按 absolute delta、
  entity before origin、relation rank、deeper hierarchy、stable ID 的 tuple 选择，不依赖 mutable name、
  document order 或 first available。
- 阈值由 moving bounds center 的正 camera-space depth `-z` 和 perspective camera 计算：一个 CSS pixel
  为 `2*d*tan(fov/2)/viewportCssHeight` world units，Smart Align 使用 8px。invalid/behind-camera depth、
  stale/missing snapshots 只禁用当次 smart candidate；固定 Position step 仍可继续工作。
- active TransformControls axis 冻结本次可变轴：axis handle 一轴，plane handle 两轴，free handle 三轴。
  每轴 smart candidate 优先；没有 candidate 时才按 Three.js r185 world-space
  `Math.round(world/step)*step` 回落，并通过 `parent.worldToLocal` 写回。负值和旋转/缩放 parent 已覆盖。

### Preview, guide and modifier lifecycle

- 同一 `objectChange` 先从 raw world preview 计算候选，再一次性写回 snapped transform，然后发出原有
  `transform-preview`；`mouseUp` 读取相同 Object3D 值并最多发出一个原有 `transform-commit`。没有新增
  drag event、SceneDocument command 或历史语义。
- disposable guide overlay 每轴最多一条 `LineSegments`，关闭 depth test/write 并用 paired anchor marks。
  plane/free 多轴命中时，每条 guide 的 moving endpoint 会应用其他轴的最终位移，使参考线与同帧最终
  preview 对齐。release、selection change、tool/mode change、load、cancel 和 dispose 全部清理 guide；
  hide/clear 同时 dispose 旧 geometry，而不是把无用 vertex buffer 留到会话结束。
- Alt 使用两层状态：`altPressed` 跟踪物理键，`snapBypassed` 冻结/同步当前 drag。这样一次 drag 结束不会
  伪造 Alt 已释放，持续按住 Alt 的连续拖拽仍绕过 smart 和 fixed snap；window blur 才清物理键状态。
- selection collection 只要改变就同步 TransformAuthoringController，即使 primary 不变，也会取消当前
  preview、恢复 before transform、清 guide 并按新 reference exclusion 重新附着。primary 不变时仍不
  额外发 `entity-selection-change`。

### Studio preference and package boundary

- `web3d.studio.smart-align.v1` 只存显式 boolean，missing/invalid/restricted storage 默认 `true`。
  canonical command registry 提供 exact `S`，并与 `Alt+S` reset scale、`Ctrl/Cmd+S` save 区分；同一
  registry 驱动 Help 和中英文文案。
- toolbar 的 Magnet 按钮与受控 `AuthoringScene.smartAlignEnabled` 使用同一 React preference。Run 只禁用
  按钮/快捷键，不改偏好；回到 Edit 或 reload 恢复原值。React 原位 reconcile 现有 Viewer，不重建
  Canvas、TransformControls、runtime generation 或 adapters。
- Smart Align 不进入 `useStudioSceneLayout`，不进入 SceneDocument、JSON、ZIP、ProjectRecord、IndexedDB
  documentJson、history 或 autosave。Runtime 拥有候选/相机阈值/固定回落/guide 生命周期；Studio 只拥有
  command、preference 和 UI orchestration。

### 006A.2 test and performance evidence

- Pure/runtime integration: 3 files / 53 tests cover deterministic oracle, all nine relation ranks and adjacent
  precedence, exact 8px boundary, reference
  exclusions, entity/origin/depth/ID ties, axis/plane/free mapping, smart-before-fixed, negative r185 rounding,
  transformed parent world/local conversion, stale snapshot fallback, preview/commit identity, one commit,
  consecutive Alt drags and selection/load/tool/dispose cleanup.
- 500-entity benchmark uses 500 bounded snapshots, 1,497 anchors per axis, 200 warm runs and 1,000 measured
  runs. Acceptance evidence on 2026-07-16: median `0.694ms`, p95 `1.249ms`, max `3.415ms`; p95 is below the
  approved 4ms gate.
- Real Chromium/WebGL E2E drives actual X/Y/Z axis and XY plane TransformControls pointers. The committed positions
  are X `[-0.17,0,2.25]`, Y `[-0.75,0.45,2.25]`, Z `[-0.75,0,2.21875]` and XY
  `[-0.17,0.45,2.25]`; inactive axes stay unchanged and axis-colored guide pixels disappear on release. The X
  result is distinct from the 0.5 fixed-grid value. Undo/Redo, Alt result `x=-0.27214460920524886`, preference
  reload, Run gate, stable Canvas identity and zero Smart Align leakage in JSON/ZIP/IndexedDB also pass.
- Verification process rule: `pnpm typecheck` and `pnpm build` run `packages/document` validator generation.
  Do not run either command concurrently with the Vite server used by Playwright: the generated validator is
  replaced during generation and can trigger a transient HMR module with no default export, causing unrelated
  browser actions to be dropped. Run validator-generating gates first, then Playwright. This failure mode was
  reproduced by a parallel independent review; the three affected existing flows passed immediately when rerun
  sequentially.
- Final acceptance: 79 files / 411 unit tests, root/workspace TypeScript, ESLint, production build, i18n, product
  design, single-Studio topology, Prettier and diff checks passed. Final sequential Chromium/WebGL passed 23/23.
  Independent review initially found incomplete relation-order and real multi-axis evidence plus one stale T022
  ownership label; original Runtime worker added exhaustive relation and actual X/Y/Z/XY evidence, the task mapping
  was corrected, and independent re-review returned PASS with no remaining finding.

## Review finding 裁决

- **Run retains a live gizmo**: the broad finding was rejected because `reduceStudioSession` already forces
  `select` and Runtime `setTool` already detaches/reverts. A narrower React effect timing window was proven by a
  red App lifecycle test and closed with the synchronous existing-boundary call described above.
- **Invalid draft should immediately rebound on blur**: rejected. The approved contract requires an invalid draft
  to remain visible and non-dispatching until authoritative revision/selection or a valid action rebuilds it.
- **Untouched high-precision blur emits a command**: accepted and closed by the authoritative display tuple dirty
  gate, with position, Euler projection and scale regression coverage.
- **Gizmo ignores hidden ancestors**: accepted and closed by effective hierarchy visibility at the Runtime
  authoring boundary; local lock semantics were preserved and tested separately.
- **Single/batch rejection and Undo/Redo evidence was incomplete**: accepted as an evidence finding. Production
  preflight was already atomic; stronger exact history tests close the gap without changing command semantics.

## 后续合同

006A.2 的 Smart Align 只处理 primary entity 的 world-bounds edge/center 对齐。已实现的候选 oracle、
camera threshold、TransformControls preview 和 guide lifecycle 位于独立 Runtime `smart-align` 模块；
Studio preference/orchestration 位于独立 `apps/studio/src/smart-align/` hook。继续禁止向当前 654 行的
`useStudioSceneLayout` 增加 Smart Align 规划、偏好或 guide 职责。

006A.3 当时将 SceneDocument 升级到 1.2.0，required `environment.lighting` 保存具体 fill/key 参数，不保存
preset 名称。旧 1.0/1.1 先按冻结合同完整验证，再迁移并复验 1.2；IndexedDB 全记录在一个 readwrite
transaction 中刷写，任一坏记录整笔回滚。ProjectRecord 八字段、DB version/store 和 archive container 不变。

## 006A.3 当前事实

### SceneDocument 1.2 与真实迁移

- 006A.3 验收时的 current contract 是 `SceneDocument 1.2.0`，required `environment.lighting` 只保存一组 concrete
  hemisphere fill 和 directional key；颜色必须是 canonical uppercase `#RRGGBB`，强度在 `[0,5]`，
  `directionToLight` 是误差不超过 `1e-6` 的单位向量。Standard 方向使用
  `normalize([5,10,7]) = [0.37904902178945177,0.7580980435789035,0.5306686305052324]`。
- 冻结 1.0/1.1 schema 和 standalone validator 不改。parse 先按 payload 声明版本执行旧结构与旧语义
  验证，再逐步 `1.0 -> 1.1 -> 1.2` 或 `1.1 -> 1.2`，最后按 current 复验；revision 和已有 authored
  fields 不变。旧合法 lowercase hex 只在迁移边界 canonicalize，current command 不替调用方修复输入。
- IndexedDB 仍使用 version 1 和原三 store。初始化在单个 `projects` readwrite transaction 中扫描所有
  记录，只 put JSON bytes 真正变化的 1.0/1.1 record；任一 invalid record 或 put 失败会回滚全部记录。
  ProjectRecord 的八个持久字段、metadata 时间与 save semantics 不变，同一失败 database promise 被复用。
- JSON/ZIP import 接受 1.0/1.1/1.2，业务结果与重新持久化只产出 1.2；archive container 仍是 1.0，
  manifest 的 `sceneSchemaVersion` 核对迁移前 raw `scene.json` 声明版本。preset、direction option ID 和
  preview 状态不进入 JSON、ZIP 或 IndexedDB。

### 原子命令与设置工作流（006A.3 历史验收）

- 在 006A.3 的 scene-environment authoring 范围内，Scene settings 使用扁平 Appearance/Lighting tabs。
  该独立入口后来与 application Settings 并存，并已由 007a 统一入口取代。Appearance 编辑主题跟随、
  custom color 和 grid；Lighting 提供 Standard/Soft/Contrast concrete preset、fill/key brightness、
  Standard 加八方位方向和 advanced sky/ground/key colors。Custom 只由 exact concrete value 派生。
- Apply 只发一个 `set-scene-environment` command，包含完整 before/after environment，形成一个 revision
  和一个 Undo step。命令先严格验证 exact keys、canonical color、intensity 和 unit direction，再用原始
  before 做逐字段精确 stale comparison；lowercase、比例方向、extra key 或 invalid after 原子拒绝。
- Dialog draft 与 preview 都是 transient。Cancel 立即清背景/网格/灯光 preview；changed Apply 关闭
  dialog 后仍保留完整 preview，直到 matching project/document 的 Viewer ready revision
  `>= outcome.revision` 才一起释放，防止 source reconcile 期间背景、网格或灯光短暂回跳。
- 旧的 background-only Studio dialog/preview 实现已移除；主题背景映射、project-document identity、
  complete environment draft 和 held-preview 都由 `apps/studio/src/scene-settings/` 单一模块负责。

### Runtime 原位 reconciliation 与资源控制

- Runtime 用一个 `SceneLightingController` 终身持有一盏 `HemisphereLight`、一盏 `DirectionalLight` 和其
  origin target。authored/preview 以 preview 优先在原 Three objects 上改 color/intensity/direction；
  clear 恢复最新 authored，dispose 移除完整 rig，不重建 Canvas、Viewer、generation、controls 或 adapters。
- Grid 同样分离 `authoredGrid` 与 transient override。有效可见状态未变时复用同一 `GridHelper`；关闭时
  remove 并 dispose geometry/material。背景、网格和灯光均由 Runtime/React 稳定受控 API 原位更新，
  preview 不构造临时 source，也不产生额外 ready event。
- glTF/GLB inspection 会报告 `KHR_lights_punctual` 产生的 directional/point/spot 数量；真实加载后遍历
  Three object tree，将所有 imported `Light` 从 parent 移除，并发出
  `ASSET_PUNCTUAL_LIGHTS_REMOVED` diagnostic，保证场景中只有 authored fill/key rig 生效。

### 006A.3 已有证据

- Focused integration：Document 3 files / 51 tests、Runtime/React/App 9 files / 52 tests、Studio current
  fixture 回归 8 files / 38 tests、Scene settings 4 files / 14 tests 通过；React、Studio 和 E2E TypeScript
  通过。
- Chromium/WebGL：专用 `scene-appearance.spec.ts` 1/1 通过。真实 006 Layout GLB 的 Contrast preview
  产生像素差，背景和 grid 同 draft 更新；Apply 只从 revision 1 到 2，Undo/Redo 到 3/4；Canvas identity
  始终不变，JSON/ZIP/IndexedDB 都是 concrete 1.2 且无 `preset`。既有 theme/naming/mixed migration 3/3
  同批通过。
- 第一轮 Critical review 发现 command 会 normalize invalid after/stale before，以及 archive 文档把 raw
  legacy version 写成 parsed version。原 Document worker 先复现 lowercase after 被错误接受的红测，再
  改为 strict validate + exact compare，并明确 manifest raw-version 语义；返工后 Document focused
  5 files / 81 tests、validator smoke、typecheck、lint、Prettier 和 diff check 通过。
- Final gates：80 files / 429 unit tests、root/E2E/5 workspace TypeScript、ESLint、production build
  1919 modules、i18n、product design、single-Studio topology、Prettier 和 diff check 通过。最终
  Chromium/WebGL 以 4 workers 完成 24/24；8-worker 首跑唯一 M2 Canvas 尺寸 poll 超时发生在业务步骤前，
  截图显示 Canvas 已完成渲染，单条 1/1 和 4-worker full matrix 均通过，判定为本机并发 WebGL/CPU 竞争。
- Final Critical review：Document exact command、migration/save、Runtime single rig、React/App held-preview、
  imported-light removal、preset/transient leakage、fixtures/E2E 和 SSoT 逐项复审。关闭 spec normalization
  旧表述、plan 证据过报和 T028 ownership 三项文档 finding 后，independent reviewer 返回 PASS。

## 验证

- Focused unit: 17 files / 106 tests passed, covering document, Runtime, React, session, Help, toolbar,
  TransformEditor, Inspector and Studio layout integration.
- TypeScript: root, E2E and all workspace packages passed. Typed fixtures caught and closed a literal-only tool
  mock before acceptance.
- Dedicated 006A.1 browser evidence: 2/2 passed for canonical Help/search/focus/i18n, Euler editing, atomic
  single/multi reset, Undo, Run gate and exported JSON transient scan.
- Related browser regression evidence: 3/3 passed for the M1 authoring/autosave/reload loop, real
  TransformControls translation/scale-snap pointers, explicit anchor behavior and Run layout gate.
- Final controller gates passed: 76 files / 373 unit tests, root and workspace TypeScript, ESLint, production
  build, i18n copy, product design, single-Studio topology, Prettier and `git diff --check`.
- Full Chromium/WebGL Playwright passed 21/21, including the two dedicated 006A.1 flows and every existing M0,
  M1, M2, layout, theme/naming and migration flow.
- Independent re-review closed every accepted finding and confirmed PASS. The remaining evolution risk is
  structural: 006A.2 must keep Smart Align outside `useStudioSceneLayout` and retain Run transition, hidden
  ancestor, active-drag rollback and Viewer identity regression evidence.

## 006B 当前事实

### SceneDocument 1.3 与灯光实体

- Current contract 是 `SceneDocument 1.3.0`。旧 1.2 经过冻结 structure/semantics validator 后只修改
  `schemaVersion`，不创建灯光且不改变 revision 或任何既有 authored value。JSON/ZIP 接受 1.0-1.3，
  export 只写 1.3，archive container 保持 1.0.0。
- root-only LightEntity 只支持 Point/Spot，场景最多八盏。亮度是 unitless `[0,1000]`，Point 默认 25，
  Spot 默认 10；Point 仅平移，Spot 可平移/旋转，Scale 永远不可编辑。灯光不能拥有子节点、参与
  Group/Reparent/layout 或成为 data-binding target。
- 只有 `add-light-entity`、`update-light-entity`、`remove-light-entity` 三种完整快照命令能修改灯光；generic
  entity commands 遇到灯光会原子拒绝且不清 redo。锁定灯光只允许 visibility 变化或 unlock；Duplicate
  生成 unlocked root copy，并使用确定性 `[1,0,0]` offset。
- IndexedDB version/store 和八字段 ProjectRecord shape 不变。初始化在一个 readwrite transaction 中把所有
  legacy documentJson 刷成 canonical 1.3；被重写记录的 `lastExportedRevision` 置 null，合法 current 1.3
  record bytes 保持完全一致，任一 invalid record 或 write failure 回滚全部。

### Runtime authority 与 Studio workflow

- 同 document 的纯灯光 revision 先完整验证 current 1.3，再执行 revision matrix 和 exact classifier，最后
  staged/atomic publish；Canvas、generation、assets、adapters、camera、controls、selection 和 fill/key rig
  不重建。非灯光 diff、entity reorder 或任一其他差异走 full load；stale/superseded work 不发布。
- Edit/Run 是独立于 data runtime 的受控 authoring mode。Run 同步回滚 active drag，并移除 controls、helper、
  pick proxy、overlay 和 pick surface，但保留灯光照明及 logical selection；回到 Edit 只恢复一套有效资源。
- 关键回归规则：light-only stage 不捕获 mode。staged resources 必须在 commit 时读取 viewport 当前 mode，
  否则 Edit->Run 竞态会重新发布 Edit helper。双向 deferred tests 固定 Edit->Run 无 authoring surface，
  Run->Edit 只恢复一套 helper/proxy/overlay，并复用同一 TransformControls。
- 006B 验收时的 Lighting menu 位于 Help 旁边，曾提供 Add point、Add spot、Scene lighting settings 和
  `n/8`；该 Scene lighting settings 菜单项已在 007a 删除，不能再视为当前产品入口。Add 仍依赖
  Runtime 的 finite ready creation frame，无 fallback。Object Inspector 单独管理 name、visibility、lock、
  color、brightness、range、angle 和 penumbra；中英文、键盘菜单、禁用原因与焦点恢复均有单测/E2E。
- imported glTF punctual lights 替换为 neutral Object3D，同时保留 parent slot、transform、children、parser
  associations、targets 和 post-replacement `nodesByIndex` resolution，不让资产自带灯光绕过 authored authority。

### 006B 验收证据

- Final unit: 90 files / 533 tests。Document standalone current/1.0/1.1/1.2 validator smoke 通过；root/E2E/5
  workspace TypeScript、ESLint、production build 1926 modules、i18n、product design、single-Studio topology、
  Prettier 和 diff check 全部通过。
- Chromium/WebGL full matrix 22/22 通过，包含 Lighting creation-frame/focus、Point/Spot tools、Run drag revert、
  current 1.3 JSON/ZIP/IndexedDB、006A layout/usability、theme/i18n 和 M2 data binding。
- Hardware performance acceptance 使用 Windows system Chrome 150、RTX 3090 Direct3D11、1440x900 DPR1。
  两套 fixture 的每个状态都独立记录 compile transition，再串行观察 30 warm-ups 和 300 measured events；
  mixed 4 Point/4 Spot warmed p95 为 006 `0.20ms`、PBR `0.30ms`，均低于 `33.3ms`。PBR mixed compile
  transition 的 109ms 单独记录，没有混入 warmed gate。Canvas evidence 分别有 15/108 个 sampled colors。
- Benchmark runner 对 SwiftShader/llvmpipe/unavailable、错误 viewport/DPR、fixture/state/sample shape、blank
  Canvas 和 p95 超限直接失败。默认 Linux SwiftShader 路径已证明 exit 1；RTX 3090 硬件路径 exit 0。
- First Critical review 发现 light-only mode race、软件渲染证据不满足 NFR、standalone smoke fixture 漂移和
  benchmark 不执行门限。原 Runtime owner 修复 mode authority 并补双向红测；主控修复 validator smoke、
  runner hard gates 与硬件证据。原 reviewer Nash 在 closure 阶段两次空 `completed`，因此由原文档 owner
  Boole 执行 replacement review；它确认 A-D 与 CHK038 PASS。主控补齐完整门禁和本 SSoT 写回后关闭 T033/T034。
- 剩余演进风险：`packages/runtime/src/viewer/three-scene-viewport.ts` 已达 1142 行。下一阶段若继续增加 load
  strategy，应按 full-load/light-only orchestration 与 viewport interaction responsibility 拆分；本次不在
  Critical 收尾中做跨层重构。

## 2026-07-17 007a 统一入口与品牌验收历史

用户确认 Studio Shell 只保留一个 Settings 按钮。Application 语言/主题、Scene 背景/网格与 scene-wide
Lighting 都进入同一个 modal 的平级分区；Lighting 工具菜单只保留 Add Point、Add Spot 和 `n/8`，不再重复
Scene lighting settings。对象灯光属性仍由 Object Inspector 管理，不塞进全局 Settings。

Application 偏好继续即时写入既有本地 preference；Scene/Lighting 继续复用完整 environment draft、live
preview、Cancel 回滚和一次 `set-scene-environment` Apply。Run 或无可编辑项目时只禁用 Scene/Lighting，语言与
主题仍可用。不得改变 SceneDocument 1.3、ProjectRecord、IndexedDB、archive、revision、Undo、held preview 或
Viewer identity。

> 007b supersede：上述 Scene/Lighting Apply、Discard/Cancel 回滚和 held draft 工作流只代表 007a 已验收
> 历史。统一 Settings 入口、三个平级 tab、Run/Application gate、Lighting menu 与 Offset Datum 品牌继续有效；
> 当前保存时机以本文 007b 一节为准。

统一弹窗由 settings shell、Application panel、Scene appearance panel、Scene lighting panel 和独立状态 hook
组成，`App.tsx` 只做 open/close、Viewer preview/ready 与 command wiring，不拥有具体表单逻辑。scene preview
使用 `draft` 与 `awaitingReady` 两层 transient state：新 draft 优先显示，关闭新 draft 后恢复仍在等待 matching
ready revision 的 applied preview；任何一层都不进入 document、history、autosave 或 export。

- Settings 从 Help 旁的唯一齿轮按钮打开，初始焦点落在 Application tab；Escape、关闭按钮和外部点击返回该
  Settings trigger。Application、Scene、Lighting 是三个平级 tab，不打开第二个设置 dialog。
- Application 的语言与主题在有项目、无项目、Edit 和 Run 均可用并即时持久化。Run 或无可编辑项目时 Scene
  与 Lighting tab 禁用并给出本地化原因，不影响 Application。
- Scene 与 Lighting 共享同一 complete environment draft、live preview、Discard 和一次
  `set-scene-environment` Apply；command payload、revision/Undo、save 和 Viewer identity 语义保持不变。
- Lighting menu 当前只有 Add Point、Add Spot 两个 menuitem 和非交互 `n/8` count；scene-wide fill/key
  只从统一 Settings 的 Lighting tab 编辑，对象灯光属性仍由 Object Inspector 管理。

Studio 的 Offset Datum 品牌几何使用 dark tile `#111715`、light rails `#F4F6F5` 和 teal datum
`#4CC4BA`，在左上项目入口、toolbar mark 与浏览器 favicon 保持同一识别语言。16px/24px optical geometry
兼容浅深浏览器 chrome，不以通用 Lucide cube/gear 代替。`index.html` 提供 favicon 与初始
`theme-color` metadata，应用内 theme-color 再随当前 light/dark theme 同步；不新增营销页或第二产品入口。

### 007a acceptance、review 与 verification

- 当前 unit 证据为 92 files / 542 tests；root/workspace TypeScript、ESLint、production build、i18n、product
  design、single-Studio topology、Prettier、format 与 diff checks 均通过。
- Target Chromium/WebGL E2E 6/6 通过，覆盖统一 Settings、Scene/Lighting draft/Apply、focus restoration、
  Lighting menu 两个 menuitem 以及相关 theme/naming/light-authoring 回归。
- 实际浏览器在 1440x960 验证 light English 与 dark Chinese：统一三 tab 无遮挡，metadata、favicon、toolbar
  Offset Datum mark、应用内 theme-color 同步及 Lighting menu 两项均符合当前事实。
- 独立 reviewer 的实现复核无剩余 contract/code finding；唯一 Medium 为旧双入口文档漂移，本节及
  006A plan/tasks 历史标注完成后关闭。
- 主控最终 Chromium/WebGL full E2E 22/22 通过，`test-results/.last-run.json` 为 `status=passed`。该
  full-suite 证据与上面的 targeted 6/6、1440x960 手工浏览器证据分别记录，不互相替代。

## 2026-07-17 007b 当前保存语义（已验收）

用户批准将 Scene/Lighting 设置改为工程软件式直接操控。007b 只改变 Studio authoring 的提交时机，继续复用
完整 `set-scene-environment` command；SceneDocument、ProjectRecord、IndexedDB、archive、command payload
schema 和既有 save 数据含义全部不变。

- 统一 Settings 不再提供 Scene/Lighting Apply 或 Discard。弹窗保持打开，Escape、关闭按钮和 backdrop
  只关闭弹窗，不回滚已经提交的操作。
- 背景模式、背景颜色、grid、lighting preset、方向和 advanced colors 属于离散控件。每次完整操作立即执行
  一个包含完整 before/after environment 的 `set-scene-environment` command。
- range slider 拖动期间只产生 transient live preview，不写 document/history/autosave。手势结束时只提交
  最终值一次：pointer 操作以 release 为边界，键盘调整以一次 completed interaction 为边界，失焦以 blur
  为兜底边界。
- 每个完整离散操作或 range 手势最多形成一个 revision 和一个 Undo entry，并进入既有 500ms debounce
  autosave 调度；快速连续操作可合并为一次最新 snapshot 写入。中间 preview 不调度 autosave。Undo/Redo
  继续恢复完整 authoritative environment。
- command unchanged 仍是 exact no-op。command rejected/unavailable 时清除对应 transient preview，恢复最后
  authoritative environment，并在 Settings 内给出可访问错误；不得保留看似已保存的控件值。
- Application 语言/主题仍即时写入原本地 preference；Run/无可编辑项目 gate、唯一 Settings 入口、Lighting
  menu 两个 Add item 与 `n/8`、Viewer identity 和 Offset Datum 品牌均不改变。

### 007b final acceptance、review 与 verification

- 用户于 2026-07-17 批准该 Critical 保存时机变更。最终 focused 证据 22/22 通过，包含独立 review 首轮
  发现的 High active-range Undo race 回归。
- transient range/color interaction 由 controller-owned cancellation generation 管理。所有 Undo 入口先清 active
  gesture 并推进 generation；`pointercancel` 只取消 preview、永不提交；取消后的 late `pointerup`、`change` 或
  `blur` 因 generation 已失效而零提交。pointer、keyboard、blur、duplicate end、unchanged final value 和
  rejection restoration 均有 focused 证据。
- 每个 accepted operation 只形成一个 revision 和一个 Undo entry，并进入既有 500ms debounce autosave；快速
  操作可合并为一次 latest accepted snapshot 物理写，不能表述为“一操作一次物理写”。preview-only value 不调度
  autosave。IndexedDB、JSON、ZIP、ProjectRecord 与 command payload schema/save meaning 保持不变。
- generation High fix 及同类颜色手势取消回归覆盖后 final full unit 为 92 files / 551 tests，full typecheck 通过；ESLint、production
  build、i18n、product design、single-Studio topology、format、Prettier 和 diff checks 通过。
- generation 修复后 key WebGL 4/4 与 final full Chromium/WebGL E2E 22/22 均通过。
- 独立 Critical reviewer 首轮发现 High active-range Undo race；controller-owned cancellation generation 与
  回归测试返工后，同一 reviewer 最终复审 PASS，无 remaining contract finding。

## 2026-07-17 007c authored-light Inspector 直接操控语义

右侧 Object Inspector 的 Point/Spot Light 属性不再使用 form 或“Apply/应用”按钮。该 Inspector 与统一
Settings 的 scene-wide fill/key Lighting 面板职责不同：前者编辑持久化 `LightEntity`，后者编辑
`SceneEnvironment.lighting`。

- 颜色、亮度、范围、Spot 光束角和半影在输入期间通过 `AuthoredLightPropertyPreview` 直接更新现有 Three
  Light 与 helper color；preview 不修改 SceneDocument、revision、history、autosave、selection 或 Canvas identity。
- 亮度 slider 在 pointer/keyboard gesture 结束时只执行一次完整 `update-light-entity` command。颜色在原生颜色
  选择完成时提交；数值、名称、位置和旋转精确输入在 Enter/blur 时各提交一次。每个 accepted operation 对应
  一个 revision 与一个 Undo entry，并进入既有 500ms debounce autosave。
- preview DTO 只包含 `documentId`、`documentRevision`、`entityId` 和 `LightEntity.light`。Runtime 只在当前 Edit、
  当前 revision、未锁定且 kind 一致时接受；Run、锁定、陈旧 revision、unknown entity 或 invalid value 原子拒绝。
- 取消、拒绝、Undo/Redo、主选择变化和进入 Run 都清 preview；成功 command 的 preview 保持到 matching
  light-only source publication 原子替换 runtime resource，避免先闪回旧值。SceneDocument 1.3、ProjectRecord、
  IndexedDB、JSON/ZIP archive 与 `update-light-entity` payload schema/save meaning 不变。

最终 full unit 为 92 files / 560 tests；typecheck、lint、production build、i18n、design、topology、format 与
diff checks 通过。冷启动 Chromium/WebGL light-authoring E2E 2/2 通过，覆盖无 Apply、滑杆 preview 期间
revision 不变、release 单提交、精确输入、Run 取消和 Canvas identity；最终完整 Chromium/WebGL E2E 22/22
通过。

独立 Critical review 首轮发现 High rapid-operation publication race 与 Medium color lifecycle coverage gap。
Studio controller 加入 active transient + held accepted-awaiting-publication 两层 preview，按 Viewer 当前 published
revision 渲染并按 matching ready revision 释放；延迟 publication、取消 B 恢复 A、active B 跨 ready(A)、接受 B
直到 ready(B) 的组合序列均有测试。颜色 input/change/blur、duplicate completion、Undo 后 late event、accept revision
与 rejection restoration 补齐后，同一 reviewer 最终 PASS，无 remaining finding。
