# Leadgen migration drill — 2026-11-12T07:54:32.371Z

Drill database: `om_drill_leadgen` — created: yes, dropped afterwards: yes.
Migrations: `src/modules/leadgen/migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 4 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts, Migration20261112060000_leadgen_decisions.ts, Migration20261112063000_leadgen_evidence_fields.ts |
| discovery.snapshot | PASS | 17 tables declared by the ORM snapshot |
| statements | PASS | 51 up / 18 down statement(s) touch only leadgen objects, no DML |

**Result: FAIL** — pre-apply reset failed: 
