> **⚠️ 这是修复前的产物，`Result: PASS` 是错的。**
> 文件里有一行 `FAIL apply.cli.scope`，但脚本当时没有把 FAIL 汇总成退出码，尾部仍写了 PASS。这正是 §3.2 记的"门永不红"缺陷的现场证据。
> 保留是为了留档；**不要**把它当作"演练通过"的证据。最新的通过记录见同期无 `-STALE` 后缀的报告。
>
> 由独立 QA 在第 29 轮指出：证据目录里留着一份自相矛盾的 PASS 报告，按 `Result: PASS` 检索会误用。

# Leadgen migration drill — 2026-11-08T22:33:22.105Z

Drill database: `om_drill_leadgen` (cloned from production schema, dropped afterwards: yes).
Migrations: `../../../../tmp/leadgen-drill/src/modules/leadgen/migrations`.

| phase | result | detail |
| --- | --- | --- |
| guards | PASS | drill db om_drill_leadgen != prod db open_mercato; postgres://mercato:***@127.0.0.1:5432/om_drill_leadgen |
| guards.cli | PASS | cli checkout /tmp/leadgen-drill resolves to the drill database |
| discovery | PASS | 2 slice(s): Migration20261108192028_leadgen.ts, Migration20261108194144_leadgen.ts |
| discovery.snapshot | PASS | 16 tables declared by the ORM snapshot |
| clone | PASS | 314 tables cloned from open_mercato (schema + migration bookkeeping) |
| clone.grants | PASS | app role can read and write the cloned schema |
| apply.cli | PASS | real CLI applied 2 leadgen migration(s) |
| apply.cli.scope | FAIL | no migration was applied outside leadgen |
| apply.tables | PASS | 16 leadgen tables created, matching the snapshot |
| apply.scope | PASS | total tables 314 -> 330, exactly the leadgen slices |
| apply.bookkeeping | PASS | 2 bookkeeping rows recorded by the runner |
| drift.partial-indexes | PASS | 4 hand-written partial UNIQUE index(es) present with the documented predicate |
| drift | PASS | applied schema matches the ORM snapshot exactly (16 tables, no delta) |
| down.sql | PASS | Migration20261108194144_leadgen.ts: 11 statement(s) rolled back |
| down.sql | PASS | Migration20261108192028_leadgen.ts: 5 statement(s) rolled back |
| down.result | PASS | zero leadgen tables and sequences left behind |
| reapply | PASS | re-applying after a full rollback reproduces the identical schema |
| prod.guard | PASS | production unchanged (tables\|leadgen\|bookkeeping\|migration-tables = 314\|0\|0\|46) |

**Result: PASS** — the slices apply, match the entities, roll back and re-apply cleanly.
