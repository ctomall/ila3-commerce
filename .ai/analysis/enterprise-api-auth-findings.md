# Page-referenced API authorization surface

Date: 2026-11-17
Tool: `scripts/enterprise-api-auth-probe.mjs`
Scope: the 108 unique `/api/...` paths referenced by the 319 inventory pages,
requested anonymously and with an employee session (GET only; no body, no writes).

## Result

| Authorization result | Paths |
| --- | --- |
| anonymous-denied, employee reaches 200 | 36 |
| anonymous-denied, employee not 200 | 34 |
| anonymous-denied, GET 404/405 (POST-only or parameterized) | 38 |
| anonymously readable | **0** |

No page-referenced API answered 200 without a session: the referenced API surface
is not anonymously readable.

The five paths that answer 401 to an employee session are customer-portal
endpoints (`/api/warranty_claims/portal/{claims,events,options,attachments}`,
`/api/workflows/portal/tasks`). They expect a customer identity, not a staff
session — expected by design, recorded rather than flagged.

## Interpretation limits

- "employee not 200" (34) can be 403 (employee lacks the feature), 400/404
  (parameter or record missing) — this probe does not distinguish them from the
  status alone; the matrix keeps it as an authorization *surface*, not a verdict.
- 38 paths answer 404/405 to GET because they are POST-only or require a path
  parameter; their existence is already recorded by the contract probe.
- This is not a full API authorization test: it covers only GETs named by page
  source literals, not every OpenAPI operation, and it does not attempt writes.
