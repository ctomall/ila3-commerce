# ILA3 Commerce：结构与视觉优化任务书

> 基线：`f72e348`（2026-11-05）
> 依据：本轮实测（`/login` HTML 1 546 KB / 内联字典 21 438 键 / 668 模块中 68 启用 / 558 个 `page.meta` / 546 条路由）
> 视觉基线截图：`/home/pro/dsh/shots/05-dashboard.png`、`06-customers-list.png`

## 0. 总目标（OKR）

| 维度 | 现状 | 目标（2026-12-05 前） |
|---|---|---|
| 首屏体积 | `/login` 1 546 KB，内联 21 438 键 | ≤ 150 KB，内联 ≤ 1 500 键 |
| 公网 TTFB p95 | 1.79 s | ≤ 0.8 s（缓存命中 ≤ 0.3 s） |
| 界面语言一致性 | 中英混排 + 原始枚举（`in_progress`/`healthy`） | 无裸枚举、无英文残缺文案 |
| 可访问性 | 侧边栏 16 项无可访问名称 | 导航项 100% 有 `aria-label` |
| 设计系统 | 472 个 CSS 变量平铺 | 三层令牌 + lint 约束 |

**完成定义（DoD，每个任务都要满足）**

1. 有代码变更 + 有验证命令输出；
2. 不降低中文覆盖率（回归用例：18 业务页 + 26 设置页）；
3. 不引入新的 `node_modules` 补丁（除非同时登记进 `scripts/patches-manifest.json`）；
4. 通过 `yarn build`；
5. 变更可回滚（`git revert` 即可，无手工步骤）。

---

## 1. 任务分解

### E1 结构：渲染边界与模块治理（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T1** | `/login` 与 `/backend` 壳分离 | 新增 `src/app/(auth)/layout.tsx`；`src/app/layout.tsx` 只保留最小 provider | `/login` HTML ≤ 150 KB；`curl` 后统计内联键 ≤ 1 500 | — | 1.5 d |
| **T2** | 字典外置为可缓存资源 | `src/lib/i18n/*`、新增 `src/app/api/i18n/[locale]/route.ts` | 响应头 `cache-control: public, max-age=31536000, immutable`；CF `cf-cache-status: HIT` | T1 | 1.5 d |
| **T3** | 模块套餐化 | `src/modules.ts` 拆 `core/business/extension`；复用 `feature_toggles` | 关闭 extension 套餐后内联键再降 ≥ 30%；`yarn build` 时间下降 | T2 | 2 d |
| **T4** | 路由 `-v2` 收敛 | `src/proxy.ts` 加 rewrite；`docs/routes.md` 生成路由清单（546 条） | 对外无 `-v2` 路径；旧路径 301；清单与 `route.ts` 数量一致 | — | 2 d |

### E2 视觉一致性（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T5** | 状态枚举语义化 | 用 `registerComponentOverrides`（`@open-mercato/shared/modules/overrides`）覆盖列表/看板状态单元格，**不改 `node_modules`**；新增 `src/lib/status-label.ts` + `docs/glossary.zh.md` | DOM 扫描无 `in_progress\|open\|lost\|win\|healthy\|monitor` 裸值；未知枚举显示 `—` 并上报 | — | 1.5 d |
| **T6** | 日期/数字/货币本地化 | 统一 `Intl.*` 封装，替换零散 `toLocaleString` | 中文界面无 `Nov 3, 2026`/`3:10 PM` 形态 | T5 | 0.5 d |
| **T7** | 英文残余文案收口 | 列表底栏、空状态、按钮、页脚（`Showing 1 to 3 of 3 results in 549ms`、`20 per page`、`No customer tasks yet.`） | 抽查 18 业务页 + 26 设置页，英文残留清单归零 | T5 | 1 d |

### E3 信息架构与可访问性（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T8** | 侧边栏分组 + `aria-label` | 用 `modules.ts` 的 `groupOrder` 渲染分组标题；icon-only 链接补名称 | 可访问性快照中导航项 **100% 有名称**；分组 ≤ 8；Tab 顺序可用 | T3 | 2 d |
| **T9** | 表格列优先级 | 默认列 ≤ 5，其余进「自定义列」（功能已存在） | 1280 px 下无横向滚动；默认列数断言 | — | 1 d |

### E4 设计系统（P1）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T10** | 令牌三层化 | `globals.css` 拆 primitive/semantic/component | 组件不再直接引用 primitive 变量（stylelint 规则） | — | 3 d |
| **T11** | 空/错/载三态组件 | 新增 `<EmptyState>` `<ErrorState>` `<SkeletonTable>` | 6 个主页面三态齐全，截图留档 | T10 | 2 d |

### E5 品牌与稳态（P1）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T12** | VI 资产包 | logo 变体、favicon 16/32/180、登录主视觉、空状态插图 | 资产清单齐备；`/login` 首屏使用主视觉 | T7 | 2 d |
| **T13** | 暗色视觉基线 | 6 个主页面暗色截图入 `docs/visual-baseline/` | 暗色下对比度 ≥ 4.5:1 | T10 | 1 d |
| **T14** | 页脚版本品牌化 | `Version 0.9.0` → 产品版本 + 构建号（`git rev-parse --short`） | 页脚显示 `ILA3 Commerce · vX.Y.Z (abc1234)` | — | 0.5 d |

### E6 可迁移性（P2）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T15** | 升级原子化 | CI 预构建产物 + 软链/容器 tag 切换 | 升级窗口 ≤ 60 s（现 2–7 min） | — | 5 d |
| **T16** | 补丁治理 | `scripts/patches-manifest.json` + `postinstall` 断言 | 重新 `yarn install` 后补丁自动校验通过 | — | 1 d |
| **T17** | 字典 CRLF 清洗 | `scripts/normalize-i18n.mjs`（幂等）；清洗 `src/i18n/*.json` | 字典中含 `\r` 的值 = 0；`yarn build` 通过；页面抽查无异常空白 | T5 | 0.5 d |

### 1.32 轮次进展（Round 26，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **全站回归（18+26）** | ✅ 通过 | 44/44 页中文正常、0 个 404、0 个报错 |
| 英文残留 | ✅ 归零（1 处为刻意展示） | 唯一命中 `/backend/config/customers` 的 `in_progress` 是字典编辑表的「值」列 |

**回归口径**：真实浏览器逐页加载，检查中文渲染 / 残留词 / 404 / 标题。
明细见 `docs/regression-2026-11-05.md`。

**关于 `in_progress`**：该页是「商机状态」字典编辑表，`值` 列展示代码、`标签` 列展示中文
（`in_progress` / `进行中`）。编辑界面必须让用户看到代码，**判定不是缺陷**。

---

### 1.31 轮次进展（Round 25，2026-11-05）

| 任务 | 状态 | 结论 |
|---|---|---|
| **T10** 第 3 阶段（L1 归并） | ✅ 完成（目标修正） | 343 个唯一令牌中 **179 个是 Tailwind 主题令牌（不可删）**，164 个业务令牌**全部在用** |

**「≤220」目标不成立的证据**

```
total unique        : 343
theme tokens        : 179   (Tailwind 依赖 bg-*/rounded-* 等工具类)
non-theme tokens    : 164   referenced: 164   unreferenced: 0
```

死令牌已在 Round 21 清理（23 个）；剩余 164 个无一闲置。
因此「声明数 ≤220」要么等于删除主题令牌（会破坏工具类），要么不可达。

**T10 验收修正**

| 原目标 | 修正 |
|---|---|
| 声明数 ≤ 220 | 死令牌 = 0（达成）；主题令牌不计入 |
| 组件不引用 primitive | `tokens:check --strict` 基线 0（达成） |
| — | 新增：令牌构成可解释（`docs/design-tokens.md` 第 3 节） |

---

### 1.30 轮次进展（Round 24，2026-11-05）

| 任务 | 状态 | 结论 |
|---|---|---|
| **T3** 运行时验证 | ❌ 证实无效果 | 线上切 `business` 实测：客户页 907 KB / 5 428 键、导航 40 项、扩展模块页 200 —— **全部与基线一致** |
| 实验安全性 | ✅ | 已回滚（`.env` 恢复、服务重启、页面 200） |

**否定性结论（第二轮）**

T3 的过滤写在 `src/modules.ts` 的导出数组上，但运行时注册表来自
`.mercato/generated/modules.generated.ts`（构建期按文件系统扫描生成），
**根本不读这个数组**。所以套餐在「构建期」和「运行时」两侧都无效。

**建议**：要么把过滤接进生成器（工作量中等、影响面大），要么**删除该机制**避免误用。
本轮不改代码，仅把结论与证据固化到 `docs/module-tiers.md`，避免后续有人以为它能用。

---

### 1.29 轮次进展（Round 23，2026-11-05）

| 任务 | 状态 | 结论 |
|---|---|---|
| **T3** 模块套餐化 | ✅ 机制 + 决策指南完成 | `docs/module-tiers.md`；**实测证明套餐不影响构建** |
| 实测数据 | — | core/all 冷构建均 **71 s / 2.3 G / 66 个模块导入**，完全一致 |

**否定性结论（重要）**

原计划里 T3 的预期是「关闭 extension 套餐后内联键降 ≥30%、构建时间下降」。
实测推翻了后半句：**代码生成与打包按文件系统扫描模块包，不读 `enabledModules`**，
所以套餐对构建时间/产物大小**零影响**。

套餐真正影响的是**运行时注册表**（导航项、字典挂载、页面可见性），
而这一项**尚未在生产验证**（需真正切换一次并实测）。

**因此本轮把 T3 定位为「机制可用 + 收益未证实」，并补充了决策指南与已知风险**
（示例模块 API 路由会因实体缺失导致 core 套餐构建失败）。

---

### 1.28 轮次进展（Round 22，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T11** 页面接入 | 🟡 3/6 | 系统升级（错误态+加载骨架）、模块应用（空状态）、设置首页（空状态） |
| 空状态 DOM 验证 | ✅ | 模块列表搜索无结果：插图存在 + 提示「调整搜索关键词或筛选条件后重试。」 |

**本轮接入**

| 页面 | 接入内容 |
|---|---|
| `module_directory` | 空状态替换为 `<EmptyState>`（含插图 + 二次说明） |
| `settings_home` | 搜索无结果替换为 `<EmptyState>` |

**未触发的验证**

设置首页的搜索框只在特定渲染路径出现（实测该路由无 `input`），因此其空状态**未能在 DOM 触发**，
仅有代码接入；这点如实标注。

---

### 1.27 轮次进展（Round 21，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T10** 第 2 阶段 | ✅ 完成 | 删除 **23 个死令牌 / 30 行**（globals.css 1155 → 1125）；构建通过 |
| 视觉回归 | ✅ 零差异 | 登录页 + 客户页的计算样式逐项对比 `diffs: []` |
| 动态引用检查 | ✅ 新增 | `yarn tokens:dynamic` 命中 0（仅检查器自身） |

**本轮事故（如实记录）**

| 项 | 内容 |
|---|---|
| 现象 | 第一次按「产物零引用」删了 187 个令牌，构建报 `Cannot apply unknown utility class border-border`，**服务中断约 6 分钟** |
| 根因 | Tailwind v4 的主题令牌（`--color-*`、`--radius-*`）通过 `@apply` / 工具类消费，**构建前不产生 `var()`**，被误判为死令牌 |
| 恢复 | `git checkout -- src/app/globals.css` → 重建 → 服务恢复 |
| 修正 | 清理脚本加入主题命名空间保护，最终安全删除 23 个 |

---

### 1.26 轮次进展（Round 20，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T10** 令牌三层化 | 🟡 第 1 阶段完成 | 审计脚本、分层模型、构建闸门；组件层非语义使用 **0** |
| 构建闸门 | ✅ 生效 | `non-semantic usages: 0` 出现在 `yarn build` 日志中 |

**审计结论（以构建产物为准）**

| 指标 | 数值 |
|---|---|
| 声明令牌 | 366 |
| `.dark` 覆盖 | 147 |
| 产物中被引用 | 480（含 Tailwind 内部变量） |
| **产物中零引用（死令牌候选）** | **187** |
| 组件层非语义使用 | **0** |

**方法论修正（重要）**

最初用源码 `grep var(--x)` 得到「199 个死令牌」，但 Tailwind 工具类编译后才产生
`var()`，源码口径会**高估**。改用构建产物 CSS 统计后为 187，且发现 480 个被引用令牌中
大部分来自 Tailwind 内部变量——这说明**审计必须看产物，不能看源码**。

**交付物**

- `scripts/audit-design-tokens.mjs`（`yarn tokens:audit`）
- `scripts/check-token-layers.mjs`（`yarn tokens:check`，`--strict` 接入构建）
- `docs/design-tokens.md`：三层定义、L2 白名单、迁移计划与已知限制

**未完成**：死令牌清理（187 个）与 L1 归并（366 → ≤220），需先补「动态样式引用」检查。

---

### 1.25 轮次进展（Round 19，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T3** 模块套餐化 | 🟡 机制完成，线上仍为 `all` | `OM_MODULE_TIER` 支持 core/business/extension/all；5 个单测通过；默认零行为变化（导航 41/41 不变） |
| 套餐量化 | ✅ | core：27 启用 / 52 禁用 / 约 4 695 个 zh 键不再加载；business：51/28 |

**新增**

- `src/lib/module-tiers.ts`：套餐归属（core=商业主干，extension=集成/渠道/AI/示例）+ 包含关系 + 归一化
- `src/modules.ts`：末尾**原地过滤**（保持数组引用与导出位置不变）
- `scripts/report-module-tiers.mjs` + `yarn modules:tiers`：输出各套餐启用/禁用模块数与字典影响

**为什么线上不切换**

套餐会改变产品功能边界（关掉 extension 就没有多渠道、AI、集成）。
这属于**产品决策**，不是技术决策，因此本轮只交付机制与量化，默认 `all`。

**本轮事故（如实记录）**

| 项 | 内容 |
|---|---|
| 现象 | 构建报 `Can't resolve '@/.mercato/generated/entities/organization'`，服务反复重启失败，**约 10 分钟不可用** |
| 根因 | 我把 `export const enabledModules` 从原位置移到文件末尾，导致路由收集阶段读到 TDZ/顺序异常，模块表为空 |
| 修复 | 恢复原导出位置，改为末尾 `enabledModules.length = 0; push(...)` 原地过滤 |
| 恢复 | 先用 `next-prev` 产物回滚启动（T15 的产物保留在这里救了一次场），再重建 |

---

### 1.24 轮次进展（Round 18，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| 空状态插图 DOM 验证 | ✅ | 空列表（交易记录）与搜索无结果两处 DOM 均检出 `img[src="/brand/state-empty.svg"]` |
| **T16** | ✅ 17 个补丁 | `all 17 patch(es) present` |

**补齐了三个空状态渲染器**

| 渲染器 | 覆盖场景 | 处理 |
|---|---|---|
| `filters/ListEmptyState.js` | 页面自定义空状态（带新建入口） | 传入 `illustration` |
| `filters/SearchEmptyResults.js` | 搜索无结果 | 图标圆圈替换为插图 |
| `backend/DataTable.js`（默认分支） | 通用「暂无结果」 | 传入 `illustration` |

**验证过程中的一个坑**：先看到页面仍显示旧构建号 `563d7c3`，误以为补丁无效；
清浏览器缓存后构建号变为 `7f5cba0`、插图同时出现——说明是 **`immutable` chunk 缓存**，
不是补丁问题。以后验证前端补丁必须先清缓存。

---

### 1.23 轮次进展（Round 17，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T11** 三态组件 | 🟡 组件完成，页面接入 1/6 | `EmptyState` / `ErrorState` / `SkeletonTable` + 2 张插图；系统升级页已接入错误态与加载骨架 |
| 空状态插图（T12 缺口） | 🟡 共享组件已接入 | `ListEmptyState` 补丁已进产物（chunk 内含 `/brand/state-empty.svg`） |
| **T16** | ✅ 15 个补丁 | `all 15 patch(es) present` |

**发现：产品已有两套空状态实现**

1. `ListEmptyState`（共享组件，标题/描述/主行动齐全，缺插图）——本轮已补插图；
2. 各页内部的「未找到结果 / 暂无结果」实现（搜索结果、分页无数据）——**不经过** `ListEmptyState`。

因此「空状态插图」只覆盖第 1 类。本轮尝试用真实空列表验证时，实测触发的是第 2 类
（搜索 `zzz-no-such-company` 与空的交易记录页），所以**插图未能在 DOM 上肉眼确认**，
仅有产物级证据（chunk 内包含该资源引用）。

**未完成（如实记录）**

- 6 个主页面「三态齐全」的目标未达成：目前只有系统升级页接入自有组件；
  其余页面依赖包内实现，逐页接入需要更多补丁轮次；
- 空状态插图的真实页面验证待补：需要一个真正零数据的列表样本。

---

### 1.22 轮次进展（Round 16，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T12** VI 资产包 | ✅ 完成（2 项明确未做） | 8 个资产全部 200；`<head>` 含 16/32 PNG + SVG + apple-touch + OG 标签 |
| OG 绝对地址 | ✅ | `og:image = https://mercato.ila3.top/brand/og-512.png`（补 `metadataBase` 后） |

**资产清单**（`public/brand/`，源文件 SVG + 脚本渲染 PNG）

| 文件 | 用途 |
|---|---|
| `logo-mark.svg` | 主标记（16–512px 通用） |
| `logo-mono.svg` | 单色变体（`currentColor`） |
| `logo-wordmark.svg` | 横排组合标 |
| `favicon-16.png` / `favicon-32.png` | 标签页图标 |
| `apple-touch-icon-180.png` | iOS 主屏 |
| `og-512.png` | 社交分享预览 |

生成：`yarn brand:assets`（sharp 渲染，PNG 提交进仓库，构建不依赖该步）。

**明确未做的两项**（不虚报）

1. **空状态插图** —— 计划随 T11 三态组件一起提供；
2. **登录页主视觉大图** —— 上游登录页是单卡片布局，注入大图需改包内组件，本轮未动。

---

### 1.21 轮次进展（Round 15，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T15** 升级窗口 ≤60s | ✅ 完成 | 实测停机 **10.8 秒**（目标 ≤60s）；升级 `df815fac → 3e358769` 成功，健康检查通过 |
| 升级期间可用性 | ✅ | 构建阶段服务持续返回 200（`build (staging)` 时实测 `/login` 200） |

**做法：先构建、后停机**

1. `next.config.ts` 支持 `OM_DIST_DIR` 覆盖 `distDir`；
2. 升级时 `yarn build` 输出到 `.mercato/next-staging`，**服务继续用旧产物对外服务**；
3. 停机窗口只剩：`stop` → 目录重命名（active→prev，staging→active）→ `start` → 健康检查；
4. `yarn install` 仅在 `yarn.lock` 变化时执行；
5. 失败回滚不再重建，而是**换回 `next-prev` 目录**并重启（秒级）；
6. 停机时长写入 `state.json` 的 `downtimeMs`。

**代价与边界**

- 总升级耗时仍约 6 分钟（构建），但**不影响对外可用性**；
- 磁盘上会同时存在 `next`（2.3G）与 `next-prev`（6.1G），下次升级开始时清理上一代，最多两代共存；
- 依赖变更（`yarn.lock` 变化）才跑 `yarn install`，此时用旧流程的语义仍成立。

---

### 1.20 轮次进展（Round 14，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T2** 后台字典瘦身 | ✅ 完成（模块页） | 客户 **2 095 → 904 KB**（22 384 → 5 426 键）；销售 2 069 → 878 KB；仓储 **1 896 → 541 KB**（2 895 键） |
| 回归 | ✅ 无英文回退 | 5 个裁剪页 DOM 扫描 `hits: []`，中文正常 |
| `/login` | ✅ 未受影响 | 104 KB / 813 键 |

**真相：字典被序列化了两次**

RSC 载荷里存在两个 `I18nProvider`：

1. 根布局 `src/app/layout.tsx`（包住全站）
2. 后端布局 `src/app/(backend)/backend/layout.tsx`（自带一份，注释写明"因为要在 root 之上再挂 provider"）

Round 13 我只裁了根布局，随后又误判"无效"把它回退——实际是**另一个 provider 又把全量塞了回来**。
本轮两处同时裁剪后才真正生效。

**保留全量的路由**：`/backend/config/**`、`/backend/settings`、`/backend/profile`
——设置页会跨模块引用文案，裁剪收益低于回归风险。

---

### 1.19 轮次进展（Round 13，2026-11-05）

| 任务 | 状态 | 结论 |
|---|---|---|
| **T2** 后台字典外置 | ❌ 本轮未达成，已撤回 | 按路由裁剪**在 layout 层生效**，但 HTML 载荷不变 |
| **T1** 回归 | ✅ 未受影响 | `/login` 仍 **104 KB / 813 键** |

**本轮做了什么（可验证）**

1. `auth-dict.ts` 新增 `namespacesForBackendRoute()` / `trimDictionaryToNamespaces()`，
   按 `/backend/<area>` 映射命名空间（customers→customers+sales，config/settings→保持全量）；
2. 8 个单测通过；接入 root layout；
3. 运行时埋点实测：

```
I18N_TRIM_DEBUG   {"path":"/backend/customers/companies","full":23081,
                   "ns":["ui","common","appShell","auth","modules","settings","errors","validation","customers","sales"]}
I18N_TRIM_RESULT  6014        ← layout 传给 AppProviders 的字典确实被裁到 6014
```

**但同一请求返回的 HTML 里仍有 22 384 个内联键。**

**结论：全量字典不是只从 `dict` prop 进入客户端**，还有第二条序列化路径
（最可能是模块注册表把各模块 `translations` 一并序列化，或客户端 bootstrap 自行加载）。

**处置**

- 撤回 layout 的后端裁剪与调试日志（无收益的改动不留）；`/login` 裁剪保留；
- 保留 `namespacesForBackendRoute` 等函数与测试（下一轮仍在同一位置继续）；
- T2 的下一刀必须落在**模块注册/客户端 bootstrap 的翻译序列化**上，而不是 layout 的 prop。

---

### 1.18 轮次进展（Round 12，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T14** 页脚品牌化 | ✅ 完成 | DOM：`ILA3 Commerce · v0.9.0 (7f5dcfe)`，构建号由 `next.config.ts` 在构建时注入 |
| **T13** 暗色视觉基线 | ✅ 完成（基础对比度） | 6 个页面暗色截图存 `docs/visual-baseline/`；正文对比度 **18.97:1**（阈值 4.5） |

**T14 实现**

`next.config.ts` 的 `env` 里用 `git rev-parse --short HEAD` 注入
`NEXT_PUBLIC_BUILD_SHA`，`(backend)/backend/layout.tsx` 把它拼到 `APP_VERSION` 后面。
好处是**每次构建自动带版本指纹**，不用手填。

**T13 口径说明**

- 截图覆盖：登录 / 工作台 / 客户 / 商机 / 设置 / 系统升级 六页；
- 对比度测量的是**正文基准色**（body 前景/背景），18.97:1；
- 逐组件的对比度（按钮、徽标、禁用态）尚未逐个测量，属后续细化项。

---

### 1.17 轮次进展（Round 10–11，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T8 分组** | ✅ 完成并上线 | 设置侧栏 **12 组 → 8 组**：系统(4) / 身份与权限(8) / 客户与门户(2) / 数据与集成(8) / 模块配置(25) / 组织与财务(3) / 开发者与定制(4) / 安全(1)，共 55 个链接 |
| **T8 总验收** | ✅ | 导航项 41/41 有 `aria-label`；分组 **8 ≤ 8** |
| **T16** | ✅ 14 个补丁 | `all 14 patch(es) present` |

**四次尝试才成功，根因逐层剥开**

| 尝试 | 落点 | 失败原因 |
|---|---|---|
| 1 | `ui/.../utils/nav.js` `buildContextSections` | 不在链路上 |
| 2 | 同上，改按中文标签合并 | 不在链路上 |
| 3 | `core/.../backendChrome.js` `serializeSectionGroups`，按中文标签 | 序列化时 label 仍是**英文默认名**，中文由客户端按 `labelKey` 翻译 |
| 4 | 同上，改按 **labelKey** | ✅ 接口返回合并后的 8 组 |

**关键证据（不再靠猜）**

- SSR HTML 中 `"settingsSections":[]` —— 服务端传空，说明侧栏是**客户端**拉取；
- 浏览器网络面板只有 `/api/auth/admin/nav`；
- 该接口返回 `settingsSections`（8 组）+ `groups` + `grantedFeatures` 等；
- 因此正确落点是 `resolveBackendChromePayload` 里的 `serializeSectionGroups`，且必须按 `labelKey` 合并。

---

### 1.16 轮次进展（Round 9，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T14** 页脚品牌化 | 🟡 部分完成 | DOM：`ILA3 Commerce · v0.9.0`（原「版本 0.9.0」）；构建号（SHA）未加 |
| **T8 分组** | ❌ 第三次未生效，已撤回 | 设置区仍 12 组 |

**T8 的第三次尝试（服务端）也没生效**

| 尝试 | 落点 | 结果 |
|---|---|---|
| 1 | `ui/.../utils/nav.js` `buildContextSections` | 12 组 |
| 2 | 同上改为按标签合并 | 12 组 |
| 3 | `core/.../auth/lib/backendChrome.js` `serializeSectionGroups` | 12 组 |

已确认的事实：

- `SettingsNavigation` / `SettingsPageWrapper` 在 `@open-mercato/core|ui` 的 dist 中**没有被任何模块 import**，
  说明设置侧栏不是由这两个文件承载，或者由应用侧另有组合；
- 主侧栏数据来自 `/api/auth/admin/nav`（实测返回 `customers.nav.group` 等），但其中**不含**设置分组标签；
- 因此设置分组的来源仍未定位，**需要一次运行时追踪**（在 `buildContextSections` /
  `serializeSectionGroups` 里埋计数，看哪个真正被调用），而不是继续猜文件。

**处置**：撤回第 3 个无效补丁，manifest 回到 **13 个全部真实生效**。

---

### 1.15 轮次进展（Round 8，2026-11-05）

| 任务 | 状态 | 结论 |
|---|---|---|
| **T8 分组** | ❌ 未达成，已撤回无效补丁 | 设置区仍为 **12 组**（目标 ≤8） |
| **T16 补丁清单** | ✅ 13 个真实补丁 | `all 13 patch(es) present`（无效补丁已从清单移除） |

**两次尝试都没生效，原因值得记录**

| 尝试 | 假设 | 结果 |
|---|---|---|
| 1 | 分组由 `ui/dist/backend/utils/nav.js` 的 `buildContextSections` 组装 | 改完重建，DOM 仍 12 组 |
| 2 | 按渲染标签合并（`item.group`）而非 `groupKey` | 仍 12 组 |

**已定位的真实链路（下一轮直接从这里下刀）**

```
服务端组装分组  →  core/dist/modules/auth/lib/backendChrome.js
                   （含 settings.sections.* 顺序表：system/auth/customer_accounts/...）
        ↓ props.sections
ui/dist/backend/settings/SettingsNavigation.js   （只负责渲染，不组装）
```

即：设置分组是**服务端**生成的，前端 `SettingsNavigation` 只拿到结果。
改前端组装函数当然无效——这是本轮最大的判断失误。

**处置**

- 撤回 `nav.js` 注入，删除 `apply-settings-groups.mjs`，从 manifest 移除该条目；
- 保留 `all 13 patch(es) present` 的真实性：**校验通过必须等价于“补丁真的生效”**，
  否则清单会变成自我安慰。

---

### 1.14 轮次进展（Round 7，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T9** 列优先级 | ✅ 完成并上线 | 客户列表 **5 列**（名称/状态/生命周期阶段/关系健康度/操作）；商机列表 **5 列**（标题/状态/金额/预计成交/操作）；1280 宽 **无横向滚动** |
| **T16** 补丁清单 | ✅ 13 个 | `all 13 patch(es) present` |

**遇到的坑（值得记录）**

第一次补丁把 `hidden: true` 插到了**列对象**上，页面没有任何变化。排查后确认
`DataTable` 读的是 `meta.hidden`（`column.columnDef?.meta?.hidden`），于是改为插入
`meta: { ... }` 内部；同时脚本要能**独立处理两个页面**，否则 companies 已打补丁时
会提前退出、deals 永远不生效。

**效果**

- 默认视图从 10 / 16 列降到 5 列，被隐藏的列仍在「自定义列」里可选，**没有删除能力**；
- 商机列表原先 16 列在 1280 下虽不横向滚动，但列宽被压到不可读，现在主次分明。

---

### 1.13 轮次进展（Round 6，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T7（数据层英文）** | ✅ 完成 | 客户/商机列表 DOM `english: []`；表头「竞争风险 / 实施复杂度 / 预估席位数 / 需要法务审核」 |
| **T7（10 页抽查）** | ✅ 0 命中 | 10 个业务页固定词表扫描，`hits: []` |
| **T16** 补丁清单 | ✅ 11 个 | `all 11 patch(es) present` |

**关键结论：剩下的英文不在 UI 代码里，而在种子数据**

| 现象 | 真实来源 | 处理 |
|---|---|---|
| 表头 `Relationship health` | 包内 `customFieldDefaults.js` 的 `label`，**API 合并时代码优先于数据库** | 受管补丁把同一份中文映射注入包内定义 |
| 选项值 `complex` / `medium` | 同上，`options` 是裸字符串 | 补丁生成 `{value,label}`，值不变 |
| 数据库里改标签不生效 | 代码定义覆盖 DB 行 | 数据迁移（136 行）+ 代码补丁，**双管齐下** |

**新增资产**

- `src/lib/custom-field-zh.ts`：92 个字段标签 + 75 个选项值的中文映射（单一数据源）
- `scripts/migrate-custom-field-zh.mjs`：幂等数据迁移（含 `.mercato` 备份，可回滚）
- 补丁 `cf-zh-defaults`、`cf-label-deals`（deals 页是内联 cell，与 companies 结构不同）

---

### 1.12 轮次进展（Round 5，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T1** `/login` 与 `/backend` 壳分离 | ✅ 完成并上线 | `/login` HTML **105 KB**（原 1 546 KB）／内联键 **813**（原 21 438） |
| **回归** `/backend` 未受影响 | ✅ | 1 605 KB / 22 379 键（与改前同量级）；登录接口 `POST /api/auth/login` → 200 |
| 页面文案完整性 | ✅ | 可见文本：`ILA3 Commerce 登录你的工作空间 邮件 密码 记住我 登录 忘记密码？ 条款 隐私`（无 key 泄漏） |

**实现方式（低风险）**

1. `src/proxy.ts` 早已注入 `x-next-url`（含 pathname）；
2. 新增 `src/lib/i18n/auth-dict.ts`：`isAuthRoute()` + `trimDictionaryForAuthRoute()`，
   只保留 `auth / common / ui / appShell / errors / validation` 六个命名空间；
3. `src/app/layout.tsx` 按请求路径决定是否裁剪，**其它路由完全不裁剪**；
4. 3 个单测覆盖（路由判定、命名空间保留、前缀误伤如 `authn.*`）。

**为什么不是“把字典搬走”（T2 的做法）**

T2 需要客户端懒加载 + 首帧兜底，回归面覆盖所有模块页；T1 只影响匿名壳，
`/backend` 一行不改，是收益/风险比最高的一刀。T2 仍保留为后续项，
用于进一步压缩后台页（当前 1.6 MB）。

---

### 1.11 轮次进展（Round 4，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T8（可访问性）** | ✅ 完成并上线 | 主导航 41/41 链接均有 `aria-label`（`named: 41 / total: 41`），中文名称如「公司」「商机」 |
| **T8（分组 ≤ 8）** | ❌ 未达标，已定位 | 主导航：**0 个分组、41 项平铺**；设置区：**12 个分组**（系统/身份认证/客户门户/数据设计器/模块配置/财务与货币/组织与租户/功能开关/自定义/开发者/外部系统/安全） |
| **T16** 补丁清单 | ✅ 扩展至 9 个 | `all 9 patch(es) present` |

**T8 分组的落地难点（下一轮处理）**

1. `AppShell` **支持**分组（`group.id` + `group.items`），设置区已经在用；
2. 主导航为平铺，是因为各模块的 nav 条目没有携带 group 元数据——`modules.ts` 里的
   `groupOrder`（33 条）只是**排序表**，不会凭空造出分组；
3. 设置区有 12 组 > 目标 8 组，需要把相近组合并（建议合并为：
   系统 / 身份与权限 / 客户与门户 / 数据与集成 / 模块配置 / 组织与财务 / 开发者 / 安全）；
4. 两条路都涉及页面元数据（`pageGroupKey`）与 nav 注册，属于配置级改造，需单独一轮。

---

### 1.10 轮次进展（Round 3，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T5（第二半）** 商机状态 | ✅ 完成并上线 | Dashboard DOM：`rawStatus: []`，渲染「进行中 / 未关闭 / 输单 / 已成交」 |
| **T6** 日期本地化 | ✅ 完成并上线 | Dashboard DOM：`englishDates: []`，日期为 `2026年11月3日 15:10` |
| **T7** 英文残留 | ✅ 主屏归零（待全站抽查） | 客户列表：`englishChrome: []`、`Not set`→「未设置」、`Yes/No`→「是/否」 |
| **T16** 补丁管线 | ✅ 扩展至 8 个补丁 | 构建日志 `all 8 patch(es) present` |

**根因（这是本轮最关键的发现）**

界面英文残留的**主因不是缺翻译**，而是**界面语言根本没有被设为中文**：

- 这些 key 在 `zh.json` 里全都有（`打开操作`、`每页`、`未设置`、`是/否`）；
- 页面默认按 `Accept-Language`/浏览器语言返回 `en`，中文只存在于**数据层**（客户名、字典项）；
- 设置 `OM_FORCE_LOCALE=zh` 后，`<html lang="zh">`，绝大多数英文一次性消失。

**日期为何仍不中文（第二层根因）**

Dashboard 小组件用 `setLocale(navigator.language)` 取语言，浏览器是 `en-US`，
于是界面中文、日期英文。补丁改为优先 `document.documentElement.lang`。

---

### 1.9 轮次进展（Round 2，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T5（第一半）** 关系健康度枚举 | ✅ 完成并上线 | DOM 扫描 `rawEnums: []`；单元格渲染「良好 / 需关注」；截图 `shots/07-status-labels-applied.png` |
| **T16** 补丁清单与 CI 校验 | ✅ 骨架完成 | `scripts/patches/manifest.json` + `verify-patches.mjs`；`yarn build` 前置 `--apply`，构建日志输出 `all 3 patch(es) present` |
| **T5（第二半）** 商机状态 `open/win/lost/in_progress` | ⏳ 待做 | 与自定义字段链路不同（实体字段/看板），需单独定位 |

**本轮定位到的真实渲染链路（三次假设被打回，最终以 DOM 为准）**

1. 先假设走 `applyCustomFieldVisibility` → 打了两处补丁仍无效；
2. 又怀疑浏览器缓存（`immutable`）→ 清缓存后仍无效；
3. 读页面源码才发现：客户列表在 `page.js` 内联构建 `customColumns`，
   且 `cell` 用的是本地 `renderCustomFieldCell(value)`，**闭包拿不到字段定义**；
4. 最终补丁：把 `def` 传入单元格并映射 `options[].label`。

> 结论：这类“看起来该在框架层”的问题，实际落在某个页面的内联实现里。
> 以后定位同类问题，先读**页面**再读框架。

---

### 1.8 轮次进展（Round 1，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T17** 字典 CRLF 清洗 | ✅ 完成并上线 | `scripts/normalize-i18n.mjs` 幂等；清洗前 2 184 / 13 502 条含 `\r`，清洗后 0；构建通过；`/login` 响应体 `\r` 计数 0 |
| **T5** 状态枚举语义化 | 🟡 内核完成，接线待定 | `src/lib/status-label.ts` + 7 个单测通过；但**渲染层接线受阻**（见下） |

**T5 接线阻塞点（实测）**

1. `custom_field_defs.config_json.options` 存的是裸字符串（`["healthy","monitor","at_risk"]`），
   列表单元格直接渲染原值。
2. `DataTable` 支持列级 `cell` 渲染函数，但注入列走的是**追加**语义
   （`DataTable.tsx` 无按 `accessorKey` 去重），直接注入会**多出一列**而不是替换。
3. 因此 T5 只剩两条可行路径，需在下一轮二选一：
   - **A（推荐）**：把列定义改由应用层提供（覆盖 `customers.companies.list` 的列构造），
     或提交上游 issue 让 `applyCustomFieldVisibility` 支持 `meta.cell`；
   - **B**：登记为受管补丁（`scripts/patches/`），在 `customFieldColumns.js` 里补
     `cell` 渲染 + 选项标签映射，纳入 T16 的补丁清单与 CI 校验。

---

### 1.7 T5 侦察结论（2026-11-05，已完成定位）

| 发现 | 证据 | 对方案的影响 |
|---|---|---|
| 中文翻译**已存在**，只是没用上 | `customers.companies.detail.health.healthy = "良好"`、`atRisk = "有风险"` | T5 是**接线问题**，不是翻译问题；工作量集中在渲染层 |
| 框架提供受支持的覆盖点 | `registerComponentOverrides`（`@open-mercato/shared/modules/overrides`）+ `ComponentOverrideProvider` | 可在应用层覆盖状态单元格，**无需再给 `node_modules` 打补丁** |
| 字典存在 CRLF 污染 | 13 502 个中文值中 **2 184 个**以 `\r` 结尾（如 `"最大步数\r"`） | 新增 T17 清洗；不清理会持续影响渲染与文本比对 |

---

## 2. 排期

```
Sprint 1（第 1 周）  T5 → T7 → T6 → T8        视觉一致性 + 导航可访问性（用户可感知）
Sprint 2（第 2 周）  T1 → T2 → T3 → T4        结构 + 性能（与 Sprint 1 无冲突）
Sprint 3（第 3 周）  T9 → T10 → T11 → T14     设计系统与三态
Sprint 4（第 4 周）  T12 → T13 → T16 → T15    品牌、基线与可迁移
```

> 排期原则：先做「用户天天看见且改动小」的（T5/T7/T8），再做「结构性大改」（T1/T2），
> 避免一次性大改导致无法归因。

---

## 3. 度量脚本（验收用，可直接跑）

```bash
# 1) 首屏体积与内联键数
curl -sS http://127.0.0.1:3000/login -o /tmp/l.html
node -e "
const h=require('fs').readFileSync('/tmp/l.html','utf8');
const keys=[...new Set([...h.matchAll(/\\\\\"([a-zA-Z][a-zA-Z0-9_]{2,60}\.[a-zA-Z0-9_.]{2,80})\\\\\":/g)].map(m=>m[1]))];
console.log('html_kb', Math.round(Buffer.byteLength(h)/1024), 'inline_keys', keys.length);
"

# 2) 裸枚举残留
grep -oE '\b(in_progress|open|lost|win|healthy|monitor|Not set)\b' /tmp/l.html | sort -u

# 3) 边缘缓存命中
curl -sS -o /dev/null -D - https://mercato.ila3.top/login | grep -i 'cf-cache-status'

# 4) 可访问性名称（浏览器内）
# ego_snapshot 后确认每个 navigation 下的 link 都有可读名称
```

---

## 4. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 字典懒加载导致首帧显示 key | 体验事故 | 服务端仍全量渲染，客户端仅替换交互文案；灰度 1 个租户先验证 |
| 模块套餐化破坏现有路由 | 功能缺失 | 套餐只影响**加载**不影响路由注册；先做开关灰度 |
| `-v2` 重写与详情页参数冲突 | 404 | rewrite 保留 query/参数；上线后 7 天内保留 301 |
| 令牌重构引发视觉漂移 | 全站观感 | 逐组件迁移 + 截图 diff 基线（T13） |
| 升级原子化改动部署链 | 上线风险 | 保留现有 `ila3-self-update` 作为回退通道 |
