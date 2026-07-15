# M2 Single Studio Data Binding Verification

> 状态：Implemented and Accepted
> 验证日期：2026-07-15
> 浏览器：Playwright Chromium / real WebGL
> 范围：feature 005 实现、独立复审与本地验收；T032 commit/push 尚未执行

## 质量门结果

本轮接受的确切命令如下；实际验证未复用常驻 dev server：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:i18n
npm_config_offline=true pnpm verify:design
pnpm verify:topology
pnpm exec playwright test tests/e2e/m2-data-binding.spec.ts
pnpm test:e2e
pnpm -r list --depth -1
stat -c '%s %n' tests/fixtures/m0-factory/public/m0-factory-cell.glb
sha256sum tests/fixtures/m0-factory/public/m0-factory-cell.glb
git diff --name-only -- specs/001-product-foundation/contracts packages/document/src/schema packages/document/src/archive packages/document/src/types.ts
git diff --check
```

| 命令                                                                                                                                                       | 结果                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm format:check`                                                                                                                                        | Pass，全部匹配 Prettier                                            |
| `pnpm lint`                                                                                                                                                | Pass                                                               |
| `pnpm typecheck`                                                                                                                                           | Pass，root、E2E 和 5 个 workspace project                          |
| `pnpm test`                                                                                                                                                | Pass，44 test files / 222 tests                                    |
| `pnpm build`                                                                                                                                               | Pass，只构建 Studio；保留 Three.js 649.55kB chunk warning          |
| `pnpm verify:i18n`                                                                                                                                         | Pass，扫描 `apps/studio/src` 与 `apps/shared`                      |
| `npm_config_offline=true pnpm verify:design`                                                                                                               | Pass，`PASS product-design verification`                           |
| `pnpm verify:topology`                                                                                                                                     | Pass，`Single-Studio topology verification passed.`                |
| `pnpm exec playwright test tests/e2e/m2-data-binding.spec.ts`                                                                                              | Pass，3/3；main 16.1s，project remount 2.2s，legacy WebSocket 1.7s |
| `pnpm test:e2e`                                                                                                                                            | Pass，Chromium 11/11，21.6s                                        |
| `stat` 与 `sha256sum`（确切命令见上）                                                                                                                      | Pass，1216 bytes；hash 与 accepted oracle 一致                     |
| `git diff --name-only -- specs/001-product-foundation/contracts packages/document/src/schema packages/document/src/archive packages/document/src/types.ts` | Pass，无输出；持久化 schema/archive/type shape 无变化              |

最终集成基线为 44 test files / 222 unit tests。完整 Chromium 套件已收敛为 11 条 Studio case，
全部通过；Factory app-owned assertions 已由 Studio authoring、Run、i18n、theme、size gate 与 M2
runtime invariants 取代。

## M2 浏览器闭环

`tests/e2e/m2-data-binding.spec.ts` 以三条测试执行以下真实用户路径：

1. 导入固定 1216-byte GLB，保存 `CELL-001` business ID。
2. 创建 `Cell telemetry` Mock source，stale/offline threshold 为 1000/1500ms。
3. 选择稳定 pointer `/telemetry/status`，保存三条 equality/color 规则及一个 critical alarm。
4. 机器解析 JSON/ZIP，并对 JSON 重导、ZIP 重导后的 canonical document 做深比较。
5. reload 后验证 revision 4、Business ID、source 和 writes 保持。
6. 在同一 Canvas/selection 上进入 Run，观察 critical、offline、new-stream recovery、alarm focus、
   locale/theme 切换和 context restore。
7. 返回 Edit 后验证 timer、transient state 和 material effect 清理；再次导出 JSON/ZIP，并读取
   IndexedDB active project record 与 `documentJson` 对比 Run 前 canonical document。
8. 再次 Run 验证无重复 lifecycle。
9. 在 Run 中验证 Undo/Redo 按钮 disabled，并触发 Ctrl/Cmd Undo/Redo shortcuts，revision、persisted
   document 与 diagnostics 均不变。
10. 两个 project record 共享同一 `SceneDocument.id` 时，切换项目仍按 project ID remount Canvas。
11. legacy WebSocket source 在 Run 显示 `Error` 与 `DATASOURCE_CONNECTION_FAILED`，返回 Edit 后
    清理 preview，document、revision 与 export 不变。

## P0 持久化 Oracle

进入 Run 前，测试另存 `m2-before-run.scene.json` 作为 canonical baseline。首次 Run -> Edit 完成后：

- `m2-after-run.scene.json` 解析结果与 baseline 深比较相等；
- `m2-after-run.scene.zip` 经公开 `importSceneArchive` 解析后，document 与 baseline 深比较相等；
- 直接读取真实 `web3d-studio` IndexedDB 的 `projects` store，沿用已有 E2E helper 以
  `lastOpenedAt` 排序定位 active persisted record；
- persisted `name` 与 `lastSavedRevision` 分别等于 canonical `name` 与 `revision`，解析后的
  `documentJson` 与 baseline 深比较相等。
- persisted record 的字段集精确等于 repository 定义的 `id/name/createdAt/updatedAt/lastOpenedAt/`
  `lastSavedRevision/lastExportedRevision/documentJson`，没有额外 runtime metadata。

测试对 document、entity/metadata、target、source/options、binding、RuleSet、Rule condition 和
persisted project record 的 owner 字段显式拒绝 `connection(s)`、`currentValue(s)`、`value(s)`、
`quality`、`alarm(s)`、`diagnostic(s)`、`preview` 与 `runtime(State)`。合法 authored color effect 的
`value` 和 alarm effect 的 `type: "alarm"` 不被误判为 runtime state。

## 延迟 Oracle

NFR-001 的浏览器计时明确排除 Mock scenario 的预定等待时间。探针在 scenario timer handler 开始
执行时记录 `performance.now()`，MutationObserver 观察 `critical` host value，随后等待下一次
`requestAnimationFrame`，以“handler 开始 -> DOM 可见 + frame opportunity”作为边界。结果满足
`criticalLatency <= 100ms`。

该计时路径断言 configured critical alarm 可见、binding value 为 `critical`。`redRatio > 0.005`
是在延迟断言之后执行的独立 Canvas 像素采样，不属于 handler -> DOM -> next RAF 的 100ms 计时
边界。scenario 的 80/900/1800/2700/8200ms 调度只用于产生输入，不计入响应预算，因此没有用
schedule delay 冒充 runtime projection latency。

## Canvas 与生命周期 Oracle

- critical 1440x900：Canvas `redRatio > 0.005`，alarm focus 后 tree selection 保持。
- context restore：`WEBGL_lose_context` 返回 `restored`，runtime diagnostic 为
  `RENDERER_CONTEXT_LOST`，恢复后 `opaqueRatio > 0.99` 且 `distinct > 8`。
- 返回 Edit：`redRatio < 0.005`，green ratio 不高于 baseline + 0.01，证明 projected effect 清理。
- 首次 Run：只调度 5 个 scenario timers；theme/locale 切换前后 scheduled count 不变；完整序列后
  active timers 为 0。
- 第二次 Run：累计 scheduled count 为 10，但 `maxActive <= 5`；再次返回 Edit 后 active 为 0。
- remembered Canvas DOM identity、selected row 和 revision 4 在 Run/theme/locale/Edit 循环中保持。
- runtime unit test 对重复 snapshot 断言 binding/alarm event 数不增加，并断言 active subscription
  最大为 1；React reconciliation tests 覆盖 StrictMode duplicate-start regression。
- 1280x720 与 1440x900 均执行 page overflow 检查；浏览器期间无 `pageerror` 或
  `console.error`。

## 截图证据

M2 关键截图位于忽略提交的 `artifacts/e2e/`：

- `m2-edit-1440x900.png`：English/light、三条 populated rules、Save binding 可见且无裁切/重叠。
- `m2-edit-1280x720.png`：中文/dark、三条 populated rules、保存绑定可见且无页面 overflow。
- `m2-run-critical-1440x900.png`：critical value、alarm、red Canvas 与完整 Studio Run 布局。
- `m2-run-1280x720.png`：恢复后的 minimum desktop Run 布局与无页面 overflow。

完整 11/11 套件还生成并检查：

- `studio-desktop-1440x900.png`、`studio-size-gate-768x1024.png`
- `studio-zh-1440x900.png`、`studio-zh-1280x720.png`
- `studio-dark-1440x900.png`、`studio-light-1280x720.png`
- `m1-import-summary-1440x900.png`、`m1-archive-round-trip-1440x900.png`
- `m1-move-gizmo-1440x900.png`、`m1-transform-preview-1440x900.png`
- `m1-invalid-import-1440x900.png`、`m1-save-failed-1440x900.png`

## Review 与后续观察

T029-T031 已完成。Frontend review 与 contract review 均无剩余 finding；contract 原五项已有
implementation、focused evidence 和 closure 确认。T032 保持未完成，等待主控 commit/push。

`packages/runtime/src/viewer/three-scene-viewport.ts` 当前 1008 行，记录为下一切片 architecture
watch，不阻塞本次验收。若后续拆分，必须保持现有 Viewer/runtime、SceneDocument 与 archive 合同。
