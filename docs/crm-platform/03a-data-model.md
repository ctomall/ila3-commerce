# M2 契约（三）· 数据模型与 API 面

新模块 `leadgen`（`src/modules/leadgen/`，表前缀 `leadgen_`，功能点 `leadgen.*`）。**不改任何 core 表**；跨模块引用一律用标量 uuid 快照，不建跨模块 ORM 关系。每行都有 `tenant_id`/`organization_id`，由服务端派生，永不接受客户端传值。含 PII 的列配 `*_hash char(64)` 兄弟列做等值查找。

## A. 候选 / 证据 / 验证

| 表 | 关键列 | 唯一 · 索引 | 生命周期 |
|---|---|---|---|
| `leadgen_research_runs` | `id`、`source`、`run_key`、`agent_key`、`agent_version`、`policy_version`、`prompt_hash`、`candidate_count`、`status` | U `(tenant,org,source,run_key)` | `open → closed → voided` |
| `leadgen_candidates` | `id`、`run_id`、`submitted_fingerprint`、`company_dedupe_key`、`company_name/domain/country`、`contact_*`、`source_url`、`status`、`claim_id`、`crm_entity_id`、`crm_written_at` | U `(tenant,org,run_id,submitted_fingerprint)`（重放返回同一行）；U partial `(tenant,org,crm_entity_id)`；I `(tenant,org,status,updated_at)`、`(tenant,org,company_dedupe_key)` | `submitted → needs_review → approved → writing_crm → crm_written`；分支 `rejected │ merged │ failed` |
| `leadgen_company_claims` | `company_dedupe_key`、`display_name`、`crm_entity_id`、`owner_user_id/employee_id`、`state`、`version` | U `(tenant,org,company_dedupe_key)` —— 去重与归属的唯一锚点（`insert … on conflict do nothing` + `select … for update`） | `unclaimed → claimed → conflict → released │ merged` |
| `leadgen_candidate_evidence` | `candidate_id`、`kind`、`url`、`fetched_at`、`http_status`、`content_hash`、`excerpt`、`method`、`adapter`、`rank` | U `(candidate_id,content_hash)` | 不可变 |
| `leadgen_verifications` | `candidate_id`、`verifier_version`、`ruleset_hash`、`input_digest`、`verdict`、`checks jsonb` | U `(candidate_id,verifier_version,input_digest)`（同输入不重算） | `running → pass │ fail │ needs_review` |
| `leadgen_review_decisions` | `candidate_id`、`decision`、`reason_code`、`actor_user_id`、`decision_key`、`merge_target_claim_id` | U `(tenant,org,decision_key)` | append-only：`approve │ reject │ merge` |
| `leadgen_crm_writes` | `candidate_id`、`idempotency_key`、`request_digest`、`crm_entity_id`、`status`、`attempt`、`lease_owner/expires_at` | U `(tenant,org,idempotency_key)`；U partial `(candidate_id) where status='succeeded'` | `pending → in_flight → succeeded │ failed_dead` |

**候选/任务/审核/验证/客户阶段分开建模**：`status` 在候选上，`owner` 在 claim 上，`verdict` 在 verification 上，CRM 阶段由 core 的 `customer_entities.lifecycle_stage` 承担——四个概念不塞进一个字段。

## B. 配额账本（预留 → 消费/退还，带 lease 与过期）

| 表 | 关键列 | 约束 |
|---|---|---|
| `leadgen_quota_buckets` | `scope_kind`(tenant│department│employee│task)、`scope_id`、`quota_kind`(lead│crm_write│send)、`period_key`、`limit_units`、`reserved_units`、`consumed_units`、`version` | U `(tenant,org,scope_kind,coalesce(scope_id,nil),quota_kind,period_key)`；**CHECK `limit_units >= consumed_units + reserved_units`** |
| `leadgen_quota_reservations` | `bucket_id`、`lease_token`、`idempotency_key`、`units`、`state`、`subject_kind/id`、`expires_at`、`consumed_at/refunded_at` | U `(tenant,org,idempotency_key)`；U `(lease_token)`；I partial `(state,expires_at) where state='reserved'` |
| `leadgen_quota_ledger` | `bucket_id`、`reservation_id`、`entry_kind`、`delta_units`(signed)、`reason_code` | U partial `(reservation_id,entry_kind) where entry_kind in ('consume','refund','expire')`；append-only |

状态 `reserved → consumed │ refunded │ expired`。预留：`FOR UPDATE` 锁 bucket 行 → 校验余量 → 插 reservation + ledger → `reserved_units += units`。消费/退还必须带匹配 `lease_token` 且 `state='reserved'`；清扫任务把 `expires_at < now()` 的 reserved 退回。

额度是**行**不是列：租户/部门(`staff_teams.id`)/员工(`staff_team_members.id`)/任务(`run_id`) 各一层，实际可用 = 各层最小值（D4 待确认粒度）。

## C. 审批 → 发送

| 表 | 关键列 | 约束 | 生命周期 |
|---|---|---|---|
| `leadgen_drafts` | `candidate_id`、`recipient_email(+hash)`、`channel`、`subject`、`body_markdown/html`、`body_hash`、`template_key/version`、`version`、`status` | U `(tenant,org,candidate_id,body_hash)` | `editing → ready → approved → sent`；`superseded │ blocked` |
| `leadgen_approvals` | `draft_id`、`draft_hash`、`decision`、`approver_user_id`、`idempotency_key`、`expires_at`、`revoked_at` | U `(tenant,org,idempotency_key)`；U partial `(draft_id,draft_hash) where decision='approved' and revoked_at is null`；CHECK `expires_at>created_at` | `issued → revoked │ expired` |
| `leadgen_sends` | `draft_id`、`approval_id`、`draft_hash`、`idempotency_key`、`provider_key`、`provider_message_id`、`state`、`attempt`、`lease_*` | U `(tenant,org,idempotency_key)`；U partial `(provider_key,provider_message_id)` | `queued → dispatching → accepted → delivered → replied`；`bounced │ complained │ failed │ suppressed` |
| `leadgen_message_receipts` | `send_id`、`provider_event_id`、`kind`、`classification`、`classifier_version`、`payload_hash` | U `(tenant,provider_event_id)` | append-only |
| `leadgen_suppressions` | `email_hash`、`email`、`reason`、`source_send_id`、`released_at` | U partial `(tenant,email_hash) where released_at is null` | `active → released` |

**发送门（缺一不可）**：`approval.decision='approved'` ∧ `revoked_at IS NULL` ∧ `now() < expires_at` ∧ `approval.draft_hash = draft.body_hash`。抑制在**调用 provider 之前**复查，命中即 `suppressed` 且不发出任何外部请求。

回复分类：`human_reply │ auto_reply │ ooo │ unsubscribe │ negative`——**回复不等于有意向**，分类结果只写 `receipts.classification`，不改 CRM 阶段。

## D. 绑定与能力策略

| 表 | 关键列 | 约束 | 生命周期 |
|---|---|---|---|
| `leadgen_capability_policies` | `policy_key`、`version`、`capabilities jsonb`、`status`、`effective_from/to` | U `(tenant,org,policy_key,version)`；行不可变，靠 `status` 退休 | `draft → active → retired` |
| `leadgen_employee_bindings` | `employee_id`、`user_id`、`assistant_agent_key`、`capability_policy_id`、`capability_policy_version`、`state`、`revoked_at/reason` | U partial `(tenant,org,employee_id) where state in ('active','suspended')` | `active → suspended → revoked │ offboarded` |
| `leadgen_bot_bindings` | `channel_id`、`channel_type`、`external_identity`、`employee_binding_id`、`state`、`verified_at` | U partial `(tenant,org,channel_id,external_identity) where state='active'` | `active → revoked │ offboarded` |

撤权级联走**提交后事件**（`leadgen.employee_binding.revoked` → bot 置 `offboarded`），不建 FK 级联、不加 core 列。

## E. 幂等键组合（这是 M2 最容易糊过去的地方，所以写死）

| 流程 | 键 |
|---|---|
| 提交 Run | `sha256("run:"+run_key)`；候选 `sha256(run_key | normalized_payload)` |
| CRM 写入 | `sha256("crm:"+candidate_id+":"+request_digest)` |
| 配额预留 | 客户端 `Idempotency-Key` 头 |
| 审批 | `sha256("approve:"+draft_id+":"+draft_hash+":"+approver_user_id)` |
| **发送（跨 approve→enqueue→provider 同一把钥匙）** | `sha256("send:"+draft_id+":"+draft_hash+":"+approval_id+":"+recipient_hash+":"+channel)`，审批时铸造，原样带进队列任务与 provider 的 `Idempotency-Key` |
| provider 回执 | `provider_key + ":" + provider_event_id` |
| 抑制 upsert | `sha256(normalized_email)` |

## F. API 面（`src/modules/leadgen/api/**` → `/api/leadgen/**`）

| method | path | requiredFeatures | 幂等 |
|---|---|---|---|
| POST | `/runs` | `leadgen.candidates.manage` | ✔ run_key |
| GET | `/candidates`、`/candidates/[id]` | `leadgen.candidates.view` | — |
| POST | `/candidates/[id]/verify` | `leadgen.candidates.manage` | ✔ verifier_version+input_digest |
| POST | `/candidates/[id]/decisions` | `leadgen.candidates.review` | ✔ decision_key |
| POST | `/candidates/[id]/crm-write` | `leadgen.candidates.manage` | ✔ 组合键 |
| GET | `/claims`；POST `/claims/[id]/resolve` | view / review | ✔ `Idempotency-Key` |
| GET | `/quota/buckets`；POST `/quota/reservations`、`/[id]/consume`、`/[id]/refund` | `leadgen.quota.*` | ✔ `Idempotency-Key` / `lease_token` |
| POST | `/drafts`、`/drafts/[id]/approvals`、`/approvals/[id]/revoke` | `leadgen.sends.*` | ✔ approve key |
| POST | `/sends` | `leadgen.sends.send` | ✔ 同一把 send key |
| POST | `/webhooks/providers/[provider]` | 验签，`requireAuth:false` | ✔ provider_event_id |
| GET/POST | `/suppressions` | `leadgen.sends.manage` | ✔ email_hash upsert |
| GET/PUT/POST | `/bindings`、`/bindings/employees/[id]`、`/bindings/bots/[id]`、`.../revoke` | `leadgen.bindings.*` | ✔ 期望 `version` / 终态迁移 |

列表与详情用 `makeCrudRoute`（每方法 `metadata` + `openApi` + `indexer.entityType`）；写入走命令 + mutation guard（照 `staff/api/leave-requests/*` 的形状）。

## G. 只读引用的 core 对象（不写、不 DDL）

`customer_entities`（写入目标，`kind='company'`）、`customer_companies.domain`（只做去重交叉核对）、`staff_team_members`(+`user_id`)、`staff_teams.id`（部门额度）、`organizations`/`tenants`（scope 校验）、`communication_channels`（bot 绑定 + 发送身份门）、`messages`（可选线程，只存返回 id）、ai agent 注册表（`assistant_agent_key`）、`auth users`（actor/approver）。

## H. 用 UMES 而不是给 core 加列

| 需求 | 机制 |
|---|---|
| 客户记录上的 leadgen 数据 | `data/extensions.ts` `EntityExtension` base `customers:customer_entity` |
| 租户自定义线索字段 | custom-field 定义（`ce.ts` + entities 引擎），不做 DDL |
| 客户详情/列表展示 | widget 注入 + 注入式列/行操作 |
| 读侧补充 | customers API 的 response enricher |
| 灰度 | `feature_toggles` 的 `leadgen.*` |
| 枚举值 | `dictionaries` 条目 |
| 提交后级联（撤权→离线、回执→抑制） | 事件 + 模块订阅者 |

## I. 迁移约定与审批

- 位置 `src/modules/leadgen/migrations/`；命名 `Migration<YYYYMMDDHHMMSS>_leadgen.ts`（仓库两种形式都存在）；快照 `.snapshot-open-mercato.json` 同目录一起提交；按模块账本 `mikro_orm_migrations_leadgen`。
- 生成：`yarn db:generate`，只审 `leadgen_*` 语句；改声明后跑 `yarn generate`；已提交的迁移不改，只加修正迁移。
- **需要批准**：`yarn db:migrate` 应用、以及在 `src/modules.ts` 启用 `{ id:'leadgen', from:'@app' }`。本轮只交付迁移与快照，不碰数据库。

## J. 实现前仍需确认

发送渠道包（`channel_resend`）、审批有效期、租户级 vs 组织级范围（本设计按组织级，`organization_id not null`）、PII 保留与删除窗口。
