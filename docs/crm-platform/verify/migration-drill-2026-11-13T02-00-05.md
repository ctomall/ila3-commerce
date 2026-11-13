# Leadgen migration drill — 2026-11-13T02:00:05.496Z

Drill database: `om_drill_leadgen` — created: yes, dropped afterwards: yes.
Migrations: `src/modules/leadgen/migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| discovery | PASS | 4 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts, Migration20261112060000_leadgen_decisions.ts, Migration20261112063000_leadgen_evidence_fields.ts |
| discovery.snapshot | PASS | 17 tables declared by the ORM snapshot |
| statements | PASS | 51 up / 18 down statement(s) touch only leadgen objects, no DML |
| pre-apply.reset | PASS | removed any applied leadgen objects from the clone (throwaway database only) |
| clone | PASS | 324 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.sql | PASS | Migration20261108192028_leadgen.ts: 13 statement(s) applied |
| apply.sql | PASS | Migration20261108194144_leadgen.ts: 35 statement(s) applied |
| apply.sql | PASS | Migration20261112060000_leadgen_decisions.ts: 2 statement(s) applied |
| apply.sql | PASS | Migration20261112063000_leadgen_evidence_fields.ts: 1 statement(s) applied |
| apply.tables | PASS | 17 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 324 -> 341, exactly the leadgen slices |
| apply.core-schema | PASS | non-leadgen schema digest unchanged (4206f9dd6fba) |
| drift.partial-indexes | PASS | 4 hand-written partial UNIQUE index(es) present with the documented predicate |
| drift | PASS | applied schema matches the ORM snapshot exactly (17 tables, no delta) |
| down.sql | PASS | Migration20261112063000_leadgen_evidence_fields.ts: 1 statement(s) rolled back |
| down.sql | PASS | Migration20261112060000_leadgen_decisions.ts: 1 statement(s) rolled back |
| down.sql | PASS | Migration20261108194144_leadgen.ts: 11 statement(s) rolled back |
| down.sql | PASS | Migration20261108192028_leadgen.ts: 5 statement(s) rolled back |
| down.result | PASS | zero leadgen tables and sequences left behind |
| down.core-schema | PASS | rollback restored the non-leadgen schema exactly |
| reapply | PASS | re-applying after a full rollback reproduces the identical schema |
| prod.guard | PASS | production unchanged: counts 341\|17\|4\|50, non-leadgen schema digest 45ce8596fb24 |

**Result: PASS** — the slices apply, match the entities, roll back and re-apply cleanly.
