# M1 Studio 编辑闭环验证记录

> 状态：Accepted for M1
> 验证日期：2026-07-14
> Supersession：本记录保留当时 Factory regression gate 和双 build 基线。feature 005 的同等
> Studio Run 证据于 2026-07-15 通过并退役 Factory；M1 编辑、保存和 archive 验收结论不变。
> 范围：本地工程与 Chromium 浏览器闭环，不代表 MVP production release

## 1. 验证对象

M1 在不修改 `SceneDocument 1.0.0` Schema 的前提下，验证本地项目、模型导入、场景编辑、
命令历史、autosave 与 JSON/ZIP 交换闭环。项目 metadata、session、selection、Three.js 对象和
Blob URL 均保持在文档合同之外。

## 2. M1 验收矩阵

| 不变量                                           | 结果 | 实现与验证证据                                                                            |
| ------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------- |
| M1-A01 本地项目保存、重载保持 canonical document | Pass | IndexedDB repository tests；Playwright autosave、常规 reload 与 500ms debounce 内 reload  |
| M1-A02 有效 GLB 先摘要后提交 asset/entity/target | Pass | `inspect-gltf.test.ts`、import command tests、真实 1216-byte GLB Playwright 流程          |
| M1-A03 无效模型不改变 document/asset/history     | Pass | inspection negative tests；损坏 GLB 浏览器前后 revision、tree 和 IndexedDB 对比           |
| M1-A04 树和视口共用 entity ID 选择               | Pass | authoring runtime event tests；Canvas 实体命中后 tree `aria-selected` 变化                |
| M1-A05 六类编辑可撤销重做                        | Pass | document command tests；Playwright rename、visibility、lock、transform、duplicate、delete |
| M1-A06 三次 Undo/Redo 内容与 revision 正确       | Pass | history tests；Playwright revision 5 -> 8 -> 11 与字段回显                                |
| M1-A07 Run 模式不提交命令                        | Pass | session/history tests；Run 中实际触发 `w`、`Delete` 后 revision 与实体数量不变            |
| M1-A08 JSON 往返语义不变                         | Pass | canonical JSON codec tests；浏览器下载、重导和深比较                                      |
| M1-A09 ZIP 往返 diff 为零且 hash 相同            | Pass | archive security tests；下载 ZIP 机器解析、1216-byte payload 和 SHA-256 对比              |
| M1-A10 保存/导入失败保留旧项目                   | Pass | repository failure tests；损坏 GLB、storage estimate 失败和 retry Playwright 流程         |
| M1-A11 session/runtime 状态不进入文档            | Pass | strict snapshot validation、forbidden field negative tests、canonical export 对比         |
| M1-A12 narrow gate 与 Factory M0 无回归          | Pass | 4 条 M0 Playwright tests 与 3 条 M1 tests 同次通过                                        |

## 3. 自动化结果

2026-07-14 M1 最终门禁：

| 命令                                 | 结果                                 |
| ------------------------------------ | ------------------------------------ |
| `pnpm format:check`                  | Pass                                 |
| `pnpm lint`                          | Pass                                 |
| `pnpm typecheck`                     | Pass                                 |
| `pnpm test`                          | Pass，19 files / 104 tests           |
| `pnpm test:e2e`                      | Pass，7 Chromium tests               |
| `pnpm build`                         | Pass；保留 Vite 500 kB chunk warning |
| `./scripts/verify-product-design.sh` | Pass                                 |

Factory readonly build 的 Three runtime 文件为 621089 bytes；Studio authoring build 为 649553
bytes。TransformControls 未进入 Factory readonly bundle，Studio 增量保持在 authoring app。

## 4. 浏览器证据

Playwright 使用隔离 Vite servers 和真实 WebGL。M1 浏览器流验证：

- 导入前 modal 展示文件名、2 nodes、1 mesh、1 material、24 triangles、byte length 和 SHA-256。
- Canvas 导入后通过非白像素、颜色离散度和 alpha 比例证明模型实际渲染。
- Canvas 点击模型后 tree 和 Inspector 使用同一稳定 entity ID。
- Move、Rotate、Scale gizmo 均实际渲染；translate axis 的 pointer down/move 只预览，pointer up
  后 revision 只增加一次并更新 Position X。
- 三次 Undo 与三次 Redo 逐步验证 transform、visibility、lock 和单调 revision。
- 500ms debounce 内用户侧 reload 先 flush revision 18，再由 IndexedDB 恢复相同 tree。
- dirty 后立即导出会同时更新 project record、save revision 和 export revision。
- JSON 与 ZIP 下载后重新导入；ZIP 使用公开 codec 复核 manifest、payload length 和 hash。
- 损坏 GLB 和 quota 失败不覆盖 revision 1；容量恢复后显式 retry 保存 revision 2。
- 浏览器运行期间没有 `pageerror`、`console.error`、空 Canvas 或页面溢出。

关键截图由 Playwright 写入忽略提交的 `artifacts/e2e/`，包括 import summary、locked/hidden、
transform preview、move gizmo、archive round-trip、invalid import 和 save failed。

## 5. 独立复审

Critical 数据合同 review 检查 Schema、revision、原子 transaction、autosave、inspection、archive
和状态隔离；frontend/runtime review 检查 selection/load race、TransformControls、Run gate、
Inspector、narrow gate、M0 回归和测试真实性。

初审发现并关闭：

- 新 entity selection 早于 runtime generation commit 时会抛错并崩溃。
- Inspector 相同 transform 的连续 blur 会重复提交 revision，Undo/Redo 回显不同步。
- Run 模式 Import/键盘 Delete 的 UI 门禁不一致。
- debounce 内 reload 会丢 pending snapshot；dirty 后立即 export 的 save state 不同步。
- gizmo drag commit 与 Run revision 缺少真实浏览器证据。

原 reviewers 反向复核后，以上 findings 全部为 closed，没有新增功能性 finding。

## 6. 工具差异

spec-kit acceptance 脚本只识别 `FR/NFR/SC` 定义。本 M1 规格使用 `M1-A01` 至 `M1-A12`
验收码，仓库也没有 `.specify/memory/constitution.md`，因此自动提取报告会把上游 FR 引用识别
为 orphan。本记录按 `spec.md` 的 M1 验收矩阵手工逐项取证，不把脚本结果伪装为通过。

## 7. 限制与后续风险

- 当前只有本地 Chromium 证据。可等待的 reload flush 使用 Chromium Navigation API；不支持该
  API 的页面退出只执行 best-effort `pagehide` flush。
- 已进入 `Save failed` 的同一快照不会在退出时自动盲重试；旧 record 保持有效，用户必须在
  恢复容量后显式 retry。
- `three-scene-viewport.ts` 当前 856 行，虽然 adapter、generation、selection overlay 和
  TransformControls 已拆出，feature 005 增加 Run 行为时仍应继续控制其职责和回归面。
- 没有 Firefox/Safari、固定硬件性能基准、外部开发者任务测试或正式 npm/release packaging。

因此 M1 结论是“Studio 本地编辑闭环实现并在 Chromium 验收通过”，不是“产品已可生产发布”。
