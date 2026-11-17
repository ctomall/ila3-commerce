# Empty-state audit findings

Date: 2026-11-17
Tool: `scripts/enterprise-empty-state-audit.mjs`
Scope: the 137 authorized static list destinations, authenticated as superadmin.

## Method

For each destination the sweep looks for a search input, types a query that
cannot match (`zzz-no-match-…`) and waits up to 4s for either a readable empty
message (`没有找到/暂无/无匹配/No results/…`) or zero table rows. Only GETs run;
every write stays blocked. A page with no search input is recorded as
`no-search-control` — many settings/form pages simply have no list search, so
that is not a failure.

## Result (137 destinations)

| Empty state | Routes |
| --- | --- |
| readable empty message | 69 |
| zero rows | 6 |
| no search control (not testable this way) | 59 |
| needs review | 3 |

That is 75 destinations with direct empty-state evidence, plus 59 where the
question does not apply to the current UI.

## Needs review (not claimed as defects)

- `/backend/catalog/prices` — rows went 1 → 12 after typing; the first input the
  heuristic fills may be a scope filter rather than the list search.
- `/backend/staff/time-tracking/projects` — rows went 4 → 1; a client-side
  filter may have matched the nonsense token differently.
- `/backend/config/translations` — page did not finish loading within the probe
  budget (large dictionary page).

The audit's heuristic picks the first search-shaped input on the page; a page
with multiple filters can therefore be misread. These three are recorded for a
targeted per-page check, not fixed or counted as missing empty states.

## Limitation

This measures the list empty state reachable from a search box. Empty states for
pages without search, permission-denied panels and create-form validation errors
remain covered by other sweeps/specs, not by this audit.
