# Data Model: 中英文界面国际化

## Locale

```ts
type Locale = "en" | "zh-CN";
```

- 只表示当前界面语言。
- 可由有效保存偏好、浏览器语言或英文 fallback 产生。
- 不属于 SceneDocument、ProjectRecord、history、archive 或 runtime snapshot。

## LanguagePreference

| Field       | Meaning                    | Validation   |
| ----------- | -------------------------- | ------------ |
| application | `studio` 或 `factory-demo` | 由调用方固定 |
| locale      | `en` 或 `zh-CN`            | 无效值忽略   |

存储在浏览器 `localStorage` 的应用专用 key。切换状态为 `detected -> user-selected -> restored`，
任何阶段都只影响展示。

## TranslationCatalog

- 英文 catalog 是结构源。
- 中文 catalog 必须递归满足相同 key 与函数签名。
- 动态文案由 catalog 函数接收变量，不在组件中拼句子。
- 用户内容、业务 ID、路径、hash、revision 与未知诊断不作为 catalog value。

## FactoryPresentationMap

- `equipment.labelKey` / `equipment.areaKey`: 稳定演示 key，映射到 app-local catalog。
- `ConnectionStatus` / equipment state: 协议值到 translation key 的显式映射。
- `RuntimeAlarm.ruleId`: 仅已知 reference rule 映射到翻译；未知 `message` 保留。

这些映射不修改 adapter envelope、runtime alarm、SceneDocument 或业务 ID。
