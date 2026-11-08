# M2 迁移草案 · leadgen 第一片（待批准）

> 状态：**已生成、已审阅、已在隔离库完成 up/漂移/回滚/复现全链路演练，生产库未写入**。应用仍需你批准。
> **评审分支：`feat/leadgen-schema-final`**（基于当前 main，两片合并成一条，合并无冲突）。
> 早期两条 `feat/leadgen-schema` / `-2` 已被它取代：它们切在 main 变更之前，与 `03b` 文档冲突。

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

> **订正（第 25 轮）**：上一行只覆盖了 `up()`。`down()` 当时**从未执行过**，迁移结果也从未与实体快照比对过。下面 §3.2 补齐这两项，并把演练固化成可复跑的门。

## 3.2 隔离库全链路演练（第 25 轮新增）

做法：把生产 schema 克隆到隔离库 `om_drill_leadgen`（314 张表 + 各模块迁移记账行），在克隆上执行全部动作，**生产库零写入**。

| 阶段 | 结果 |
|---|---|
| 克隆 | 314 表 + 各模块记账行（`sales` 28 行等） |
| 真实 CLI `yarn mercato db migrate` | `leadgen: 2 migrations applied`；其它 45 个模块的记账表**零变化** |
| 建表 | 16 张，与快照声明的 16 张一致；总表数 314 → **330** |
| 记账 | `mikro_orm_migrations_leadgen` **2 行** |
| 漂移 | 列类型/可空/默认值、索引与唯一约束，与 `.snapshot-open-mercato.json` **零差异** |
| 部分唯一索引 | 4 条全部存在，列与谓词逐条校验 |
| `down()` | 11 + 5 条语句执行；回滚后 leadgen 表 **0** 张、序列 **0** 个 |
| 再次 `up()` | 复现**完全相同**的 schema |
| 生产护栏 | 迁移前后指纹一致：`314\|0\|0\|46`（表数/leadgen 表/leadgen 记账/记账表数） |

复跑：

```bash
npx tsx scripts/crm-migration-drill.mjs \
  --migrations-dir <分支工作树>/src/modules/leadgen/migrations \
  --cli-checkout  <分支工作树>          # 省略则只跑类级 up/down，不经过 CLI
```

### 演练抓到的两个真问题

**① 4 个部分唯一索引在实体里根本表达不出来。** 它们是 `leadgen_candidates_crm_entity_unique`、`leadgen_bot_bindings_active_unique`、`leadgen_employee_bindings_active_unique`、`leadgen_suppressions_active_unique`——都带 `where` 谓词，只存在于迁移 SQL。MikroORM 7.2.5 的 `IndexOptions` 没有 `where` 字段，因此快照里永远不会有它们，朴素比对会报"多余索引"。

- 已实测：对已应用的 schema 跑 `yarn mercato db generate`，输出 `leadgen: no changes`，**不会**生成删除它们的迁移。
- 演练脚本改为显式白名单 `PARTIAL_UNIQUE_INDEXES`，逐条断言列与谓词；**未登记的手写索引会让门直接红**，白名单不能悄悄变长。

**② 演练脚本自己犯过一次"门永不红"。** 首版 `apply.cli.scope` 记了 `FAIL` 但进程仍输出 `RESULT: PASS`——和当初 QA 抓到的 `crm-security-probe` 是同一类缺陷。已改为由 `record()` 内部记账、结尾统一裁决：任何一次 FAIL 都让退出码为 1。

### 门的负向对照（证明它真的会红）

| 注入的缺陷 | 期望 | 实测输出 | 退出码 |
|---|---|---|---|
| 从 `down()` 删掉一张表的 `drop` | 回滚残留 | `down.result 1 leadgen tables survived the rollback` | 1 |
| 从 `up()` 删掉一条部分唯一索引 | 白名单缺项 | `drift.partial-indexes … partial unique index missing` | 1 |
| 在 `up()` 末尾加一条未声明索引 | 漂移 | `drift … unexpected index leadgen_suppressions_undeclared_idx` | 1 |
| `--db open_mercato` | 拒绝生产库 | `refusing database name "open_mercato"` | 1 |

门自身的三条路径也验过：能解析 ref → PASS(0)；显式 ref 不存在 → FAIL(1)（**不**静默回落到默认分支）；无待评审迁移 → SKIP(78)，且 `crm-verify-all` 把它记为 SKIP 而不是 PASS。

### 备份路径同样实测过

`pg_dump -Fc` 13 MB / **1.9 s**；`pg_restore` 到隔离库 **6.7 s**、退出 0；恢复后表 314、`users` 3、`tenants` 1、`sales_quotes` 2，与原库一致。备份不是一句"记得先备份"，是验证过恢复得回来。

### 生产库里那个空的记账表

`mikro_orm_migrations_leadgen` 已存在且 **0 行**——第 23 轮事务演练的残留（建表语句提交了，插行随事务回滚）。这是生产库从 313 张变 314 张的原因。演练确认它**不影响**应用：CLI 仍会执行这两条，且只执行这两条。


## 3.1 第二片（已生成，同一批准流程）

| 项 | 值 |
|---|---|
| 分支 | 同一个评审分支 `feat/leadgen-schema-final`（第一片 + 第二片都在里面，顺序执行） |
| 文件 | `Migration20261108194144_leadgen.ts` |
| 表 | 11 张：quota_buckets / quota_reservations / quota_ledger / drafts / approvals / sends / message_receipts / suppressions / capability_policies / employee_bindings / bot_bindings |
| 语句 | up 35 / down 11 |
| 手工补的三类约束 | ① `CHECK limit_units >= reserved_units + consumed_units`；② 三个 partial unique（同一员工仅一条 active 绑定、同一地址仅一条 active 抑制、同一渠道身份仅一条 active Bot 绑定）；③ `down()` |
| 验证 | **两片在同一次事务里顺序执行**：事务内 leadgen 表 **16** 张，`ROLLBACK` 后 **0** 张 |
| 未执行 | 未应用、未改库 |

两片叠加后的表总数：5 + 11 = **16**。

**与 `03a` 的 18 张对不上，说明白**：`03a` 还设计了 `leadgen_review_decisions` 与 `leadgen_crm_writes` 两张表，**没有进这两片**。原因：人工审核结论与 CRM 写入幂等记录依赖「审核动作」与「入库命令」的具体形态（D2 去重键、入库后字段回填），等 M5 路由落地时再出第三片，而不是现在猜形状。这也是为什么两片只到 16 张。

## 4. 显式未包含（第二片）

| 缺什么 | 为什么不在这一片 |
|---|---|
| ~~配额三表~~ | **已进第二片**（层级粒度仍待 D4，但表结构可先建） |
| ~~审批/发送/回执/抑制四表~~ | **已进第二片**（TTL 默认值待 D5，渠道字段待 D8） |
| ~~Bot 绑定两表~~ | **已进第二片**（渠道选择待 D8） |
| `contact_email` 加密 | 需要 `encryption.ts` 声明与密钥策略，属安全评审项（仍缺） |
| 配额 `CHECK limit >= consumed + reserved` | 随配额表一起进 |
| 能力策略版本表 | 随绑定表一起进 |

## 5. 批准后如何应用（顺序不能错）

```bash
# 0) 应用前先跑一遍隔离库演练，确认待应用的两片在当前 schema 上仍然成立
node scripts/crm-migration-drill-gate.mjs        # 或在评审分支上跑 crm-migration-drill.mjs

# 1) 备份（先备份再迁移，不能反）—— 这条路径已实测恢复得回来
pg_dump "$DATABASE_URL" -Fc -f /tmp/mercato-pre-leadgen-$(date +%s).dump

# 2) 应用
yarn db:migrate

# 3) 验证
psql "$DATABASE_URL" -c "\dt leadgen_*"                                        # 期望 16 张
psql "$DATABASE_URL" -c "select count(*) from mikro_orm_migrations_leadgen"     # 期望 2

# 4) 跑回归，确认既有功能没被影响
node scripts/crm-quote-regression.mjs
node scripts/crm-security-probe.mjs
node scripts/crm-verify-all.mjs --full
```

回滚：`Migration20261108194144_leadgen.down()`（11 条）先、`Migration20261108192028_leadgen.down()`（5 条）后，共 16 条 `drop table ... cascade`；已在隔离库执行过，回滚后 leadgen 表 0 张、序列 0 个。执行前同样先备份。
**注意**：回滚只删 `leadgen_*`，不动 core 表；但 `mikro_orm_migrations_leadgen` 的 2 行记账需要一并处理，否则重新应用会被当成"已执行"跳过。

## 6. 需要你回的四个问题

1. 这两片是否照原样应用？
2. `contact_email` 是否必须加密存储（会影响查询方式与索引）？
3. 4 个部分唯一索引只能手写在迁移里（实体装饰器表达不了）。是否接受"手写 + 演练白名单 + 每次 full 复核"这条路？
4. `feat/leadgen-schema-final` 是否合并进 main？合并本身不等于应用迁移，但合并后任何人跑 `yarn db:migrate` 就会真的建表——所以这件事需要和应用迁移一起决定。
