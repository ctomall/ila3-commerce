# Empty-state audit findings (corrected)

Date: 2026-11-17
Tool: `scripts/enterprise-empty-state-audit.mjs`
Scope: the 137 authorized static list destinations, authenticated as superadmin.

## Method

For each destination the sweep finds a search-shaped input, types a query that
cannot match (`zzz-no-match-…`) and waits up to 4s for either a readable empty
message or zero table rows. Only GETs run; every write stays blocked. Pages with
no list search are recorded as `no-search-control` — many settings/form pages
have no list, so that is not a failure.

The empty-message pattern was widened after review: it now accepts messages like
`No projects match these filters` (the first run only matched `no matches`, which
produced a false "no empty state" for the projects page).

## Result (137 destinations)

| Empty state | Routes |
| --- | --- |
| readable empty message | 71 |
| zero rows | 5 |
| no search control (not testable this way) | 59 |
| needs review | 2 |

That is 76 destinations with direct empty-state evidence.

## The two review items

- `/backend/catalog/prices` — typing `zzz-no-match-…` into the page's own
  `搜索价格规则` box (slower typing, Enter, 5s wait) still shows all 12 rows and
  the footer "显示第 1 至 12 条，共 12 条结果". Recorded as an observation: either
  this search binds to a different dataset/view, or it does not filter. Not
  fixed here.
- `/backend/config/translations` — the visible search box is a `Search records...`
  combobox for a different picker; the language list is rendered as cards, not a
  searchable table. Not applicable to this audit method.

## Verified positive example

`/backend/staff/time-tracking/projects` renders the single-row empty state
"No projects match these filters. + Add first project" after a nonsense query —
that is the state the widened pattern now recognizes.

## Limitation

This measures the list empty state reachable from a search box. Empty states for
pages without search, permission-denied panels and create-form validation errors
remain covered by other sweeps/specs, not by this audit.
