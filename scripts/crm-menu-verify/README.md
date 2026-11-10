# CRM menu independent verification (branch `feat/crm-menu-verify`)

Read-only acceptance harness for the CRM menu task. It never edits product source and
never writes product data. It logs in with the real admin and employee accounts from
`/home/pro/.ila3-admin-credentials` (0600, via `scripts/lib/session.mjs`) and records
browser evidence for the default-sidebar restoration (v1) and the declared IA (v2).

## What it proves

Freeze mode (baseline) records the truth of the running build:

- shell geometry at 1440x900: aside width, search field, group headers, active state,
  custom-rail markers, brand/profile/collapse affordances;
- collapse round trip: 240px → 80px, `om:sidebarCollapsed` in localStorage and
  `om_sidebar_collapsed` cookie, persistence across reload;
- mobile at 390x844: no desktop sidebar, menu button, drawer width, drawer content,
  horizontal overflow;
- the full version-2 catalogue per role: every declared href is GET-checked and the
  status histogram is recorded; `unknown` / `unconfiguredGroups` / `duplicates` must be empty;
- management centre entries vs catalogue manage membership, in-place search filtering;
- account surface: header avatar menu plus `/backend/profile` and every personal href;
- keyboard: first tab stop is the skip link, sidebar destinations are in the tab order;
- reduced-motion observation (advisory in freeze, gated in candidate);
- screenshots for workbench, customers, collapsed rail, manage, profile, mobile drawer;
- release identity: footer SHA/version, `/home/pro/releases/mercato/current` target and
  the `ila3-auto-deploy-app.service` invocation facts.

Candidate mode replays the same suite against an integrated build and adds:

- stock AppShell default shell: `mode === "stock-default"`, zero custom-rail markers,
  default sidebar search, default group headers with `aria-expanded`, 240px expanded,
  every declared daily entry plus the manage hub rendered in the sidebar (8 declared
  groups + the manage-hub group), manage hub rendered exactly once;
- no functional loss vs the frozen baseline: every baseline href is still declared
  exactly once, no duplicate declarations, no reachability status regressions;
- employee authorization: no admin-only entry in the employee catalogue or management
  surface, admin-only pages render `Access Denied`, admin-only API answers 401/403;
- `aria-current="page"` on exactly one sidebar destination, active path match,
  no rendered duplicate hrefs, reduced motion honored;
- before/after screenshot pairing against the baseline;
- optional declared-IA checks (`--source-dir` reads `src/nav/nav-groups.json` and
  `src/nav/settings-sections.json`; `--expect-ia` validates the live catalogue against
  the frozen v2 expectation file: 13 container ids/order/zh labels/landings, 10
  management category ids/order/zh labels, one owner per entry, and the rendered
  shell header labels. Admin must match exactly; a restricted employee account must
  match as an ordered subset. The only allowed landing alias is the documented
  `/backend` ↔ `/backend/workbench` home redirect).

## Commands

Baseline freeze (production, read-only):

```bash
XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
/home/pro/.local/bin/ila3-heavy-task /usr/bin/node \
  /data/crm/worktrees/crm-menu-verify/scripts/crm-menu-verify/menu-sidebar-verify.mjs \
  --mode freeze --base http://127.0.0.1:3000 --label baseline-<sha> \
  --out /storage/artifacts/pro/menu-declaration-audit/verify
```

Candidate (URL + SHA supplied by the Lead):

- `--allow-known-pending` keeps the report's exit code at 0 when the only failures are
  the explicitly separated known-pending a11y gates (`nav.aria-current`,
  `nav.aria-current-matches-path`, `a11y.reduced-motion`). Without it, every failed gate
  is reflected in the exit code. `report.json` always splits `failures` (blocking) from
  `pendingFailures`.

```bash
node scripts/crm-menu-verify/menu-sidebar-verify.mjs \
  --mode candidate --base http://127.0.0.1:<port> \
  --label candidate-<sha> --expect-sha <sha> \
  --baseline /storage/artifacts/pro/menu-declaration-audit/verify/baseline-<sha>/report.json \
  --out /storage/artifacts/pro/menu-declaration-audit/verify
```

Exit codes: `0` every gate passed, `1` at least one gate failed, `2` harness/infrastructure
failure. The machine report is authoritative; `summary.md` is the human view.

## Evidence layout

`/storage/artifacts/pro/menu-declaration-audit/verify/<label>/`

- `report.json` — machine report (checks, failures, warnings, structure, catalogue,
  coverage statuses, manage/account/mobile/keyboard/reduced-motion, comparison, build);
- `summary.md` — markdown summary with the PASS/FAIL matrix;
- `catalogue-admin.json`, `catalogue-employee.json` — frozen live version-2 catalogue;
- `shots/<label>-<role>-<surface>.png` — before/after visuals.

The report never contains credentials, cookies or secrets; only a `<redacted>` marker
stands in for the session cookie.

## Frozen baseline

The current frozen baseline is `baseline-eaa7c12` at
`/storage/artifacts/pro/menu-declaration-audit/verify/baseline-eaa7c12/report.json`
(production release `eaa7c12`, custom-rail shell, admin 132 hrefs / employee 69).
The report records the footer SHA, the resolved release directory and the
`ila3-auto-deploy-app.service` invocation facts so the baseline can be tied to
the exact deployed artifact.

## Notes and limits

- Login is rate limited (5/min/IP). The suite logs in once per role per run through the
  shared four-minute session cache in `scripts/lib/session.mjs`.
- Reachability is an authenticated GET per declared href (bodies cancelled after status is
  read); it does not click, submit or mutate anything.
- The stock default sidebar in `@open-mercato/ui` renders active items with a `bg-muted`
  highlight but no `aria-current`, and its width transition is 200 ms with no
  `motion-reduce` variant. The candidate gates report both as defects instead of
  patching product source (this harness owns tests and evidence only).
