# Leadgen migration drill — 2026-11-08T23:25:56.266Z

Drill database: `om_drill_leadgen` — created: yes, dropped afterwards: yes.
Migrations: `.mercato/migration-drill/feat_leadgen-schema-final`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| statements | PASS | 48 up / 16 down statement(s) touch only leadgen objects, no DML |
| clone | PASS | 314 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.tables | PASS | 16 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 314 -> 330, exactly the leadgen slices |
| apply.core-schema | FAIL | non-leadgen schema changed: 754f98088e93 -> 223a4c0f16a9 |

**Result: FAIL** — apply.core-schema: non-leadgen schema changed: 754f98088e93 -> 223a4c0f16a9
