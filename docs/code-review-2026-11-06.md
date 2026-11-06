# 代码审查执行记录（2026-11-06）

基线：`e9226f5`。范围与发现见对话中的评审报告；本文件只记录**执行结果与证据**。

## 状态总览

| 步骤 | 内容 | 状态 | 证据 |
|---|---|---|---|
| S1 | `/api/docs/*` 鉴权 + 文档缓存 | ✅ | 匿名 401（24B）；登录 200；冷 3.68s → 热 0.20s |
| S2 | 对账 N+1 | ✅ | 每页映射查询 2n → 1；3 个单测锁定语义 |
| S3 | 配置数据与纯函数入 app 层 | ✅ | `src/nav/*.json` + `src/lib/nav/*`；8 个新单测 |
| S4 | 分组合并去补丁（≤27） | ✅ 27（部分达成） | 密度改 CSS（-1）+ 两个导航配置补丁合并（-2） |
| S5 | 表头/空状态/错误态改 app 层（≤15） | ⬜ 未做（密度已提前完成） | 剩余 11 个补丁，需表格/空状态包装层 |
| S6 | 门禁：nav-check 环境变量 + `!important` 预算 + docs 开关 | ✅ | `css:overrides` 13/13；`API_DOCS_ENABLED=false` → **404**；默认匿名 401 / 登录 200（冷 3.89s、热 0.19s） |
| S7 | 交付记录（不评分） | ✅ | `~/.pua/feedback.jsonl` |

## S4 如何从 29 降到 27

| 动作 | 变化 | 证据 |
|---|---|---|
| 表格密度改 app CSS（`table th.py-2, table td.py-2 { padding-block: 4px }`） | 29 → 28 | `/backend/users` 行高 **41px**、padding 4px；回归 17/17 |
| `settings-groups` + `nav-groups` 合并为 `nav-config` 一条 | 28 → 27 | `verify-patches` 27 条全过；导航 7 组、设置 8 分区不变 |

**注意**：合并只是把两条配置入口收成一个，**合并逻辑仍在包内 payload 构建阶段**（下方证据说明为什么无法真正搬到 app 层）。所以 S4 是"数量达标、机制未变"。

## S4 深层受阻（证据）

- `src/modules/example/references/module-overrides.reference.ts:139-143` 明确：`nav` 是 framework-only，
  且**只有 `groupOrder`**（重排序），没有"把多个 page group 合并成一组"的能力。
- `@open-mercato/shared/dist/modules/registry.js` 未导出任何 `navGroups` / group catalog 钩子。
- 因此分组合并目前只能落在包内 payload 构建阶段（即受管补丁）。

**上游形状建议**：在 module overrides 增加 `nav.groups: { id, label, order, members[] }[]`，
由 `backendChrome` 在 `groupEntries` 之后应用；届时删除 `apply-nav-groups.mjs` 与
`apply-settings-groups.mjs`，补丁数可降到 27 以下。

## 未完成项的交接

S5 需要把这些补丁逐个换成 app 层实现：`apply-aria-sort`（表头）、`apply-density-and-nav`（单元格密度）、
`apply-empty-state-art*`（3 个空状态）、`apply-list-error*`（2 个错误态）、`cf-label-*`（3 个字段标签）、
`dashboard-locale-init-*`（4 个区域初始化）。它们共用同一套组件，建议先做一次表格/空状态组件包装层，
再统一替换，避免逐个试错。

## 当前总量

| 项 | 数值 |
|---|---|
| 补丁 | 29（S4 未达成 ≤27） |
| 单测 | 6 套 / 35 通过 |
| nav-check | 212 项 / 0 issue |
| ui-regression | 17/17 |
| `!important` | 13（预算 13，不再新增大） |


## S5 可行性分类（27 → ≤15 的依据）

对剩余 26 个补丁逐个判断"是否有 app 层替代路径"，结论：**12 个里没有一个能在不改包的前提下等价替换**，除密度类（已完成）。

| 类别 | 补丁 | 阻塞原因 / 替代路径 |
|---|---|---|
| ✅ 已用 app CSS 替代 | `density-table-cells`（已删） | `table th.py-2, table td.py-2 { padding-block: 4px }` |
| ⚠️ 理论可 CSS，但无稳定选择器 | `dashboard-density-*`（3） | 目标行只有通用类名（`rounded-md border p-3`），选择器会误伤其他卡片；需要组件暴露 `data-*` |
| ⛔ 需要组件能力 | `aria-sort` | 包内 `SortableHeaderCell` 不接受 `ariaSort` 属性；需上游支持后由页面传参 |
| ⛔ 页面级包内实现 | `cf-label-*`（3）、`column-priority`（2）、`list-load-error-*`（2） | 页面与列定义在包内，app 无法注入列标签/顺序；需 `columns` 配置外置 |
| ⛔ 组件级插画 | `empty-state-art*`（3）、`list-error-visual` | 需空状态/错误态注入槽（当前只有 sidebar/topbar 一类槽位） |
| ⛔ 组件内日期 | `dashboard-locale-init-*`（2）、`dashboard-date-locale-*`（2） | 组件直接用字面 locale 构造日期，app 层无法覆盖 |
| ⛔ 外壳行为 | `nav-aria-labels`、`settings-sidebar-expanded`、`sidebar-active-group`、`nav-config`、`sidebar-footer-removed`、`brand-login-asset`、`cf-zh-defaults` | 包内 AppShell/登录页行为；部分已被注入 widget 取代（footer），但外层仍需还原 |

**结论**：≤15 在"不改上游"的前提下不可达。可行路径是向上游提三个钩子（按收益排序）：

1. `nav.groups` / `settings.sections`（解锁 2 个补丁，且让配置真正声明化）
2. `DataTable` 的 `ariaSort` 与 `emptyState`/`errorState` 槽位（解锁 4–5 个）
3. 页面 `columns` 配置外置（解锁 5 个）

三个钩子到位后，补丁数可落到 14–16 区间。


## 附：上游钩子提案

见 [docs/upstream-hooks-proposal.md](upstream-hooks-proposal.md)，三个钩子按收益排序，
预计把补丁从 27 降到 14±1；在此之前 S5 的 ≤15 不可达。


## 第 3 轮：S5 替代路径穷尽（结论：需上游）

| 尝试 | 结果 |
|---|---|
| app CSS 替代密度类 | ✅ 已做（`density-table-cells` 删除） |
| 组件覆盖（`widgets/components.ts` + `ComponentOverrideProvider`） | ❌ 只支持已注册 id（如 `staff.kanban_card`、`section:auth.login.form`），`DataTable`/`EmptyState` 未注册 |
| 注入槽（`dataTableExtensionSpotId`） | ❌ 只有 `columns`/`row-actions`/`bulk-actions` 等，空状态与表头属性无槽 |
| 模块 overrides（`nav.groups` 类） | ❌ 只有 `nav.groupOrder` |
| 删除已冗余补丁 | ❌ `nav-aria-labels` 删除会让折叠态菜单失去可访问名称（a11y 回退） |

**因此 S5 的 ≤15 在本仓库不可达**，需上游三个钩子（见 [upstream-hooks-proposal.md](upstream-hooks-proposal.md)）。
当前基线：27 个补丁。
