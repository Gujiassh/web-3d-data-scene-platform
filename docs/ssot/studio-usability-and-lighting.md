# Studio Usability And Lighting

> 状态：006A.1/006A.2 accepted；006A.3 planned
> 用户批准：2026-07-16，包含 `SceneDocument 1.1.0 -> 1.2.0` 和真实 IndexedDB 数据迁移

## 产品边界

Feature 006A 是已验收 Scene Layout 的易用性后续阶段，按 006A.1 命令与回正、006A.2 智能对齐、
006A.3 场景外观顺序交付。它不实现建模、任意灯光实体、阴影、HDRI、快捷键自定义或等间距实时参考线，
也不占用 Feature 007 的热点/标注/声明式交互所有权。

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

006A.3 将 current SceneDocument 升级到 1.2.0，required `environment.lighting` 保存具体 fill/key 参数，不保存
preset 名称。旧 1.0/1.1 先按冻结合同完整验证，再迁移并复验 1.2；IndexedDB 全记录在一个 readwrite
transaction 中刷写，任一坏记录整笔回滚。ProjectRecord 八字段、DB version/store 和 archive container 不变。

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
