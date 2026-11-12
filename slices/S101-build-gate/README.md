# S101 · 构建门禁：两次尝试均未通过（如实记录，不宣称构建绿）

> 目的：P0 交付前还差最后一道门——`yarn build`。本轮跑了两次，**都没通过**，且都不是本片代码导致的错误；结论是“构建门禁被工具链阻塞”，不是“构建通过”。
> 状态：**BLOCKED（工具链/资源）**；未改依赖、未改构建配置、未动他人文件。

## 1. 尝试一：默认 Turbopack 构建

```
Error: Turbopack build failed with 7 errors:
Error: Error evaluating Node.js code
Error: Cannot find module '@tailwindcss/postcss'
```

7 条错误全部指向**安装包里的 CSS 导入**（planner 的 MdxEditor、workflows 的 xyflow、customers 地图的 leaflet 等），外加 `./src/app/globals.css` → `layout.tsx`。没有一条指向本任务改动的文件。

排除“依赖没装”：

- `package.json` 里 `@tailwindcss/postcss: ^4.3.2` 存在，`node_modules/@tailwindcss/postcss` 已安装（4.3.3）；
- 在仓库根 `node -e "require.resolve('@tailwindcss/postcss')"` **能解析**；
- `postcss.config.mjs` 自 `459fcf1` 起未变。

即：这是该环境下 Turbopack 加载 postcss 插件时的解析问题，不是 manifest/依赖缺失。

## 2. 尝试二：`next build --webpack`

```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
exit status 134
```

在 `ila3-heavy-task` 的受限单元（`MemoryHigh=5G` / `MemoryMax=7G`）下 OOM。宿主 30G、构建时可用约 10G；要跑通需要提高该单元的 MemoryMax 或放宽构建内存——属资源策略变更。

## 3. 能宣称什么 / 不能宣称什么

| 项 | 结论 |
| --- | --- |
| 我们的改动是否有编译错误 | `yarn typecheck` exit 0（57 套件 / 334 测试全绿）；两次构建的报错列表里**没有本任务的任何文件** |
| 构建是否通过 | **否**。没有绿色构建证据，不拿类型检查冒充 |
| 是否本任务引入 | 不是。第一条是安装包 CSS + postcss 插件解析；第二条是内存上限 |
| 是否需要改代码修 | 不需要（也不该为了“变绿”去改依赖或构建配置） |

## 4. 解除阻塞的选项（都需你/环境负责人拍板）

1. 修 Turbopack 的 postcss 解析（工具链问题；可能需要改 `postcss.config.mjs` 或 Next 版本，属依赖/配置变更）；
2. 放宽重任务单元内存（把 `MemoryMax` 提到可容纳 webpack 构建，如 12G）后再跑 `next build --webpack`；
3. 在 CI 里构建（干净环境 + 既有流水线），以流水线结果作为构建证据。

在上述任一到位前，`ACCEPTANCE-MATRIX` 的构建项保持 **BLOCKED**，`preflight` 仍不含构建（S100 已注明）。

## 5. 证据

- `/tmp/s101-build.log`（Turbopack，7 条 postcss 解析错误）
- `/tmp/s101-build-webpack.log`（webpack，V8 OOM，exit 134）
- `yarn typecheck` exit 0；`npx jest src/modules/communications` → 57 passed / 9 skipped / 334 tests
- `.next` 仅剩事件文件（无可用构建产物），未删除任何他人产物
