# Acceptance: 中英文界面国际化

**Feature**: `003-bilingual-ui`
**Date**: 2026-07-15
**Result**: PASS（21/21 coded points）

仓库没有 `.specify/memory/constitution.md`；本次按项目现有 `docs/ssot/`、feature spec、Viewer API
contract 与产品设计 verifier 执行治理检查。coded-points 脚本确认 21 个定义、0 重复、0 orphan。

## Acceptance Matrix

| Code    | Status | Implementation evidence                                                            | Verification evidence                                                      |
| ------- | ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| FR-001  | PASS   | Studio / Factory typed catalogs；typed app error presentation                      | `pnpm verify:i18n` 扫描生产 TS/TSX 通过                                    |
| FR-002  | PASS   | shared `LanguageSwitch` 挂载在两端 header/toolbar                                  | SSR a11y test；Playwright translated accessible-name switching             |
| FR-003  | PASS   | `resolveLocale` 依次读取有效偏好、浏览器语言、English fallback                     | shared locale unit tests；中文 browser + invalid preference E2E            |
| FR-004  | PASS   | 两端 app-specific localStorage key 与 provider persistence                         | Studio / Factory 切换后 reload 仍为 English                                |
| FR-005  | PASS   | catalog/context 更新 visible/aria/title；runtime Canvas setter                     | same-Canvas E2E；页面无需 reload 即切换                                    |
| FR-006  | PASS   | catalog functions；Studio/Factory Intl count/date/byte formatters                  | formatter/presentation unit tests                                          |
| FR-007  | PASS   | IDs/hash/path/revision/protocol values不进入翻译映射                               | canonical JSON、business ID、selection/revision E2E                        |
| FR-008  | PASS   | locale 只存 localStorage，不进入 repository/document/runtime                       | 切换前后 canonical SceneDocument deep equality                             |
| FR-009  | PASS   | Studio workspace lifecycle不依赖 locale；creation-only defaults                    | import → switch → Undo/Redo → explicit save → reload；M1 full E2E          |
| FR-010  | PASS   | Factory adapter memo 只依赖 cycle，Viewer 原位更新 Canvas label                    | active alarm + connection + selection + same Canvas E2E；M0 full E2E       |
| FR-011  | PASS   | `StudioAppError` / `M0SceneLoadError` typed mapping；unknown raw passthrough       | known en/zh + unknown passthrough unit tests；production Error scan        |
| FR-012  | PASS   | providers同步 `<html lang>`；buttons expose translated name + `aria-pressed`       | shared SSR a11y test；E2E lang assertions                                  |
| NFR-001 | PASS   | wrapper effect calls `setCanvasLabel`，repository/adapter init无 locale dependency | same DOM Canvas；snapshot equality；history/save/alarm continuity E2E      |
| NFR-002 | PASS   | Chinese catalogs satisfy recursive `CatalogShape<typeof english>`                  | workspace TypeScript gate passed                                           |
| NFR-003 | PASS   | stable segmented control and responsive existing layouts                           | 1440x900、1280x720、768x1024 overflow ≤1px；four screenshots inspected     |
| NFR-004 | PASS   | zero remote catalog/translation requests；无动态代码执行                           | dependency/diff review；production builds passed                           |
| SC-001  | PASS   | `scripts/verify-i18n-copy.mjs` covers app/shared production TS/TSX                 | scanner passed with narrow technical/developer whitelist                   |
| SC-002  | PASS   | bilingual Studio authoring/save and Factory telemetry paths                        | full Playwright 10/10，no page/console errors                              |
| SC-003  | PASS   | context-driven immediate switch + persisted locale                                 | both apps switch and reload assertions passed                              |
| SC-004  | PASS   | presentation-only locale state；Canvas setter is snapshot-neutral                  | canonical diff zero；revision/selection/connection/alarm/snapshot evidence |
| SC-005  | PASS   | responsive CSS preserves toolbar/rails/workspace geometry                          | four Chinese screenshots + automated overflow checks passed                |

## Quality Gates

- `pnpm format:check`: PASS
- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 26 files / 131 tests
- `pnpm build`: PASS（保留既有 Three.js >500 kB chunk warning）
- `pnpm verify:i18n`: PASS
- `npm_config_offline=true pnpm verify:design`: PASS
- `CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=250 pnpm test:e2e`: PASS, 10/10
- `git diff --check`: PASS

## Runtime Evidence

- `artifacts/e2e/studio-zh-1440x900.png`
- `artifacts/e2e/studio-zh-1280x720.png`
- `artifacts/e2e/factory-zh-1440x900.png`
- `artifacts/e2e/factory-zh-768x1024.png`

## Independent Review

- Contract/lifecycle review: initial test-evidence gap fixed；reverse review returned no findings.
- Frontend/i18n review: fixed-error and accessible-name gaps fixed；re-review returned no findings.
- Final judgment: current implementation is acceptable and points toward the intended app-owned presentation
  architecture without changing SceneDocument, project persistence, telemetry, or runtime snapshot contracts.
