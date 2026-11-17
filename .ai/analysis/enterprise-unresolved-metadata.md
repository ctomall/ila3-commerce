# The 12 unresolved inventory metadata routes (verified)

Date: 2026-11-17
Source of truth: `.ai/analysis/enterprise-inventory-baseline.json` (`counts.unresolved = 12`).

All twelve compiled page modules export no page-level `metadata` object
(`metadataExpression: "(undefined as any)"`), which is why the static inventory
cannot derive a page title / feature list for them. This note records what was
verified about each instead of guessing.

## Frontend routes (7) — public by design, no page metadata

| Route | Built source |
| --- | --- |
| /login | `@open-mercato/core/dist/modules/auth/frontend/login.js` |
| /reset | `.../auth/frontend/reset.js` |
| /reset/[token] | `.../auth/frontend/reset/[token]/page.js` |
| /onboarding | `@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/page.js` |
| /onboarding/preparing | `.../onboarding/frontend/onboarding/preparing/page.js` |
| /docs/api | `@open-mercato/core/dist/modules/api_docs/frontend/docs/api/page.js` |
| /checkout-demo | `@open-mercato/core/dist/modules/workflows/frontend/checkout-demo/page.js` |

The public-page audit rendered all of them anonymously; `/docs/api` is the one
with the recorded anonymous-access observation (server serves the explorer while
the client can land on `/login`).

## Backend dynamic routes (5) — no page-level feature declaration

| Route | Guard observed for `employee` |
| --- | --- |
| /backend/entities/user/[entityId]/records/[recordId] | `Access denied: you are missing the required permission "entities.records.view"` |
| /backend/entities/user/[entityId]/records/create | same (`entities.records.view`) |
| /backend/staff/team-members/[id] | `Access denied ... "staff.view"` |
| /backend/staff/team-roles/[id]/edit | `Access denied ... "staff.view"` |
| /backend/planner/availability-rulesets/[id] | `Schedule not found. Back to schedules` (no permission banner) |

The first four prove the missing page metadata is not a missing guard: an
employee session gets an explicit feature-denial page (feature id included), so
authorization is inherited from a higher layer even though the page does not
declare it. The planner route answered "Schedule not found" for a sentinel id —
its guard does not surface a feature denial for this employee; recorded as an
observation, not claimed either way.

## Consequence for the matrix

These routes keep their render evidence (public: anonymous sweep; backend:
superadmin direct sweep). Their contract/metadata gaps stay explicit in the
matrix ("Unresolved metadata: 12") and are now documented per route instead of
being an unexplained counter.
