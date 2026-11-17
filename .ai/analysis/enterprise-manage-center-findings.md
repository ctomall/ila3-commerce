# Management centre + personal account reachability

Date: 2026-11-17
Tool: `scripts/enterprise-manage-center-audit.mjs`
Scope: `/backend/manage`, for superadmin and employee, using each caller's own
catalogue.

## Result

| Role | Personal entries visible | Management entries findable by search |
| --- | --- | --- |
| superadmin | 4 / 4 | 70 / 70 |
| employee | 2 / 2 | 17 / 17 |

No misses for either caller: every personal-account link from the catalogue is
rendered on the centre page, and typing each management entry's label into the
centre's search reveals that entry (`data-manage-entry` href).

## What this proves and does not

- Proves the fixed management-centre entry point lists every authorized
  management/personal destination to both roles, and the centre search is a
  complete index of that caller's catalogue.
- Does not prove the destination page itself works (render sweeps do), nor that
  no unauthorized entry exists (the catalogue is the authorization source and is
  verified by the employee permission sweep).
- The employee's own catalogue has 17 management entries; `/backend/definitions`
  remains the one employee-visible link that denies on open (recorded earlier,
  awaiting a product decision).
