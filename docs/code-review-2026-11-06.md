# 代码审查执行记录（2026-11-06）

基线：`e9226f5`。范围与发现见对话中的评审报告；本文件只记录**执行结果与证据**。

## 状态总览

| 步骤 | 内容 | 状态 | 证据 |
|---|---|---|---|
| S1 | `/api/docs/*` 鉴权 + 文档缓存 | ✅ | 匿名 401（24B）；登录 200；冷 3.68s → 热 0.20s |
| S2 | 对账 N+1 | ✅ | 每页映射查询 2n → 1；3 个单测锁定语义 |
| S3 | 配置数据与纯函数入 app 层 | ✅ | `src/nav/*.json` + `src/lib/nav/*`；8 个新单测 |
| S4 | 分组合并完全去补丁（≤27） | ⛔ 受阻 | 官方无分组钩子，详见下节 |
| S5 | 表头/密度/空状态/错误态改 app 层（≤15） | ⬜ 未做 | 需逐个替换 12 个补丁，风险高，需单独排期 |
| S6 | 门禁：nav-check 环境变量 + `!important` 预算 | ✅ | `yarn css:overrides` 13/13；env 凭据可达 API |
| S7 | 交付记录（不评分） | ✅ | `~/.pua/feedback.jsonl` |

## S4 为何受阻（证据）

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
