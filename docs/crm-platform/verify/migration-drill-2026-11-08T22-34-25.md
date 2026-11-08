# Leadgen migration drill — 2026-11-08T22:34:25.775Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/.neg3-migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| clone | PASS | 314 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |

**Result: FAIL** — error: relation "leadgen_suppressions" does not exist
