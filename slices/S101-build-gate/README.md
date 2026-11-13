# S101 · 构建门禁：三次尝试均未通过（第三次已定位 postcss 报错的触发条件，仍被 7G 内存杀死）

> 目的：P0 交付前还差最后一道门——`yarn build`。前两次（Turbopack postcss 解析、webpack OOM）都没过；第三次换掉 distDir 后 **postcss 报错消失**，但构建在 41 分钟后被受管单元 OOM 杀死。结论：构建门禁仍 **BLOCKED**，且现在只剩“内存/资源”一个已知原因。
> 状态：**BLOCKED（资源）**；未改依赖、未改构建配置、未动他人文件。

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

## 6. 尝试三（2026-11-13）：仓库内 dist 目录 → postcss 报错消失，仍被 7G 单元 OOM 杀死

动机：前两次里，第一次的 7 条错误全部发生在 postcss 配置求值阶段。先查 distDir 去哪了：

- `.mercato/next` 在仓库里是**符号链接** → `/storage/build-cache/crm/next`（`ls -l .mercato/next`，建于 11-09 13:43；该缓存 2.6G，**没有 BUILD_ID**）；
- 多个历史工作树（如 `/data/crm/worktrees/crm-menu-v2`）用**本地** `.mercato/next`，其 `build-info.json` 记录 `status:"ok"`（2026-11-10T10:14:28Z，同 Next 16.3.6、同 postcss 配置——`postcss.config.mjs` 自 `459fcf1` 未变）。

于是第三次只换一个变量，不改任何配置，把产物目录指到仓库内（`OM_DIST_DIR` 是 self-update 用 `.mercato/next-staging` 的同一条已支持路径）：

```
XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  /home/pro/.local/bin/ila3-heavy-task env OM_DIST_DIR=.build-probe/next yarn build
```

观察（日志 `/tmp/s101b-build-localdist.log`）：

- `yarn generate` 完成；Next 16.3.6 Turbopack 启动，进入 `Creating an optimized production build ...`；
- **第一次那 7 条 `Cannot find module '@tailwindcss/postcss'` 没有再出现**（编译阶段持续约 40 分钟，无该错误）；
- 41 分 46 秒时被 cgroup OOM 杀死：`journalctl --user -u ila3-heavy-7f6cc5b6af` 记录 “kernel OOM killer killed some processes in this unit … Failed with result 'oom-kill'”，`Consumed … 5G memory peak, 940.3M memory swap peak`；`yarn build` 退出 1，`.build-probe/build-info.json` 停在 `status:"building"`（探针目录已删除，字节留在 `/tmp/s101b-build-probe-stamp.json`）。

旁证：本次 `generate` 的 OpenAPI 步骤出现 `Bundle approach failed: spawnSync /usr/bin/node ETIMEDOUT`，回退到静态抽取（592 paths，schema 省略）。这是受限单元下的生成告警，与 postcss 无关，也不改结论。

### 结论（可核对）

| 结论 | 证据 |
| --- | --- |
| postcss 解析错误与“distDir 指向仓库外的符号链接”相关，而不是依赖缺失或本任务代码 | 同一 HEAD、同一 node_modules：符号链接 dist → 7 条解析错误；仓库内 dist → 无该错误 |
| 构建内存需求超过受管单元 7G | `Failed with result 'oom-kill'`，5G peak / 940.3M swap |
| 构建仍未通过 | 无 BUILD_ID、无 `status:"ok"` |

因此解除方式收敛为一条：**把重任务单元内存提到约 12G（需你/环境负责人批准资源策略），或在 CI 构建**；沿用符号链接缓存目录时，需先确认它不是报错触发条件（建议把 dist 改成仓库内目录后重建缓存）。
