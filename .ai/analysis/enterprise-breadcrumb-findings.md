# Breadcrumb consistency audit

Date: 2026-11-17
Tool: `scripts/enterprise-breadcrumb-audit.mjs`
Scope: the 137 authorized static navigation destinations, superadmin.

## Result

| Breadcrumb check | Count |
| --- | --- |
| destinations audited | 137 |
| current crumb consistent with navigation label or page heading | 131 |
| label mismatch | 5 |
| no current crumb | 1 |

## Mismatched labels (product copy decision, not patched)

| Route | Navigation label | Breadcrumb crumb | Page heading |
| --- | --- | --- | --- |
| /backend/work-inbox | 工作收件箱 | Work Inbox | — |
| /backend/wms | 运营看板 | 仓储管理 | 运营看板 |
| /backend/inbox-ops | 收件箱建议 | AI 收件箱处理 | AI Inbox Actions |
| /backend/instances | 工作流实例 | Automation Runs | 工作流实例 |
| /backend/logs | 执行日志 | 业务规则日志 | Execution Logs |

These come from page metadata labels that differ from the navigation catalogue
(partly untranslated English crumbs). Fixing them means choosing one label per
page — a copy decision, so they are recorded rather than silently renamed.

`/backend/workbench` has no current crumb because it is the dashboard root (the
breadcrumb only carries the home icon); recorded as expected.

## Ancestor links outside the CRM catalogue

Four destinations have breadcrumb ancestors that are not CRM catalogue entries:
`/backend/checkout` (checkout group; answers 307, i.e. a redirecting group page)
and `/backend/profile` (profile hub; answers 200 and is a fixed shell
destination). They resolve, so this is not a dead link; the label in the matrix
was corrected from "unauthorized" to "outside the CRM catalogue".
