# Feature Specification: 中英文界面国际化

**Feature Branch**: `003-bilingual-ui`
**Created**: 2026-07-15
**Status**: Completed and accepted
**Input**: User description: "整体梳理界面文案，先支持中文和英文。"

## User Scenarios & Testing

### User Story 1 - 使用熟悉的界面语言 (Priority: P1)

中文或英文用户打开 Studio 或 Factory Demo 时，可以立即以熟悉的语言理解导航、按钮、
状态、空状态、表单、弹窗和可访问名称，并完成原有工作流。

**Why this priority**: 国际化的首要价值是消除界面理解障碍，同时不能破坏现有编辑和监控流程。

**Independent Test**: 分别以中文和英文打开两个应用，完成 Studio 模型导入与 Factory 设备选择，
核对所有当前可见界面文案及可访问名称均使用所选语言。

**Acceptance Scenarios**:

1. **Given** 浏览器首选语言为中文且没有已保存偏好，**When** 用户首次打开任一应用，**Then**
   界面默认显示简体中文。
2. **Given** 浏览器首选语言不是中文且没有已保存偏好，**When** 用户首次打开任一应用，**Then**
   界面默认显示英文。
3. **Given** 任一受支持语言，**When** 用户执行原有核心流程，**Then** 功能行为、文档内容和
   revision 语义与国际化前一致。

---

### User Story 2 - 随时切换并记住语言 (Priority: P2)

用户可以在应用首屏直接切换中文或英文，切换后当前页面立即更新，并在刷新或重新打开后继续
使用该语言。

**Why this priority**: 浏览器语言不一定等于用户偏好，显式切换是可控和可验证的必要能力。

**Independent Test**: 在两个应用中切换语言并刷新，核对可见文案、`lang` 属性和已保存偏好。

**Acceptance Scenarios**:

1. **Given** 当前为英文，**When** 用户切换为中文，**Then** 页面无需重载即可更新全部固定文案。
2. **Given** 用户已选择中文，**When** 刷新或重新打开同一应用，**Then** 仍显示中文。
3. **Given** 保存了无效或已不支持的语言值，**When** 应用启动，**Then** 忽略该值并按浏览器
   语言规则选择受支持语言。

---

### User Story 3 - 保持技术与业务数据原义 (Priority: P3)

用户切换语言时，项目名称、实体名称、业务 ID、数据路径、SHA-256、诊断码和导入导出内容保持
原值，避免界面翻译改变数据含义。

**Why this priority**: 国际化只能改变呈现，不得污染持久化合同或运行时协议。

**Independent Test**: 切换语言前后导出 canonical JSON 并比较，确认文档 diff 为零；同时检查
界面中的稳定 ID、业务 ID、格式名和 hash 未变化。

**Acceptance Scenarios**:

1. **Given** 已打开项目并选中实体，**When** 用户切换语言，**Then** selection、revision、history
   和保存状态不发生语义变化。
2. **Given** Factory Demo 正在接收遥测，**When** 用户切换语言，**Then** connection、alarm、
   selection 和 telemetry 周期不中断。

### Edge Cases

- 浏览器返回 `zh`、`zh-CN`、`zh-Hans` 或包含中文的语言列表时，统一选择简体中文。
- 浏览器语言缺失、不可识别或保存值损坏时，稳定回退到英文。
- 超长中文或英文文案不得造成按钮、toolbar、dialog、tree、Inspector 或 operations rail 溢出。
- 用户创建的项目名、导入模型名和实体名按原文显示，不自动翻译。
- GLB、glTF、JSON、ZIP、SHA-256、entity ID、business ID、pointer、revision 和诊断码保持原样。
- runtime 或导入器提供的未知技术错误保留原始消息；应用自身定义的固定错误和状态需要翻译。

## Requirements

### Functional Requirements

- **FR-001**: Studio 与 Factory Demo 的全部固定可见文案 MUST 同时提供简体中文和英文版本。
- **FR-002**: 两个应用 MUST 在首屏提供可发现且可访问的中文/英文切换控件。
- **FR-003**: 没有有效保存偏好时，系统 MUST 根据浏览器语言选择中文或英文，并以英文作为最终
  回退语言。
- **FR-004**: 用户显式选择的语言 MUST 作为浏览器本地应用设置保存，并在刷新和重新打开后恢复。
- **FR-005**: 语言切换 MUST 无需重载当前页面，并同步更新可见文案、`aria-label`、`title`、
  空状态、状态标签和日期/数字展示。
- **FR-006**: 系统 MUST 为带变量和数量的文案提供结构化格式化，禁止组件拼接不可翻译的句子。
- **FR-007**: 用户内容、稳定 ID、业务 ID、技术格式名、hash、路径、revision、诊断码和协议值
  MUST 保持原值。
- **FR-008**: 语言偏好、词典 key 或 locale metadata MUST NOT 写入 `SceneDocument`、project
  record、command history、JSON/ZIP archive 或 runtime snapshot。
- **FR-009**: Studio 的保存、导入、编辑、Undo/Redo、Run gate、reload flush 和归档流程 MUST
  在两种语言下保持相同行为。
- **FR-010**: Factory Demo 的遥测、连接、告警、选择、聚焦和恢复周期 MUST 在切换语言时不中断。
- **FR-011**: 应用自定义的固定状态与错误文案 MUST 翻译；未知 runtime/浏览器原始错误 MUST
  保留诊断码和原始消息，不得猜测其业务含义。
- **FR-012**: HTML 文档语言属性 MUST 与当前 locale 同步，语言切换控件 MUST 暴露当前选择。

### Non-Functional Requirements

- **NFR-001**: 切换语言后，当前视口内固定文案 MUST 在一个动画帧内完成更新，不重建 Three.js
  Viewer、adapter、project repository 或 command history。
- **NFR-002**: 新增翻译层 MUST 保持类型可检查，缺失 locale key 必须在开发和测试阶段失败。
- **NFR-003**: 1440x900、1280x720 与 Factory 768x1024 验收视口不得出现横向页面溢出、
  文案遮挡或控件尺寸跳动。
- **NFR-004**: 国际化不得新增网络请求、远程翻译服务或运行时动态代码执行。

### Key Entities

- **Locale**: 当前受支持界面语言，首期只包含简体中文和英文。
- **Translation Key**: 稳定的界面语义标识，与具体语言文本分离。
- **Language Preference**: 浏览器本地应用设置，只影响呈现，不属于项目或场景数据。

## Assumptions

- 首期 locale 标识使用 `zh-CN` 与 `en`；其他中文地区标签统一映射到 `zh-CN`。
- 两个应用分别保存本地偏好，因为开发和部署时可能位于不同 origin。
- 参考 Factory Demo 的设备标签、区域和已知告警属于演示呈现，可在宿主 UI 翻译；
  `SceneDocument` 内原始内容保持不变。
- 当前版本不提供在线词典加载、自动翻译、第三方语言包、RTL 或中文以外的更多语言。

## Success Criteria

### Measurable Outcomes

- **SC-001**: 自动扫描确认两个应用生产组件中的固定用户界面文案 100% 通过 translation key 或
  明确的不可翻译白名单提供。
- **SC-002**: 中文和英文各完成一次 Studio 核心编辑/保存流程及 Factory 遥测流程，功能断言全部
  通过且无 page/console error。
- **SC-003**: 用户切换语言后无需刷新即可看到全部当前固定文案更新，刷新后 100% 恢复所选语言。
- **SC-004**: 切换语言前后导出的 canonical `SceneDocument` diff 为零，revision、selection 和
  runtime connection 状态不因语言切换改变。
- **SC-005**: 所有目标视口页面横向与纵向溢出不超过 1px，关键 toolbar、dialog、tree、Inspector
  和 operations 文案不重叠。
