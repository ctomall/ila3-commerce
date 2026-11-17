# Public front-end page audit (anonymous, read-only)

Date: 2026-11-17
Scope: the 30 public front-end destinations from the inventory — `/start`, `/login`,
`/reset`, `/reset/[token]`, `/terms`, `/privacy`, `/docs/api`, `/onboarding`,
`/onboarding/preparing`, `/checkout-demo`, the org-scoped customer portal
(`/[orgSlug]/portal…`), `/quote/[token]`, `/messages/view/[token]` and
`/pay/[slug]{,/cancel,/success}/…`.
Tool: `scripts/enterprise-public-page-audit.mjs` (output:
`.ai/analysis/enterprise-public-page-audit.json`), run against the installed
release on `127.0.0.1:3000`, anonymous session, `[orgSlug]` resolved to the real
organization slug, every other placeholder replaced with a sentinel.

## Safety

- Only `GET`/`HEAD`/`OPTIONS` reached the application; every other method was
  aborted (the verified read-only feature probe excepted).
- Every request to a host other than the loopback base was aborted, so no
  payment provider, analytics or email endpoint could be contacted. Nothing was
  submitted or paid.
- 1440 and 390 viewports, bounded 4s readiness window, `innerText` only
  (`textContent` includes inline script text and produced false "crash" hits).

## Results (30 routes, 60 renders)

| Verdict | Count |
| --- | --- |
| rendered (page content present) | 28 |
| not-found-state (`/pay/[slug]`: "Payment link not found") | 1 |
| navigation-failure (`/docs/api` at one viewport; transient) | 1 |
| document overflow at 390 | 0 |
| uncaught page errors | 0 |
| writes or external requests | 0 |

Observed states, by family:

- `/start`, `/login`, `/reset`, `/terms`, `/privacy`: static content renders.
- `/portal/*` (dashboard, profile, tasks, claims, login, signup, verify, invite,
  reset-password): unauthenticated visits show the portal login or a specific
  token message ("Invalid or missing invitation token", "Invalid or missing
  reset token", "Verification token is missing"); org slug from the database is
  accepted, no crash.
- `/messages/view/[token]`: "Invalid or expired link HTTP 404" — a readable
  refusal, not a crash.
- `/quote/[token]`: "报价单 / 加载报价单失败。" — readable failure. With a
  non-UUID token the server logs a ZodError (level 50) before the page handles
  it; with a UUID sentinel the page fails quietly.
- `/pay/[slug]`: "Unable to load payment link / Payment link not found".
  `/pay/…/cancel` and `/pay/…/success` show bounded "Payment cancelled /
  Payment processing" states without contacting a provider.
- `/onboarding`: "Self-service onboarding is currently unavailable"; the
  preparing page shows a bounded progress state.
- `/docs/api`: requires a signed-in session — three fresh anonymous contexts at
  1440 all landed on `/login?redirect=/docs/api`. The server still returns the
  explorer HTML (200, ~1.7 MB) before the client guard runs; that definition is
  also public by design at `/api/docs/openapi`. One attempt returned the app
  error boundary (500) under load; it is recorded as an observation, not
  reproduced reliably, so it is not claimed as a page defect.

## Limitations

- Anonymous only: authenticated portal/pay flows (real customer login, real
  payment link) are not exercised, and no payment was initiated.
- Sentinel tokens exercise the invalid/expired branches, not the success
  branches.
- `/reset/[token]` with a sentinel renders the password form after its check
  window; whether the server rejects the token on submit is not verified here.
- The audit blocks external hosts; a page that needs one would only show its
  degraded state.
