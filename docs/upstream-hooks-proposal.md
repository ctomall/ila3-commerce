# 上游钩子提案（解阻 S5 的补丁数）

当前 27 个受管补丁中，12 个无法在 app 层等价替换，因为 `@open-mercato/*@0.9.0`
（registry 安装，非本地工作区）没有对应扩展点。下面三个钩子按收益排序，
每个都写清"改动点 → 解锁的补丁 → 验收方式"。

## 1. `nav.groups` + `settings.sections`（解锁 2）

- 改动点：`shared/dist/modules/overrides.js` 的 nav 覆盖状态增加 `groups`；
  `core/dist/modules/auth/lib/backendChrome.js` 在 `groupEntries()` 之后应用。
- 形状：
  ```ts
  nav: {
    groupOrder?: string[]
    groups?: Array<{ id: string; label: string; order: number; members: string[] }>
    settingsSections?: Record<string, { id: string; label: string; labelKey: string; order: number }>
  }
  ```
- 解锁：`apply-nav-groups.mjs`、`apply-settings-groups.mjs`（当前合并为 `nav-config`）。
- 验收：补丁 27 → 25；侧栏 7 组、设置 8 分区不变；`nav-check` 0 issue。

## 2. `DataTable` 的 `ariaSort` 与 `emptyState`/`errorState` 插槽（解锁 4–5）

- 改动点：`ui/dist/backend/DataTable.js` 的 `SortableHeaderCell` 接收 `ariaSort` 并渲染到 `<th>`；
  默认空/错误状态改为渲染 `dataTableExtensionSpotId(tableId, "empty-state")` 等既有槽位。
- 解锁：`apply-aria-sort.mjs`、`apply-empty-state-art*.mjs`（3 条）、`apply-list-error-visual.mjs`。
- 验收：补丁 25 → 20；`ui-regression` 的 `aria-sort` 断言保持 4/4 与 20/20。

## 3. 页面 `columns` 配置外置（解锁 5）

- 改动点：列表页的列定义从 `page.js` 移到模块元数据（`page.meta`），支持 `columns` 覆盖。
- 解锁：`cf-label-*`（3）、`column-priority`（2）、`list-load-error-*`（2）中的多数。
- 验收：补丁 20 → 14±1，达成 S5 的 ≤15。

## 现状

- 本仓库侧已把数据与纯函数放到 `src/nav`、`src/lib/nav`（可测、单一来源），
  上游钩子到位后删补丁即可，不需要再迁数据。
- 在此之前，S5 的 ≤15 不可达；本仓库保持 27 并已用分类表记录每个补丁的阻塞原因。

## 就绪检查（现在可运行）

```bash
yarn hooks:check     # 或 node scripts/check-upstream-hooks.mjs
```

逐钩子读取已安装包并输出 `READY/PENDING`、判据证据、以及"可立即删除的补丁"。
它只读文件，不改 manifest。当前实测：

| 钩子 | 状态 | 证据 |
|---|---|---|
| `nav.groups` / `settings.sections` | PENDING | overrides 未导出 · payload 未消费 |
| `DataTable` ariaSort + 空/错状态槽 | PENDING | ariaSort 由我们的补丁提供 · 空状态槽未使用 |
| 页面 `columns` 外置 | PENDING | page.meta 无 columns · 无覆盖 API |

**探针会排除我们自己的补丁**：`aria-sort` 的文本匹配在补丁存在时判为"非上游"，
上游真正支持后（补丁被删、文本仍在）才翻 `READY`。正向分支已用伪造包实测：
三钩子齐备时输出 `3/3 hooks available` 并列出 11 个可删补丁。

## 钩子到位后的删除顺序（照此执行，预算不需上调）

1. `nav-config` → 27→26
2. `aria-sort`、`empty-state-art*`×3、`list-error-visual` → 26→21
3. `cf-label-*`×3、`column-priority`×2 → 21→16（余下按实际情况再收）
