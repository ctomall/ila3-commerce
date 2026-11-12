# Leadgen migration drill — 2026-11-12T05:24:52.216Z

Drill database: `om_drill_leadgen` — created: yes, dropped afterwards: yes.
Migrations: `src/modules/leadgen/migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 3 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts, Migration20261112060000_leadgen_decisions.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| statements | PASS | 50 up / 17 down statement(s) touch only leadgen objects, no DML |
| clone | PASS | 324 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.sql | PASS | Migration20261112060000_leadgen_decisions.ts: 2 statement(s) applied |
| apply.tables | FAIL | 17 leadgen tables != 16 expected from the snapshot |

**Result: FAIL** — apply.tables: 17 leadgen tables != 16 expected from the snapshot
