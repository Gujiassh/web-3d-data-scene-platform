# UI Internationalization Architecture

## Scope

Studio 是唯一产品前端，支持 `en` 和 `zh-CN`。国际化是应用展示能力，不是 SceneDocument、
runtime、adapter envelope 或 archive 合同的一部分。

feature 003 的 Studio/Factory 双应用验收是当时真实事实。feature 005 supersede Factory 产品
表面，并在替代 E2E 通过后删除其 catalog 和偏好 key。

## Ownership

- `apps/shared`：保存 locale 检测、归一化、localStorage 和语言切换控件，不包含产品业务、
  SceneDocument 或 runtime 依赖。
- `apps/studio/src/i18n`：Studio typed catalog、provider、日期/数字/字节和新数据绑定展示。
- `packages/runtime`：只接受最终 Canvas `aria-label`，不知道 locale 或 translation key。

## Contract Boundary

下列值永不翻译或写入 locale metadata：SceneDocument、ProjectRecord、command history、archive、
runtime snapshot、adapter envelope、entity/target/source/binding/rule/business ID、hash、path、pointer、
revision、GLB/glTF 格式名与 diagnostic code。用户输入的项目名、实体名、资产名、source 名和
未知 runtime message 按原值显示。

应用固定状态和错误由 typed catalog 翻译。Studio 自定义错误使用稳定 typed code/reason 和
结构化 details 映射展示，不得按英文 `Error.message` 做模式匹配；原生 IndexedDB、浏览器、
parser 与 runtime 的未知错误继续原样透传。

## Lifecycle

应用启动时依次读取有效 Studio 偏好、浏览器语言列表和 English fallback。显式切换同步 React
context、`document.documentElement.lang`、page title 和现有 Canvas aria label，并写入
`web3d.studio.locale`。locale 不进入 Viewer、adapter factory、project repository 或 command
history 的 identity/dependency，因此切换不得重建 Viewer、重启 Run 或清空 transient preview。

## Evolution

新增 locale 时必须补齐完整 typed catalog、浏览器标签归一化、目标视口截图和核心 Edit/Run
E2E。只有出现复杂复数、消息抽取或大规模语言包加载需求时，才重新评估 ICU/i18n library。

`pnpm verify:i18n` 只扫描 Studio 与实际保留的 shared 展示模块。拓扑门禁另行拒绝已删除的
Factory source root 和偏好 key，避免 dead whitelist 回流。
