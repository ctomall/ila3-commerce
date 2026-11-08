# M2 迁移草案 · leadgen 第一片（待批准）

> 状态：**已生成、已审阅、已做语法验证，未应用**。应用需要你批准。
> 分支：`feat/leadgen-schema`（main 不含此迁移）。

## 1. 文件

| 文件 | 作用 |
|---|---|
| `src/modules/leadgen/index.ts` | 模块声明（`from: '@app'`） |
| `src/modules/leadgen/data/entities.ts` | 5 个实体（MikroORM legacy 装饰器） |
| `src/modules/leadgen/migrations/Migration20261108192028_leadgen.ts` | 迁移（13 条 up / 5 条 down） |
| `src/modules.ts` | 增加 `{ id: 'leadgen', from: '@app' }` |

生成命令：`yarn db:generate`（输出 `leadgen: generated Migration20261108192028_leadgen.ts`）。

## 2. 表

| 表 | 行语义 | 关键约束 |
|---|---|---|
| `leadgen_research_runs` | 一次调研任务 | U `(tenant,org,source,run_key)` —— 重放归一到同一行 |
| `leadgen_company_claims` | 公司级去重与归属锚点 | U `(tenant,org,company_dedupe_key)` |
| `leadgen_candidates` | 候选（提交快照） | U `(tenant,org,run_id,submitted_fingerprint)`；partial U `(tenant,org,crm_entity_id) where not null`；I `(tenant,org,status,updated_at)`、`(tenant,org,company_dedupe_key)` |
| `leadgen_candidate_evidence` | 抓取证据（不可变） | U `(candidate_id,content_hash)` |
| `leadgen_verifications` | 确定性验证结果 | U `(candidate_id,verifier_version,input_digest)` |

**没有一列或一条约束落在他人的表上**：全部是 `create table "leadgen_*"` 或对这些新表加约束。

## 3. 已做过的验证（不是“看起来对”）

| 检查 | 结果 |
|---|---|
| 语句数 | up 13 / down 5 |
| 是否触碰 core 表 | 0（迁移里只出现 `leadgen_*`） |
| 语法与依赖 | 在**事务内执行后 `ROLLBACK`**：`created 5`，回滚后 `leadgen_*` 表数 = **0** |
| 类型检查 | `yarn typecheck` 0 error |
| RLS | 现有 core 表（`customer_entities`、`sales_quotes`、`messages`、`ai_pending_actions`）都 **未启用 RLS**，本项目按应用层 scope 管控；新表同口径 |

回滚演练的正是将要执行的 DDL —— 只不过在事务里回滚掉了。

## 4. 显式未包含（第二片）

| 缺什么 | 为什么不在这一片 |
|---|---|
| 配额三表（buckets/reservations/ledger） | 依赖 D4 的额度层级确认；且算法层已实现，可独立验证 |
| 审批/发送/回执/抑制四表 | 依赖 D5/D8 |
| Bot 绑定两表 | 依赖渠道选择（D8） |
| `contact_email` 加密 | 需要 `encryption.ts` 声明与密钥策略，属安全评审项 |
| 配额 `CHECK limit >= consumed + reserved` | 随配额表一起进 |
| 能力策略版本表 | 随绑定表一起进 |

## 5. 批准后如何应用（顺序不能错）

```bash
# 1) 备份（先备份再迁移，不能反）
pg_dump "$DATABASE_URL" -Fc -f /tmp/mercato-pre-leadgen-$(date +%s).dump

# 2) 应用
yarn db:migrate

# 3) 验证
psql "$DATABASE_URL" -c "\dt leadgen_*"
psql "$DATABASE_URL" -c "select count(*) from mikro_orm_migrations_leadgen"

# 4) 跑回归，确认既有功能没被影响
node scripts/crm-quote-regression.mjs
node scripts/crm-security-probe.mjs
```

回滚：`Migration20261108192028_leadgen.down()` 已实现（五张表 `drop ... cascade`），执行前同样先备份。
**注意**：回滚只删 `leadgen_*`，不动 core 表。

## 6. 需要你回的三个问题

1. 这一片是否照原样应用？
2. 第二片（配额 + 审批发送 + Bot）是否一起评审，还是等第一片跑通再说？
3. `contact_email` 是否必须加密存储（会影响查询方式与索引）？
