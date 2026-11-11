# 迁移评审：dsh_runs（B1 持久化）

> 状态：**DRAFT · 未应用**。应用需要单独批准（生产迁移不在常规发布授权内）。
> 文件：`src/modules/dsh_runs/migrations/Migration20261111083458_dsh_runs.ts`

## 1. 变更内容（仅 3 张新表）

| 表 | 用途 | 关键约束 |
| --- | --- | --- |
| `dsh_assistant_bindings` | 员工↔助手一人一绑定 | UNIQUE (tenant_id, organization_id, user_id) |
| `dsh_runs` | 幂等 Run 账本 | UNIQUE (binding_id, idempotency_key)；部分唯一索引 (binding_id) WHERE status IN ('queued','running','awaiting_approval') |
| `dsh_run_events` | 追加式事件流/游标 | UNIQUE (run_id, seq) |

DDL 来源：在隔离 worktree（HEAD `4fddcd5`）执行 `yarn generate` + `yarn mercato db generate`，生成 `Migration20261111083458`；该文件同时包含一次**全库 schema 重diff**（生产库与包元数据不一致导致的大量无关 drop/add），已丢弃，仅保留 dsh_* 三表。手工删除 FK/CHECK：实体使用标量列，MikroORM 不拥有这些约束，保留会在下次 generate 产生反向 diff。

## 2. 兼容与可回滚

- 纯 CREATE TABLE/INDEX，无 DROP/改列/改类型；旧进程可继续运行（expand）。
- down：`drop table if exists` 依次 events → runs → bindings。
- 回滚应用代码不会自动删除表；数据原位保留。
- 应用前检查：`select binding_id, count(*) from dsh_runs where status in ('queued','running','awaiting_approval') group by 1 having count(*)>1;` 预期空（新表必空）。

## 3. 应用步骤（批准后）

```bash
# 1) 备份
pg_dump ... > /home/pro/backups/open_mercato-pre-dsh-runs-$(date +%Y%m%d%H%M).sql
# 2) 应用（仅此一个迁移）
yarn mercato db migrate
# 3) 校验
psql -c "\d dsh_runs" ; psql -c "\d dsh_run_events"
```

## 4. 风险

| 风险 | 说明 |
| --- | --- |
| 部分唯一索引冲突 | 新表为空，理论无冲突；若未来恢复旧数据需先清理重复在途 run |
| 表名/列名漂移 | 迁移 DDL 已对齐实体元数据；后续 generate 若出现 dsh_* diff 必须评审，不得自动应用 |
| 路由尚未接线 | 迁移先于代码接线应用也安全（表空、引擎默认 OpenCode）；但 DSH 开启前必须完成 B 接线 |

## 5. 批准请求

请确认是否批准在共享生产库 `open_mercato` 应用上述**单个**迁移；批准后按第 3 节执行并保留输出。未批准前保持 DRAFT。

## 6. DDL 语法验证（未落库）

在 `open_mercato` 连接上以事务 + 临时 schema 执行全部 9 条 DDL，再 `ROLLBACK`：

```sql
begin; create schema dsh_mig_verify; set local search_path to dsh_mig_verify;
-- migration up() statements
rollback;
```

结果：`ON_ERROR_STOP=1` 通过（9/9 语句），事务回滚，未残留 schema/表。另由 `orm-repository` 单测覆盖 23505/CAS 语义（47 passed, 1 skipped=env-gated 真实 DB）。
