# Leadgen migration drill — 2026-11-10T06:24:24.820Z

Drill database: `om_drill_leadgen` — created: yes, dropped afterwards: yes.
Migrations: `.mercato/migration-drill/feat_leadgen-schema-final`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| statements | PASS | 48 up / 16 down statement(s) touch only leadgen objects, no DML |
| clone | PASS | 315 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.tables | PASS | 16 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 315 -> 331, exactly the leadgen slices |
| apply.core-schema | PASS | non-leadgen schema digest unchanged (fc9db4adc6bb) |
| drift.partial-indexes | PASS | 4 hand-written partial UNIQUE index(es) present with the documented predicate |
| drift | PASS | applied schema matches the ORM snapshot exactly (16 tables, no delta) |
| down.sql | PASS | Migration20261108194144_leadgen.ts: 11 statement(s) rolled back |
| down.sql | PASS | Migration20261108192028_leadgen.ts: 5 statement(s) rolled back |
| down.result | PASS | zero leadgen tables and sequences left behind |
| down.core-schema | PASS | rollback restored the non-leadgen schema exactly |
| reapply | PASS | re-applying after a full rollback reproduces the identical schema |
| prod.guard | PASS | production unchanged: counts 315\|0\|0\|47, non-leadgen schema digest 62278dd17d8a |

**Result: PASS** — the slices apply, match the entities, roll back and re-apply cleanly.
