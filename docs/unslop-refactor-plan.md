# ILA3 Commerce · /unslop 工程重构方案

> 依据：`/unslop` 技能（CC BY 4.0，@heydamir）。本文是可落地的改造方案 + 已实施变更 + 验证结果，
> 不是自由发挥的红设计稿。

## 0. 范围解析（模板占位符已按仓库实际填写）

| 项 | 实际值 |
|---|---|
| 仓库 | `ctomall/ila3-commerce`（`/home/pro/apps/mercato`） |
| 前端 | Next.js 16 App Router + React 19 + shadcn(new-york) + Tailwind v4；`src/app`、`src/components`、`src/modules/*/backend` |
| 后端 | Next.js Route Handlers + `@open-mercato/*` 0.9.0 框架；`src/modules/*/api`、`src/app/api` |
| 数据库 | PostgreSQL（MikroORM） |
| 运行/部署 | systemd `mercato` + 一键升级（`scripts/system-update.mjs`）；可选 CI 产物部署（`deploy-artifact.mjs`） |
| 规范 | 本项目 `docs/design-tokens.md`、`docs/brand.md`、`scripts/check-token-layers.mjs`、`scripts/check-css-overrides.mjs`、`scripts/ui-regression.mjs` |
| 覆盖率要求 | 不降低现有覆盖（jest 8 套 40 通过；`ui-regression` 17/17） |

## 1. 方向（5 行）

- **产品**：面向贸易/批发团队的 B2B 商务与 ERP 工作台（公司、商机、订单、库存、人员排程）。
- **性格**：`克制、可核算、稍微偏冷`（不是"现代简洁"，那适用于任何后台）。
- **世界**：报关单、装箱单、货运标签——纸张、表格、编号、对齐的列。
- **时刻**：① 列表页的数字列（等宽、右对齐、可扫读）；② 仪表盘上"今日待办"的分组卡片。
- **签名**：所有编号/金额/日期统一 `tabular-nums` + 右对齐，像单据一样对齐。

## 2. 审计（可复核，均来自实测）

| # | 迹象 | 位置 | 实测证据 |
|---|---|---|---|
| 1 | 未使用、无限循环的 AI 光效动画 | `src/app/globals.css:877-951` | `grep animate-ai src/**/*.tsx` = **0 引用** |
| 2 | `transition-all`（不可控过渡） | `src/components/StartPageContent.tsx:37` | grep 命中 |
| 3 | 硬编码品牌外颜色 `bg-blue-500` | `sales-todos/widget.client.tsx:152` | grep 命中 |
| 4 | 大写 + 字距标签（`uppercase tracking-wider`） | `OrganizationSwitcher.tsx:467,491`、`portal-stats:15` | grep 命中 3 处 |
| 5 | 药丸圆角泛滥（`rounded-full` 用于普通标签） | `TodosTable.tsx:80`、`ModelCatalogPageClient.tsx:1080` | 5 种圆角变体，含 `9999px` ×2 |
| 6 | 无用/悬空设计令牌 | `src/app/globals.css` | `audit-design-tokens`：dead 示例 `--color-accent*`、`--color-badge-purple*`；dangling `--brand-google-stroke`、`--sidebar-accent` 等 |
| 7 | 类型/圆角基本收敛 | 全站 | 6 种字号/字重组合；圆角 8px×41、10px×17、16px×1、4px×1；emoji **0** |

结论：**轻度 slop（Light slop）**——版式与色彩已经收敛，问题集中在"动效、硬编码色、标签写法、圆角语义、死令牌"。
按技能要求执行 **polish 模式**：不改版式与信息架构，只修审计项。

## 3. 已实施变更（第一批，可回滚）

| 文件 | 变更 | 对应审计 |
|---|---|---|
| `src/app/globals.css` | 删除 `.animate-ai-glow` / `.animate-ai-glow-active`（无引用） | #1 |
| `src/components/StartPageContent.tsx` | `transition-all` → `transition-[box-shadow,border-color]` | #2 |
| `src/modules/example/widgets/injection/sales-todos/widget.client.tsx` | `bg-blue-500` → `bg-primary` | #3 |
| `src/components/OrganizationSwitcher.tsx`、`portal-stats/widget.client.tsx` | 去掉 `uppercase tracking-wider`，改句首大写 | #4 |

**未做（需你确认后执行）**：药丸圆角语义化（#5）、死令牌清理（#6）。理由：它们会改变多处视觉细节，
属于"看起来像设计改动"的批次，应与第一批分开验收。

## 4. 框架结构变更

**本批不改框架结构**。说明：

- 前端目录（`src/app`/`src/components`/`src/modules/*/backend`）与后端路由（`src/modules/*/api`）边界清晰，
  无必要合并或迁移；改结构只会增加回归面。
- 唯一结构性约束来自框架包（`@open-mercato/*` 以预编译 `dist` 分发），已记录在
  [docs/upstream-mirror.md](upstream-mirror.md) 与 [docs/upstream-hooks-proposal.md](upstream-hooks-proposal.md)。

**若后续确需调整**（例如把表格包装层收进 `src/components/table/`），代价与回滚见 §6。

## 5. 迁移步骤（本批已执行，可按序复现）

1. `node scripts/audit-design-tokens.mjs`、`node scripts/check-token-layers.mjs --strict` 取基线；
2. 应用 §3 的四处编辑；
3. `yarn build`（含 `verify-patches`、`check-version-tag`、令牌层检查）；
4. `node scripts/ui-regression.mjs`（17 项）与 `node scripts/nav-check.mjs`（212 项）；
5. 截图对比：`/home/pro/dsh/shots/unslop-audit-dashboard.png`（前）。

## 6. 回滚方案

| 层级 | 操作 |
|---|---|
| 单批 | `git revert <commit>`；本批仅 4 个文件、无依赖变化 |
| 构建产物 | 一键升级自动保留 `.mercato/next-prev`，失败自动回滚；也可 `git reset --hard <前一次 commit>` 后重建 |
| 样式 | 删除的动画类无引用，恢复只需还原 CSS 两段 |

## 7. 验证方式与当前结果

| 验收项 | 命令 | 当前结果 |
|---|---|---|
| 设计令牌层 | `node scripts/check-token-layers.mjs --strict` | 0 非语义用法 |
| `!important` 预算 | `yarn css:overrides` | 13/13（未增加） |
| 单测 | `npx jest --config jest.config.cjs` | 8 套 / 40 通过 |
| UI 回归 | `node scripts/ui-regression.mjs` | 17/17 |
| 导航数据 | `yarn nav:check` | 212 项 / 0 issue |
| 构建 | `yarn build` | 见本轮构建日志 |

## 8. 待你决策的下一批

| 批次 | 内容 | 风险 |
|---|---|---|
| B2 | 药丸圆角语义化（标签 8px、卡片 12px、面板 16px） | 视觉变化面较广，需逐页核对 |
| B3 | 死令牌清理（`--color-accent*`、`--color-badge-purple*` 等 20+） | 低，但需确认没有包内消费 |
| B4 | 列表页数字列统一右对齐 + 等宽（签名细节落地） | 中，涉及列配置 |
| B5 | 空状态/错误态插画统一（当前经补丁实现，见 upstream-hooks-proposal） | 中，与上游钩子相关 |

**本方案不包含**：页面版式重排、信息架构调整、颜色体系更换——按技能规则，轻度 slop 不做这些。
