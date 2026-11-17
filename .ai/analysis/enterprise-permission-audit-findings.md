# Employee-view permission sweep

Date: 2026-11-17
Tool: `scripts/enterprise-permission-audit.mjs`
Scope: the 70 backend destinations in the **employee's own authorized catalogue**
(the superadmin sweep list is not used), authenticated as `employee@acme.com`.

## Result

| Employee view | Routes |
| --- | --- |
| rendered | 65 |
| denied despite a navigation link | 1 |
| transient navigation failure (audit-level) | 4 |

## Finding: an employee-visible link opens a role-gated page

`/backend/definitions` ("工作流定义") is present in the employee's authorized
navigation catalogue, and the page then answers
`Access denied: this area requires the role "admin". Contact your administrator.`

That is a contract mismatch on two counts worth a product decision:

1. the employee sees a nav entry that cannot open;
2. the page guards by **role name** while the rest of the app authorizes by
   feature id — the same role-name branching this project avoids.

Not fixed here: the page is a vendor workflow surface, and hiding the nav entry
should come from whoever owns its feature declaration (hide it or replace the
role guard with a feature check).

## Transient failures (re-checked, not defects)

`/backend/calendar`, `/backend/communications/channels`,
`/backend/leadgen/suppressions`, `/backend/config/customers/deals` failed the
sweep's navigation step under load. A per-route re-check rendered each of them
in under 1s with HTTP 200 and a normal page body, so these are recorded as
transient and not as defects. The sweep retries once inside a single attempt;
the re-check was done manually and is documented here rather than widening the
sweep's timeout.

## Fixed account/management entries

52 destinations show the fixed manage + profile links, 13 show none (settings
and profile contexts swap the chrome), 1 shows three, 4 failed the navigation
step before the count. Not treated as a defect without a product statement about
which contexts must keep the fixed entries.
