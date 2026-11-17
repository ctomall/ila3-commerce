# Page coverage matrix

Generated: 2026-11-17T10:28:25.518Z
Inventory commit: `71c54aba96613d7b3d28061d6e809bbd4ef10215`

## Totals

| Metric | Value |
| --- | --- |
| Declared pages | 319 |
| Render-evidenced | 318 |
| Defects | 0 |
| Observations | 1 |
| Gaps | 0 |
| Backend module routes | 290 |
| OpenAPI operations | 1006 |
| Frontend routes | 29 |
| Unresolved metadata | 12 |

## By class

| Class | Total | Evidenced | Defects | Observations | Gaps |
| --- | --- | --- | --- | --- | --- |
| backend-profile | 1 | 1 | 0 | 0 | 0 |
| backend-business | 123 | 123 | 0 | 0 | 0 |
| backend-create-edit | 68 | 68 | 0 | 0 | 0 |
| backend-settings | 37 | 37 | 0 | 0 | 0 |
| backend-detail-dynamic | 61 | 61 | 0 | 0 | 0 |
| frontend-public | 9 | 8 | 0 | 1 | 0 |
| frontend-other | 2 | 2 | 0 | 0 | 0 |
| frontend-portal | 15 | 15 | 0 | 0 | 0 |
| frontend-pay | 3 | 3 | 0 | 0 | 0 |

## Observations

- `/docs/api` — navigation-failure (public-audit); access/behaviour to confirm, not a confirmed page defect.

## Gaps (next sweeps)

| Route | Module | Reason |
| --- | --- | --- |
| - | - | - |

## Evidence sources

- authorized-navigation sweep: `.ai/analysis/enterprise-page-render-findings.json`
- dynamic placeholder sweep: `.ai/analysis/enterprise-dynamic-page-audit-after.json`
- public/portal/pay sweep: `.ai/analysis/enterprise-public-page-audit.json`
- direct gap sweep: `.ai/analysis/enterprise-direct-page-audit.json`
- inventory contract: `.ai/analysis/enterprise-inventory-baseline.json`

Render evidence is not business acceptance: a page that renders may still reject a
write, and API references are static literals unless a runtime test says otherwise.
