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
| 传输失败不烧令牌 | 行置 `failed` 并把草稿 `sent -> approved` | 502 `transport_failed` |
| 已投递草稿不得再审批 | `status === 'sent'` 时拒绝，**包括同一审批的重放**（先判状态再查重放） | 409 `already_sent` |

幂等键由服务端派生，所以客户端重复提交同一意图只会重放同一行，
换一个审批/草稿就会落到另一个 key，无法用“改 key”制造第二次投递。

## 3. 代码位置

| 层 | 文件 |
| --- | --- |
| 领域服务 | `src/modules/leadgen/services/send-service.ts`（`createSendService`、`createSimulatedTransport`、`sendIdempotencyKey`） |
| 持久化 | `src/modules/leadgen/services/send-repository.ts`（CAS 认领/释放、按 key 查重、状态落库） |
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

1. **供应商适配器**：`OutboundTransport` 目前只有模拟实现；真实实现要接获准渠道（SMTP/供应商 API）、
   退回处理、bounce/complaint 回执接收（`leadgen_message_receipts` 已有表但没有写入方）。
2. **send 额度原子扣减**：`quota_kind = 'send'` 的预留目前不会在 dispatch 时被消费；
   真实外发前必须把 `leaseToken` 与 CAS 认领放进同一事务，避免“扣了不发”或“发了不扣”。
3. **外发开关**：没有 flag、没有环境变量能打开真实发送，需要新增到生命周期配置里并默认关闭。
4. **抑制名单前置检查**：`leadgen_suppressions` 表存在，dispatch 尚未查询；真实外发必须在认领前查。

以上四项都属于 `M6 真实外发`，按原授权边界另批；本步不启用、不绕过。
