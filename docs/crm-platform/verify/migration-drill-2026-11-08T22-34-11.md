# Leadgen migration drill — 2026-11-08T22:34:11.413Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/.neg-migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| clone | PASS | 314 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.tables | PASS | 16 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 314 -> 330, exactly the leadgen slices |
| drift.partial-indexes | PASS | 4 hand-written partial UNIQUE index(es) present with the documented predicate |
| drift | PASS | applied schema matches the ORM snapshot exactly (16 tables, no delta) |
| down.sql | PASS | Migration20261108194144_leadgen.ts: 10 statement(s) rolled back |
| down.sql | PASS | Migration20261108192028_leadgen.ts: 5 statement(s) rolled back |
| down.result | FAIL | 1 leadgen tables survived the rollback |

**Result: FAIL** — down.result: 1 leadgen tables survived the rollback
