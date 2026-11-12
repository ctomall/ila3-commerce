# DSH 写工具与人工审批设计（C 阶段）

状态：实现中（2026-11-12）。授权来源：用户 2026-11-12「全部授权」。

## 1. 目标

把 DSH 工具桥从「只读」扩到「受控写入」，并让每一次 CRM 写入都必须由员工本人在
CRM 界面显式批准。写工具不是自动执行能力，而是「模型提议 → 员工审批 → 命令总线执行」。

## 2. 不变量（缺一不可）

1. 身份只来自 run token（tenant/organization/user/run/binding），模型参数不能指定。
2. 每次写调用仍走 `authorizeToolCall()`：绑定存在且 active、真实 ACL feature、
   `canWriteToCrm()`（写入时刻 run 仍 `running` 且绑定仍 active）。
3. 审批记录绑定 `(binding_id, tool, args_hash)`：批准 A 参数不可能执行 B 参数。
   绑定作用域而非 run 作用域，是因为一个 DSH run 只对应一轮对话；请求发起的那一轮
   会结束，员工批准后模型在**新的一轮**重试。`run_id` 仍保留用于审计。
4. 审批只由审批人本人使用：`dsh_write_approvals.user_id` 必须等于会话用户，
   tenant/organization 也必须一致。
5. 一条审批只能消费一次：执行前先原子认领（`approved -> executing`），并发调用
   只有一个能认领；执行成功后置 `consumed`，执行失败（未写入）则回退为 `approved`，
   重放同一调用得到 `approval_consumed`，不会二次写入。
6. 审批有效期 10 分钟；过期后需重新发起，不复用旧批准。
7. 写工具只允许字段白名单；`ownerUserId`、`isActive`、自定义字段等**不在**首批
   允许范围（避免借写工具改归属/停用）。
8. `own` 客户范围下，目标公司必须属于调用者本人；否则按 404 处理，不泄露存在性。
9. 写入通过既有命令总线 `customers.companies.update` 执行，保留审计、事件、撤销、
   缓存与索引失效；不直接改 ORM 实体。
10. 生产默认关闭：`OM_DSH_WRITES=1` 才启用写工具；关闭时返回 `write_not_enabled`。

## 3. 流程

```
DSH 模型 -> MCP crm_update_company
  -> POST /api/internal/dsh-tools/crm.update_company  (Bearer run token)
     1. verifyRunToken
     2. authorizeToolCall (binding active / ACL / canWriteToCrm)
     3. OM_DSH_WRITES !== '1' -> 403 write_not_enabled
     4. args_hash = sha256(canonicalJson(args))
     5. 已有 approved 且未过期 -> 原子 claim(approved->executing)
        -> 命令总线写入成功 -> settle(consumed) -> 200
        -> 写入失败（未落库）-> settle(approved) -> 403/404，可原样重试
     6. 否则 ensurePending -> 403 approval_required {approvalId, expiresAt}
  -> 助手告诉员工：已在审批中心发起写入审批

员工 -> /backend/config/ai-write-approvals
  -> POST /api/internal/dsh-write-approvals/<id> {decision: approve|reject}
     (会话身份；只能决定自己的审批；run 必须仍在途、绑定仍 active)
  -> 批准后员工让助手重试同一调用
  -> 第 5 步命中 approved -> consume -> 命令总线写入 -> 事件/审计
```

## 4. 数据表 `dsh_write_approvals`

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id / organization_id / user_id | uuid | 审批归属，来自 run token |
| binding_id / run_id | uuid | 员工绑定（审批身份）与首次发起该写入的 run（审计） |
| tool | text | 工具名（当前仅 `crm.update_company`） |
| args_hash | text | 规范化参数 SHA-256 |
| args_preview | jsonb | 人类可读摘要（公司 id/名称/变更字段），不含密钥 |
| status | text | pending / approved / executing / consumed / rejected / expired |
| requested_at / expires_at | timestamptz | pending 有效期 10 分钟 |
| decided_at / decided_by | timestamptz / uuid | 审批人 |
| consumed_at | timestamptz | 实际执行时刻 |

索引：`(binding_id, tool, args_hash)` 部分唯一（status in pending/approved，保证
同一员工同一参数只有一条存活请求）、`(user_id, status, requested_at)` 列表查询、
`(binding_id, tool, args_hash)` 普通索引、`(run_id)` 审计。

## 5. 失败码（稳定、可被前端与模型区分）

- `write_not_enabled` — 生产开关关闭（默认）。
- `write_denied` — run 已终态/绑定已撤销/无效 run。
- `approval_required` — 已生成待审批记录，附 `approvalId`、`expiresAt`、`summary`。
- `approval_rejected` — 员工拒绝了同一参数调用。
- `approval_expired` — 旧批准已过期（新的 pending 会重新生成）。
- `approval_consumed` — 同一批准已执行过，拒绝二次写入。
- `approval_unavailable` — 审批存储不可用（fail closed）。

## 6. 回退

- 关闭 `OM_DSH_WRITES` 即回到只读 + `write_not_enabled`，无需回退代码。
- 审批表是新增表，回退代码后保留不影响运行；必要时 `drop table dsh_write_approvals`
  （重要删除，另行审批）。
