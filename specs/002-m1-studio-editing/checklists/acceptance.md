# M1 验收检查表

## 合同

- [x] SceneDocument Schema 未改变。
- [x] 每个持久化编辑只通过 DocumentCommand。
- [x] execute、undo、redo 的 revision 单调且每次只增加一次。
- [x] 保存和导出不含 session/runtime/blob URL。
- [x] JSON 和 ZIP 往返 canonical document 一致。

## 项目与资产

- [x] IndexedDB project + assets 使用原子 transaction。
- [x] 500ms autosave 与显式 flush 可验证。
- [x] save failed 不覆盖旧 project record。
- [x] GLB/自包含 glTF 在确认前只产生摘要。
- [x] 无效模型和归档不改变项目、资产库或 history。

## 编辑

- [x] 树和视口共享 entity selection。
- [x] rename、visibility、lock、transform、duplicate、delete 可撤销重做。
- [x] TransformControls 拖动只提交一个命令。
- [x] locked entity 不显示或响应 transform gizmo。
- [x] Run 模式不能提交文档命令。

## 证据

- [x] Unit、integration、Playwright 与 production build 通过。
- [x] M0 Factory 和 Studio narrow gate 无回归。
- [x] 截图覆盖 import summary、transform、undo、lock、save failure 和 reload。
- [x] 下载 ZIP 清单与 asset hashes 经机器验证。
- [x] 无 console/page error、空 Canvas 或页面溢出。
- [x] 外部 review findings 已关闭或明确裁决。
