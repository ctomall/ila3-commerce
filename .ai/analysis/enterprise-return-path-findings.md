# Return-path audit findings (corrected)

Date: 2026-11-17
Tool: `scripts/enterprise-return-path-audit.mjs`
Scope: 130 create/edit/detail/profile pages, opened authenticated with a real
record id where a list API exists.

## Correction of the first result

The first run reported 10 pages with “no contextual return”. Re-checking the DOM
showed most of those were **classifier false negatives**: several pages render a
plain in-page control (`← 返回`, `返回报价单列表`, `Back to rules`) that is an
anchor or button but carries no `data-navigation-return` attribute and was not
matched by the first selector set. The audit now counts, in this order:

1. the shell contract `[data-navigation-return]`;
2. an authorized ancestor breadcrumb;
3. an actionable in-page control whose label starts with `返回`/`Back`
   (anchor, button or `role="button"`);
4. otherwise `no-return`.

## Result (130 routes)

| Return path | Routes |
| --- | --- |
| contextual return control | 123 |
| in-page back control | 3 |
| ancestor breadcrumb | 2 |
| no contextual return | 2 |

Remaining pages with no return control:

- `/backend/auth/profile` — the personal profile page; it is entered from the
  account area and only exposes the dashboard breadcrumb.
- `/backend/staff/profile/create` — staff profile availability form; no parent
  entry is part of the authorized navigation catalogue.

## Rejected approach

A shell-level “contextual return” component (derived from `navigationParent`,
rendered only when the page provides none) was implemented and built, then
withdrawn before release: on the running release every audited detail/create
page already renders a visible back control, so the component had no page to
serve and no browser test could prove it. The defect was the audit’s selector,
not a missing feature. The two remaining pages need page-level fixes (or a
product decision that the profile hub is intentionally dashboard-only), not a
global control.
