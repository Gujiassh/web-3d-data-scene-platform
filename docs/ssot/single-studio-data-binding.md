# Single Studio Data Binding

> 状态：Implemented and Accepted
> 实施日期：2026-07-15
> 持久化合同：`SceneDocument 1.0.0` 与 archive shape 不变

## 当前产品事实

Studio 是唯一用户可见前端，也是唯一开发入口。根命令 `pnpm dev` 只启动
`@web3d/studio`，Vite 使用 strict port 4173；Playwright 使用同一 baseURL 和一个隔离的
Studio webServer。原独立 Factory Demo、第二端口、第二 Playwright server 和 Factory 偏好 key
已在 Studio 替代证据通过后删除。

固定 M0 资产保留在 `tests/fixtures/m0-factory/`，只作为真实 GLB、node mapping、archive 和
浏览器回归 fixture。它不进入 Studio production build，也不构成第二个产品应用。GLB oracle
保持 1216 bytes，SHA-256 为
`e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8`。

## 所有权边界

| 层                  | 稳定职责                                                                |
| ------------------- | ----------------------------------------------------------------------- |
| `packages/document` | Target/Mock source/Binding/RuleSet 原子命令、验证、history 和引用完整性 |
| `packages/runtime`  | adapter、值顺序、规则投影、alarm、binding snapshot/event 和 effect 清理 |
| `packages/react`    | data-runtime enablement、adapter reconciliation 和 Viewer 生命周期转发  |
| `apps/studio`       | 选择解析、表单模型、Mock scenario、Edit/Run 面板和 transient preview    |
| `tests/e2e`         | 真实浏览器、WebGL、持久化、延迟、像素、响应式与生命周期 oracle          |

持久化 authoring state 只存在于现有 `SceneDocument` 字段。connection、当前值、quality、active
alarm、runtime diagnostic、当前选择和 adapter lifecycle 都是 Run session 的 transient state，
不得进入 document、ProjectRecord、autosave、JSON 或 ZIP。

## Authoring 闭环

1. 用户导入 GLB 后选择 imported asset root entity；Studio 只通过稳定 entity/target ID 解析
   `SceneTarget`，不使用显示名、遍历顺序或 Three.js UUID 推断身份。
2. Business ID、Mock source、Binding 与 RuleSet 分别由 typed draft 验证，再通过
   `DocumentCommand` 边界提交。有效变更产生一个单调 revision 和 history entry；无效或未变化
   的 draft 不产生部分 mutation。
3. Sample field 由确定性 payload 枚举 primitive leaf，并生成规范 RFC 6901 pointer。首个已验收
   路径为 `/telemetry/status`。
4. 规则编辑支持有序 equality condition、一个 color effect 和可选 alarm effect。Studio
   authoring 合同将 trim 后的 string equality value 限制为 160 字符；form/command guard 与 focused
   tests 已验证，且不收紧 SceneDocument schema 或 legacy load。priority 与 writes 确定生成；shared
   或超出当前编辑能力的旧 RuleSet 原样保留并只读展示。
5. 删除 source/binding 时在同一命令中维护依赖引用，只删除确实失去引用的 RuleSet。

已验收场景保存 `CELL-001`、一个 `status-cycle` Mock source、1000ms stale/1500ms offline
threshold、一个稳定 binding 和三条 `ready/warning/critical` 规则，其中 `critical` 产生
`#B93632` color 与 critical alarm `Critical state`。

## Run 生命周期

Edit 与 Run 使用同一个 active project、SceneDocument、Canvas、Viewer 和 selection。进入 Run
时，Studio 从持久化 Mock source 派生 adapter 并启用既有 runtime pipeline；host panel 只读显示
source connection、binding value、active alarms 和 diagnostics。返回 Edit 时：

- adapter stop/unsubscribe，scenario timers 清零；
- connection、binding value、alarm 和 diagnostic preview 清空；
- projected material effect 恢复到 authored baseline；
- authored mapping/rules、document revision、Canvas identity 和 selection 保持不变。

locale/theme 只更新 presentation context，不参与 adapter identity 或 Viewer lifecycle。相同
runtime state 不重复发送 binding/alarm event；并发 enable/disable 最终只保留一个 active
subscription。

跨项目切换使用 project record ID 作为 Viewer/authoring identity；即使两个项目共享同一个
`SceneDocument.id`，Canvas 仍会按项目边界正确 remount。现阶段不 author WebSocket source；已有
legacy WebSocket source 在 Run 中稳定显示 `Error` 与 `DATASOURCE_CONNECTION_FAILED`，返回 Edit
后清除 transient preview，document、revision 与 export 保持不变。

## 持久化与交换

Business ID、source、binding 和 rules 经过 autosave/reload 后保持相同 ID 与含义。JSON 导出、
ZIP 导出、JSON 重导和 ZIP 重导均对 canonical document 做深比较；ZIP 继续使用既有 manifest
和 content-addressed asset 合同。

feature 005 没有新增、删除或改义任何 SceneDocument、archive manifest 或 ProjectRecord 字段。
新增内容仅包括 DocumentCommand variant、向后兼容的 authoring runtime API，以及 Studio-local
typed view/preview model。新 authoring command 会校验规范 pointer，但 legacy document load
acceptance 没有收紧。

## 演进约束

- 当前 UI 只 author Mock source、imported asset root target、equality/color/optional alarm。
- model-node target authoring、WebSocket 配置、其他 operator/effect、layout 与 hotspot 分属后续
  feature，不得通过猜测或 silent migration 填补。
- `pnpm verify:topology` 必须持续拒绝第二产品 app/server、旧 package/port 和旧偏好 key；
  003-005 的显式历史规格使用窄 allowlist，不是当前拓扑输入。
- 任何持久化字段或 save/archive 语义变化都需要新的明确合同审批，不能作为本功能增量修改。
- `packages/runtime/src/viewer/three-scene-viewport.ts` 当前为 1008 行，列为下一切片的 architecture
  watch；它不是 feature 005 验收或发布 blocker，后续应按职责评估拆分而不改变 runtime 合同。
