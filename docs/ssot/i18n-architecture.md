# UI Internationalization Architecture

## Scope

Studio 与 Factory Demo 首期支持 `en` 和 `zh-CN`。国际化是宿主应用的展示能力，不是场景
文档、runtime 或遥测协议的一部分。

## Ownership

- `apps/shared`: locale 检测、归一化、localStorage、通用语言切换控件。
- `apps/studio/src/i18n`: Studio catalog、provider、日期/数字/字节格式化。
- `apps/factory-demo/src/i18n`: Factory catalog 与稳定业务展示映射。
- `packages/runtime`: 只接受最终 Canvas `aria-label`，不知道 locale 或 translation key。

## Contract Boundary

下列值永不翻译或写入 locale metadata：SceneDocument、ProjectRecord、command history、archive、
runtime snapshot、adapter envelope、entity/project/business ID、hash、path、pointer、revision、GLB/glTF
格式名与 diagnostic code。用户输入的项目名、实体名和资产名按原值显示。

应用固定状态和错误由 catalog 翻译。未知 runtime、浏览器或导入器错误保留原始 message，防止
错误猜测诊断含义。Factory 的已知 reference 告警只按稳定 `ruleId` 映射，未知告警保留原文。
Studio 与 Factory 的应用自定义固定错误使用稳定 typed code/reason 和结构化 details 映射展示，
不得按英文 `Error.message` 做模式匹配；原生 IndexedDB、浏览器、parser 与 runtime 错误继续原样透传。

## Lifecycle

应用启动时依次读取有效应用偏好、浏览器语言列表、英文 fallback。显式切换同步 React context、
`document.documentElement.lang`、page title 和现有 Canvas aria label，并写入应用专用 localStorage。
locale 不进入 Viewer、adapter、project repository 或 command history 的 identity/dependency，因此切换
不会触发它们重建。

## Evolution

新增 locale 时必须补齐完整 typed catalog、浏览器标签归一化、目标视口截图和核心流程 E2E。
只有出现复杂复数、消息抽取或大规模语言包加载需求时，才重新评估引入 ICU/i18n library。
`pnpm verify:i18n` 扫描 Studio、Factory 与 shared 的生产 `.ts` / `.tsx`，新增固定 UI copy 或固定
`new Error(...)` 时必须进入 typed catalog/code，或加入经过说明的开发期不变量白名单。
