# M0 Reference Fixture Strategy

> 状态：Accepted test evidence
> 初始日期：2026-07-13
> 迁移日期：2026-07-15

## 当前角色

`tests/fixtures/m0-factory/` 保存 M0 的确定性 GLB、SceneDocument、node manifest、生成器和
CC0 许可证。它用于验证真实 GLB inspection、资产哈希、glTF node index、archive 往返、规则
投影和浏览器运行时，不是 Studio 生产资产，也不代表独立 Factory 产品表面。

feature 005 迁移目录时保持 GLB、manifest、SceneDocument、生成器和许可证内容不变。已接受
的 GLB oracle 是：

```text
bytes=1216
sha256=e123f3d64ec60f136d8673478eb2fd2ce28f56bcb5fb94cef5a7377b9605efe8
```

fixture 内部保留历史工厂 ID、设备数据路径和规则，因为这些值本身是合法的领域中立合同
样例。不得为了产品改名而产生无业务价值的 hash、node mapping 或 archive churn。

## 许可

- 生成器随平台代码使用 MIT。
- 生成的 GLB 使用 CC0-1.0。
- fixture 必须保留许可证、生成来源、字节数和 SHA-256。
- 不引入来源不明、禁止再分发或只有个人使用权的模型和纹理。

## 生成

当前 M0 fixture 由 Node.js 脚本确定性生成：

```bash
node tests/fixtures/m0-factory/scripts/generate-m0-asset.mjs
```

重生成属于显式 fixture 更新，必须同时验证所有文件 diff、GLB hash、manifest、SceneDocument
资产引用、runtime node mapping 和 archive round-trip。普通路径迁移不得顺带重生成。

## 坐标与节点合同

- glTF 使用右手坐标系、Y-up 和米制单位。
- 业务 Target 由资产 SHA-256 与 glTF node index 识别。
- 节点名称只用于调试，不作为稳定业务 ID。
- 禁止依赖第一个 Mesh、名称模糊匹配或遍历顺序推断业务含义。
- node manifest 必须与 GLB 实际 node index 一致。

## 测试所有权

- `packages/document`：SceneDocument 结构、语义和确定性序列化。
- `packages/runtime`：GLB inspection、hash、node mapping、规则投影和 Viewer lifecycle。
- `apps/studio` tests：IndexedDB、导入、JSON/ZIP 和 Run 行为。
- Playwright：真实 WebGL、Canvas 像素、状态色、选择、告警和 context restoration。

Studio production build 不复制该目录。旧 Factory harness 的 Vite 映射已在 Studio Run 替代
证据通过后与应用一起删除；fixture 只由自动化测试从仓库路径读取。

## 验收

- fixture 文件可从仓库固定路径直接读取。
- GLB 字节数和 SHA-256 与 accepted oracle 一致。
- manifest 记录相同 hash、byte length 和两个 node target。
- SceneDocument 通过当前 Schema 与语义校验。
- 测试不通过名称、顺序或 first-available 推断 Target。
- 目录不进入 Studio production build。
- 许可证与生成器随 fixture 一同存在。
