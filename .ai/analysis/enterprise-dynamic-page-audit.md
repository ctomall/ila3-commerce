# Dynamic backend page audit (read-only)

Date: 2026-11-17
Scope: the 79 auth-required backend routes that contain a path placeholder
(`/backend/customers/companies/[id]`, …) — the destinations the authorized-navigation
sweep can never reach because navigation only lists concrete hrefs.
Tool: `scripts/enterprise-dynamic-page-audit.mjs` (output:
`enterprise-dynamic-page-audit.json`), against a loopback candidate built from the
release artifact; every non-GET is aborted except the verified read-only
`POST /api/auth/feature-check`.

## Method

- An id is resolved through the module's own GET list endpoint for 13 route
  families (`customers/{companies,people,deals}`, `catalog/{products,categories}`,
  `sales/{orders,quotes}`, `auth/{users,roles}`, `directory/{organizations,tenants}`…).
- Every other route uses a syntactically valid, non-existent UUID
  (`11111111-1111-4111-8111-111111111111`), which exercises the not-found / empty
  and denied branches instead of pretending a record exists.
- Each route renders at 1440 and 390; status, readiness, skeletons, error copy,
  uncaught page errors and document overflow are recorded.
- Re-run after 0.2.8 on the same 79 routes: 26 rendered, 51 not-found-state,
  2 denied, 0 crashed, 0 overflow (output: `enterprise-dynamic-page-audit-after.json`).

## Results (79 routes, 158 renders)

| Verdict | Count | Meaning |
| --- | --- | --- |
| rendered | 27 | record-backed page, or page that renders with a resolved id |
| not-found-state | 50 | missing record handled as an empty/not-found state, no crash |
| denied | 2 | access message shown (`communications/inbox`, `documents`) |
| crashed | 0 | after the sentinel was corrected (see below) |
| narrow overflow | 0 (was 24 before the 0.2.8 fix) | document wider than the 390px viewport |

No route crashed, and no route rendered the generic `Something went wrong`
boundary once the sentinel was a normal UUID.

## Findings

### 1. The first sentinel was pathological, not the pages

The all-zeros UUID (`00000000-…-d1a6`) made three list endpoints answer
`500 DATABASE_ERROR` (`staff/leave-requests`, `warranty_claims/registrations`,
`resources/resources`), which surfaced as "Something went wrong" on the detail
pages and was first recorded as 5 crashed pages. A normal non-existent UUID
returns `200 {items: []}`, so the pages were fine; the sentinel was the defect in
the test. Recorded here so the earlier crash verdicts are not mistaken for page
defects.

### 2. Non-UUID filter input is a 500, not a validation error

`GET /api/staff/leave-requests?ids=not-a-uuid` (and the all-zeros UUID) answer
`500 DATABASE_ERROR` instead of `400`. This is an input-validation gap on the
shared list path, not a page defect. Not fixed in 0.2.8; tracked as a backend
contract finding.

### 3. Narrow detail pages widened the document (fixed in 0.2.8)

24 of 79 detail pages scrolled to 406–863px at a 390px viewport. Two root causes
were isolated by measuring each offender:

1. The shell topbar action cluster is a `shrink-0` flex row. Its max-content
   width wins over the viewport, so the row ends 16px past a 390px screen and
   the document gains a scrollbar. Fix: at `<48rem` the header wraps the cluster
   onto its own line and lets it wrap internally
   (`header { flex-wrap: wrap }` + `header > .shrink-0 { flex: 1 1 100%; flex-wrap: wrap }`).
   A plain `width: 100%` on the cluster was tried first and rejected: because the
   cluster is `shrink-0`, it starved the left column and the mobile menu button
   became unclickable — the drawer test caught it.
2. Record tables without the shared data-table wrapper keep a `sr-only` corner
   header cell (`position: absolute`). Because the existing
   `div.overflow-hidden` wrapper is not positioned, the cell resolves against
   the page and stretches it — a 919px order table made the document 863px
   wide even though the wrapper clipped painting. Fix: at `<48rem` that wrapper
   becomes a positioned local scroll port
   (`position: relative; overflow-x: auto`).

Both rules live in `src/app/globals.css` and are covered by a Playwright case
(companies and orders detail at 390px: document ≤ viewport, wide table scrolls
locally).

### 4. Denied pages rendered a readable explanation

`/backend/communications/inbox/[id]` shows "会话不存在或无权访问（可能已被删除…）"
and `/backend/documents/[id]` shows "无权访问" with a retry and a return link.
These are correct denied/empty states for an inaccessible record, not crashes.

### 5. `POST /api/workspace_settings/preferences` answers 400 on some pages

Some record pages call the preferences API without a selected organization and
receive `400` (`organization_required`), which the navigation layer ignores.
Recorded as a follow-up: the preferences client can skip the call when no
organization is selected, or the API can treat "no org" as nothing to return.

## Limitations

- Render-only: no create/edit/save, no business action validation.
- Superadmin session for every route; per-role visibility is not exercised here.
- 13 route families use a real id; the rest use a sentinel, so their populated
  layouts are not evidenced.
- "DOM quiet" is a bounded settling window, not a business-ready assertion.
