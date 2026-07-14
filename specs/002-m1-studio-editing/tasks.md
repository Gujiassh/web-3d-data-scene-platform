# M1 任务清单

> 状态由主控制器在每个可验证切片后更新。

| ID     | 任务                                            | 状态 | 主要证据                        |
| ------ | ----------------------------------------------- | ---- | ------------------------------- |
| M1-T01 | 冻结 M1 规格、语义 oracle 和架构边界            | Done | `spec.md`、`plan.md`、SSoT      |
| M1-T02 | Document commands 与 history                    | Done | unit tests                      |
| M1-T03 | IndexedDB project/asset repository 与 autosave  | Done | repository tests                |
| M1-T04 | GLB/自包含 glTF inspection 和事务导入           | Done | import tests                    |
| M1-T05 | JSON/ZIP archive codec 和安全限制               | Done | round-trip/security tests       |
| M1-T06 | Viewer 无损拆分与 authoring runtime             | Done | M0 regression + authoring tests |
| M1-T07 | React authoring wrapper                         | Done | lifecycle tests/typecheck       |
| M1-T08 | Studio project/session state                    | Done | session tests                   |
| M1-T09 | Studio Project/Import/Tree/Toolbar/Inspector UI | Done | Playwright                      |
| M1-T10 | TransformControls、选择同步和热键               | Done | interaction tests/screenshots   |
| M1-T11 | M1 浏览器往返与失败流                           | Done | E2E artifacts                   |
| M1-T12 | 文档、工作台、独立复审、提交推送                | Done | final gate + GitHub             |

## 验收责任

- 实现者不得用局部测试替代对应 M1-Axx 业务不变量。
- Reviewer 必须检查 SceneDocument、project metadata、session 和 runtime 四类状态没有串层。
- 主控制器必须检查实际 diff、运行命令、浏览器截图和下载产物，不按代理结论直接接受。
