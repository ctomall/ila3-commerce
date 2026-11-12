# M6 发送边界：一次性审批令牌（模拟传输，无外部副作用）

状态：代码 + 单测完成，随 release 部署；**真实外发未实现、未启用、未授权**。
关联：`docs/crm-platform/leadgen/EVIDENCE-2026-11-12-M5.md`、`docs/crm-platform/QA-SIGNOFF.md` §E、
`docs/crm-platform/05a-m4-runbook.md`。

## 1. 这一步解决什么

此前 M4 #7 只能验“审批绑定正文”，发送侧令牌复用无法验证，因为**没有发送入口**。
现在补上正式工程内的发送边界，并且**只实现不会产生外部副作用的那一半**：

- 传输只有 `createSimulatedTransport()`：进程内返回 `providerMessageId: null`，
  响应与落库都标 `externalEffect: false`、`state = 'simulated'`；
- 代码里没有任何 SMTP / HTTP / 供应商 SDK 调用，也没有“开关一开就会真发”的分支；
- 因此**它不可能把邮件发出去**，真实外发仍是另一批（见 §5）。

## 2. 令牌契约（真正被验证的部分）

| 约束 | 实现 | 拒绝码 |
| --- | --- | --- |
| 只有 `approved` 草稿可发 | 读取后校验 `status === 'approved'` | 409 `draft_not_approved` |
| 审批必须属于该草稿 | `approval.draftId === draft.id` | 404 `approval_not_found` |
| 审批必须是 approve | `decision === 'approved'` | 409 `approval_not_approved` |
| 审批必须未过期 | `expiresAt > now` | 409 `approval_expired` |
| 审批必须未被撤销 | `revokedAt === null` | 409 `approval_revoked` |
| 正文不得在审批后改动 | `approval.draftHash === draft.bodyHash` | 409 `body_hash_mismatch` |
| **一个审批最多产生一次投递** | 草稿 CAS `approved -> sent`，同一 key 命中即重放 | 200 重放 / 409 `already_sent` |
| 幂等键不可由客户端指定 | 服务端派生 `send:<draftId>:<draftHash>:<approvalId>` | — |
| 并发不重复投递 | CAS 失败 → 复核已有行 → 重放或 409 | 409 `send_in_progress` |
| 传输失败不烧令牌 | 行置 `failed`、草稿 `sent -> approved`、预留退还 | 502 `transport_failed` |
| 已投递草稿不得再审批 | `status === 'sent'` 时拒绝，**包括同一审批的重放**（先判状态再查重放） | 409 `already_sent` |
| 抑制名单优先于审批 | 先查 `leadgen_suppressions(email_hash)`，命中即拒 | 409 `suppressed` |
| 抑制名单可运维 | `POST/GET/DELETE /api/leadgen/suppressions`（部分唯一索引保证一个地址只有一条生效行；解除后立即恢复可投递） | 400 `invalid_input` |
| 投递必须有 `send` 额度预留 | 必须带 `leaseToken`；无则拒并回滚草稿认领 | 400 `quota_lease_required` |
| 预留必须指名该草稿 | 预留时强制 `draftId`（`subject_kind='draft'`）；dispatch 校验 `subject_id` 就是本草稿 | 400 `draft_required` / 409 `quota_lease_scope_mismatch` |
| 预留只被花一次 | 预留 CAS `reserved -> consumed` + 桶 `reserved-1/consumed+1` 同事务 | 409 `quota_lease_invalid` |
| 失败/写行失败退还额度 | `refundLease`：`consumed -> refunded` + 桶回滚 | — |

幂等键由服务端派生，所以客户端重复提交同一意图只会重放同一行，
换一个审批/草稿就会落到另一个 key，无法用“改 key”制造第二次投递。

## 3. 代码位置

| 层 | 文件 |
| --- | --- |
| 领域服务 | `src/modules/leadgen/services/send-service.ts`（`createSendService`、`createSimulatedTransport`、`sendIdempotencyKey`） |
| 持久化 | `src/modules/leadgen/services/send-repository.ts`（CAS 认领/释放、按 key 查重、状态落库） |
| 发送前置控制 | `src/modules/leadgen/services/send-guards.ts`（抑制名单查询、预留 CAS 消费/退还，事务内完成） |
| HTTP | `src/app/api/leadgen/drafts/[id]/sends/route.ts`（`POST`，feature `leadgen.sends.approve`） |
| 实体 | `src/modules/leadgen/data/entities.ts` → `LeadgenSend`（表 `leadgen_sends`，**已在生产**，本步无新迁移） |
| 审批收紧 | `src/modules/leadgen/services/outreach-service.ts`（已投递草稿拒绝再审批） |
| 单测 | `src/modules/leadgen/__tests__/send-service.test.ts`（13 例） |

**无新迁移**：`leadgen_sends` 是 M5 四片迁移已建的表（生产 17 张 leadgen 表之一），
`state` 为 text 列且无 check 约束（`pg_constraint` 计数 0），新增 `simulated` 取值不需要 DDL。

## 4. 验证

- 单测：`send-service.test.ts` 13/13；leadgen 全模块 45/45（`JEST_TIMEOUT=90000 JEST_MAX_WORKERS=2`）。
- M4 #7 新增实测项（对部署产物，走真实员工会话）：
  `one-approval-one-dispatch`、`dispatch-replayed-not-duplicated`、`single-send-row`、
  `approval-not-reusable-on-other-draft`、`approve-after-dispatch-refused`。
- 运行结论见本轮 `docs/crm-platform/verify/` 报告与 M4 矩阵归档。

## 5. 仍未做（真实外发需要单独授权）

已收口（2026-11-12，`d34c51c`）：抑制名单前置检查、`send` 预留的原子消费与失败退还——
三项都在 dispatch 内实现并由 M4 实测（见 §6、`EVIDENCE-2026-11-12-M6-DISPATCH.md`）。

仍未做：

1. **供应商适配器**：`OutboundTransport` 只有模拟实现；真实实现要接获准渠道（SMTP/供应商 API）、
   退回处理、bounce/complaint 回执接收（`leadgen_message_receipts` 已有表但没有写入方）。
2. **外发开关**：没有 flag、没有环境变量能打开真实发送；需要新增到生命周期配置里并默认关闭。
3. **额度桶的员工归属**：lease 现在绑定草稿（`subject_kind='draft'`），但还没校验预留是否由本员工发起
   （四层桶满足即可）；真实外发前应把 `scope_kind='employee'` 与调用者绑定。

以上三项属于 `M6 真实外发`，按原授权边界另批；本步不启用、不绕过。

## 6. M4 #7 现在证明什么（26 项）

超额度 429、首次预留 201、同键重放、额度耗尽 429、headroom 非负、`send` 预留 201、
草稿创建、审批绑定正文、审批重放、改正文 409、**抑制命中 409**、**无预留 400**、
一次审批一次投递（`simulated`）、**预留被消费 0:1**、重放不重复投递、`leadgen_sends` 仅 1 行、
**重放不再扣额度**、令牌不能跨草稿复用、投递后连审批重放也 409；
以及本轮新增的 **预留必须指名草稿**（无 draftId 400）、**lease 只能给它的草稿用**（409）、
**被拒的 dispatch 不消耗 lease**（桶停在 `1:1`）、**正确的草稿能消耗该 lease**（桶到 `0:2`）、
**抑制项由产品接口写入**（201）、**解除抑制后同一草稿可投递**。
