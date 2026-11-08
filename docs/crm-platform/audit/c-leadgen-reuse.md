# 子审计 C · 获客/触达可复用面（原文归档）

> 只读审计；DB 只做 SELECT。未写文件、未发任何外部请求。

## (a) 需要 → 现有资产 → 复用判断

| 需要 | 现有表 / API / 文件:行 | 判断 |
|---|---|---|
| 公司/联系人/商机 CRUD | `customers/api/companies/route.ts:77-80`、`people/route.ts:72-75`、`deals/route.ts:89-92`（含 `[id]`） | 复用 |
| 自定义字段 | `custom_field_defs` + `custom_field_values`（entity_id 维度） | 复用 |
| 归属/指派 | `customer_entities.owner_user_id`；`deals/bulk-update-owner/route.ts`；`api/assignable-staff` | 复用 |
| 公司阶段 | `customer_entities.lifecycle_stage`（字典驱动，`data/validators.ts:318`）；`customer_pipelines` + `customer_pipeline_stages` + `customer_deal_stage_transitions` | 商机复用 / 候选包装 |
| 域/邮箱/税号去重 | **无** domain / primary_email 唯一约束（只有 `customer_companies.entity_id` 唯一）；`data_sync/lib/adapter.ts:29-35` 的 matchStrategy(email\|externalId\|custom) + dedupeRole；`sync_external_id_mappings` | 包装 |
| 候选/线索实体 | **没有**。最近的是 `customer_entities(kind=company\|person)` + lifecycle_stage | **新建** |
| CSV 导入 | `sync_excel/api/upload/route.ts:22`、`preview/route.ts:13`、`import/route.ts` → data_sync 引擎；`adapters/customers.ts` | 复用 |
| 邮件发送 | `messages/lib/email-sender.ts:147,195`；`shared/lib/email/send.ts`；transport 在 `communication_channels/di.ts:25` 注册 | 复用 |
| 草稿 vs 发送 | `messages.is_draft`；`messages/api/route.ts:138`；`customers/api/people/[id]/emails/route.ts:21`（compose+send，异步队列） | 复用 |
| 渠道配置 | `communication_channels/lib/system-email.ts:272`；`system-email-provider-config.ts`（默认 resend，可选 ses）；channel-resend/ses/gmail/imap 包；`integration_credentials` 按租户；按租户 fail closed | 复用 |
| 模板 | 只有代码级 React：`messages/emails/MessageEmail.tsx` + 通知模板。**没有 DB 模板库/变量编辑器** | 包装 |
| 队列/重试/幂等 | `communication_channels/workers/outbound-delivery.ts:32` MAX_ATTEMPTS=3 + 可重试分类；`commands/deliver-outbound-message.ts:223` `already_delivered` | 复用 |
| 退信/投诉/退订 | 列存在（`message_recipients.email_sent_at/delivered_at/opened_at/failed_at`），但**没有投递事件回灌、没有抑制表** | **新建** |
| 审批原语 | workflows USER_TASK（`validators.ts:80-89`）+ `api/tasks/*` claim/complete/reassign + `api/work-inbox`；`ai_pending_actions`(idempotency_key, expires_at, status)；`inbox_proposals/inbox_proposal_actions`(status, executed_at, execution_error) | 复用 |
| 通知/收件箱 | `notifications` + `notification_types/_preferences/_overrides`；in_app/email/push 策略（`notifications/lib/strategies/email-delivery-strategy.ts:46`） | 复用 |
| 审计 | `action_logs`（undo/redo/export、snapshot_before/after）；`access_logs`；`audit_logs/api/audit-logs/*` | 复用 |
| 配额预留 | `attachment_quota_reservations`（reserved/actual/status/lease_token/expires_at）——**照抄这个模式**；`ai_token_usage_events/_daily` | 包装 |
| 邮箱校验/补全 | **没有**（只有 SSRF DNS 防护 `shared/lib/url-safety.ts`）；`@open-mercato/web-research` 是 SSRF-safe 抓取/抽取/融合引擎 | **新建** |
| 限流 | `shared/lib/ratelimit/service.ts` + endpoint rateLimit 元数据；`inbox_ops/lib/rateLimiter.ts:82` min/hour/day，缓存后端，fail closed | 复用 |
| 回信线程 | `communication_channels/lib/thread-matcher.ts`（References/In-Reply-To + provider id）；`channel_thread_mappings` | 复用 |
| 回复意图分类 | `inbox_ops/lib/extractionPrompt.ts:102` 分类 rfq/order/order_update/complaint/shipping_update/inquiry/payment/other —— 是**入站单据意图**，不是外发回复意图 | 包装 |

## (b) 相关表（节选）

`customer_entities`（多方根：kind、owner、lifecycle、status、source、temperature）、`customer_companies`、`customer_people`、`customer_person_company_links`、`customer_deals/_people/_companies`、`customer_pipelines/_stages/_deal_stage_transitions`、`customer_interactions/_activities/_comments`、`custom_field_defs/_values`、`dictionaries/dictionary_entries`、`messages/_recipients/_objects/_access_tokens/_confirmations`、`communication_channels/_thread_mappings/_thread_tokens`、`external_conversations/_messages`、`inbox_emails/_proposals/_proposal_actions/_discrepancies`、`workflow_definitions/_instances/_step_instances`、`user_tasks`、`notifications*`、`action_logs`、`access_logs`、`attachments/_partitions/_quota_reservations`、`ai_pending_actions`、`ai_token_usage_events/_daily`、`sync_excel_uploads`、`sync_runs`、`webhooks*`、`scheduled_jobs`、`business_rules`。

实际数据量：3 公司、6 联系人、6 商机、1 条 pipeline（8 阶段）、0 互动、0 任务、0 渠道、3 用户。

## (c) 完全缺失（要新建）

1. 候选/线索实体 + 提交（无表、无 API、无证据绑定）。
2. 证据/验证记录（method、result、checked_at、artifact）——attachments 通用但无类型。
3. 发送配额预留（只有附件字节配额）。
4. 审批→发送的统一幂等键：`ai_pending_actions.idempotency_key` 与 `messages.idempotency_key` 各管一段，没有跨 approve→enqueue→send 的单一键。
5. 抑制/退订/退信/投诉回灌：零表。Resend webhook 只处理**来信**，不处理投递事件。
6. 触达序列（campaign/sequence/enrollment/stop-on-reply）。
7. 回复意图taxonomy（有意向/退订/OOO/暂缓）→ CRM 结果映射。
8. Bot 绑定：`ai_chat_conversations.agent_id` 有，但没有「bot 身份→渠道→模板→候选」绑定；本安装也没有 telegram/whatsapp（只有 apns/expo/fcm/discord/gmail/imap/resend/ses）。

## (d) 需要用户定的 5 条业务规则

1. 候选用**新模块**，还是复用 `customer_entities` + `lifecycle_stage='lead'`？（复用快，但会污染搜索索引/去重/归属）
2. 去重权威：domain/email 硬唯一，还是软匹配 + 合并 UI？冲突时谁赢？
3. 发信身份：租户级系统通道，还是**每个业务员自己的邮箱**（OAuth/ToS/信誉限制不同）？
4. 配额语义：按租户/天 还是 按邮箱/天；在审批时预留还是入队时预留；provider 失败是否退款？
5. 审批门槛：全部首触、每域前 N 封，还是按风险分？哪些回复类别自动停止序列？

## (e) 5 条风险

1. 复用 `customer_entities` 装线索 → 线索进 CRM 列表/实体索引/漏斗分析，provenance 变浑。
2. 按员工邮箱群发会撞 Gmail/Resend 限额与 ToS；用 `sendAsUser` 做租户级群发是错的管道。
3. 没有抑制/投诉闭环 = 送达率崩塌 + 合规风险；open/click 列存在但没人填。
4. approve→retry 双发：`already_delivered` 只保护单条 message，不保护「同一候选同一步骤」。
5. Schema 归属：core 表在 `node_modules/@open-mercato/core/.../migrations`，改它升级就炸。**M5/M6 的表放新 `src/modules/*` 模块，用扩展点。**

**结论**：复用 CRM 核心 + 通信中心 + workflows 审批 + attachment 配额模式；只新建「候选语义层 + 抑制回灌 + 发送配额预留 + 回复意图分类」。
