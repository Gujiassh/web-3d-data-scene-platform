# Quickstart: 中英文界面国际化验收

## Automated gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:i18n
pnpm test:e2e
./scripts/verify-product-design.sh
```

## Manual smoke

1. 以无语言偏好的中文浏览器打开 Studio，确认首屏、toolbar、tree、Inspector、dialog 与 Canvas
   可访问名称均为中文，`document.documentElement.lang === "zh-CN"`。
2. 切换到 English，确认页面立即更新且 Canvas DOM 节点未更换；刷新后仍为英文。
3. 在 Studio 导入模型、编辑 transform、Undo/Redo、保存和导出；切换前后比较 canonical JSON，
   SceneDocument、revision、selection 与项目名不因 locale 改变。
4. 在 Factory 运行遥测，切换语言后 connection、告警数量、选中设备与 telemetry cycle 连续；
   已知状态和告警翻译，business ID 与未知诊断保持原文。
5. 在 1440x900、1280x720 和 Factory 768x1024 检查无页面横向溢出、遮挡或控件跳动。
