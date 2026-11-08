# Leadgen migration drill — 2026-11-08T22:32:01.435Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/src/modules/leadgen/migrations`.

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
| drift | FAIL | 4 difference(s): leadgen_bot_bindings: unexpected index leadgen_bot_bindings_active_unique \| leadgen_candidates: unexpected index leadgen_candidates_crm_entity_unique \| leadgen_employee_bindings: unexpected index leadgen_employee_bindings_active_unique \| leadgen_suppressions: unexpected index leadgen_suppressions_active_unique |

**Result: FAIL** — drift: 4 difference(s): leadgen_bot_bindings: unexpected index leadgen_bot_bindings_active_unique | leadgen_candidates: unexpected index leadgen_candidates_crm_entity_unique | leadgen_employee_bindings: unexpected index leadgen_employee_bindings_active_unique | leadgen_suppressions: unexpected index leadgen_suppressions_active_unique
