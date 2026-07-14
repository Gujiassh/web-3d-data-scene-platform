# 市场与定位记录

> 调研日期：2026-07-13
> 说明：这是用于产品定位的公开信息扫描，不是完整商业尽调。

## 竞品类别

| 产品              | 类别                           | 主要重心               | 本项目应避免的正面竞争             |
| ----------------- | ------------------------------ | ---------------------- | ---------------------------------- |
| Three.js Editor   | 开源通用场景编辑器             | 场景和材质编辑         | 不以“又一个 Three.js Editor”为定位 |
| Spline            | 商业 3D 设计平台               | 视觉创作、交互和协作   | 不做在线建模和设计师协作套件       |
| Vectary           | 商业 3D/AR 平台                | 配置、展示和营销内容   | 不争夺完整营销内容生产链路         |
| PlayCanvas Editor | Web 3D 开发平台                | 完整应用与游戏开发     | 不做通用引擎和云端 IDE             |
| Triplex           | React Three Fiber 可视化工作区 | 开发者组件和场景工作流 | 不绑定 React 组件作为唯一场景表达  |
| Babylon.js Editor | Babylon.js 场景编辑器          | 引擎场景编辑           | 保持 Three.js 生态和数据运行时特色 |
| AWS IoT TwinMaker | 企业数字孪生平台               | 云端工业数据和 3D 场景 | 不做云平台、IoT 后端和企业套件     |

## 公开来源

- Three.js Editor: https://threejs.org/editor/
- Spline: https://spline.design/
- Vectary: https://www.vectary.com/
- PlayCanvas Editor: https://playcanvas.com/products/editor
- Triplex: https://github.com/pmndrs/triplex
- Babylon.js Editor: https://github.com/BabylonJS/Editor
- AWS IoT TwinMaker: https://aws.amazon.com/iot-twinmaker/

## 差异化切入点

### 核心差异

不是在浏览器里创建高精度模型，而是将已有模型转化为可由实时业务数据驱动的
可嵌入场景。

### 对外表述

> Import a 3D scene, bind entities to live data, and embed the resulting
> viewer in an existing web application.

### 必须同时成立的能力

- 开源和可自托管
- 行业无关的版本化场景协议
- 可视化数据绑定和状态规则
- Editor 与 Viewer 语义一致
- 不强制宿主应用采用特定 UI 框架
- 工厂示例能证明实时监控，但不污染平台核心模型

## 开发前风险审查

### 风险结论

**中高风险。** 技术展示和求职价值明确，但通用编辑器市场成熟，目前没有证据证明
目标开发者愿意采用新的场景协议和运行时。

### 最大假设

目标前端团队认为“数据绑定 + 可嵌入 Viewer + 自托管”比继续编写项目内定制代码
更有价值。

### 最先寻找的证据

让 3 至 5 名目标开发者实际完成以下任务并观察阻塞点：导入模型、绑定一个故障字段、
配置颜色规则、导出场景、在独立 React 页面加载 Viewer。

### 立即执行的最小验证

只构建一条垂直链路：一个 GLB、两个实体、一个模拟 WebSocket、三种状态规则、一份
场景文档和一个嵌入式 Viewer。验证通过后再扩展完整编辑能力。

### 延后内容

- 多人协作和云端项目管理
- 插件市场和复杂扩展系统
- 浏览器内建模和高级材质节点
- 真实工业协议与硬件连接
- 大型资产库、完整工厂和物理仿真
- 账号、组织、权限和计费

## 开源策略

- 代码默认 MIT。
- 示例模型仅使用原创或明确允许再分发的资产，并保存来源与许可证。
- Editor、场景协议、数据适配器和 Viewer 均公开，保证作品可被完整审阅。
- 发布在线演示、最小集成示例、架构决策记录和可复现性能基准。
- 暂不设计 open-core 商业边界；商业化不是当前成功条件。
