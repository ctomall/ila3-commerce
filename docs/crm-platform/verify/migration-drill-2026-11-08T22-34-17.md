# Leadgen migration drill — 2026-11-08T22:34:17.935Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/.neg2-migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| clone | PASS | 314 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 12 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.tables | PASS | 16 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 314 -> 330, exactly the leadgen slices |
| drift.partial-indexes | FAIL | 1 difference(s): leadgen_candidates_crm_entity_unique: partial unique index missing |

**Result: FAIL** — drift.partial-indexes: 1 difference(s): leadgen_candidates_crm_entity_unique: partial unique index missing
