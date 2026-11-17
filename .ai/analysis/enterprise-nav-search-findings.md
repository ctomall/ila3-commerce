# Navigation search authorization audit

Date: 2026-11-17
Tool: `scripts/enterprise-nav-search-audit.mjs`
Scope: the shell navigation-search popover ("查找功能入口"), superadmin and employee.

## Result

| Role | Own catalogue entries | Findable by label | Out-of-catalogue results | Empty message |
| --- | --- | --- | --- | --- |
| superadmin | 137 | 137 | 0 | yes |
| employee | 70 | 70 | 0 | yes |

The employee's search was additionally probed with 40 labels of destinations
that exist only for superadmin (users, roles, settings, integrations, …): none of
the returned entries had an href outside the employee's own catalogue.

## What this proves and does not

- Proves the unified search is a complete index of the caller's authorized
  catalogue and does not leak destinations outside it; the nonsense query shows
  the "没有匹配的已授权入口" empty state.
- Does not exercise result navigation (the destinations' pages themselves are
  covered by the render/permission sweeps), and it is a client-side filter over
  the authorized payload, so a server-side leak in the payload would not be
  caught here — the employee permission sweep covers the rendered catalogue.
