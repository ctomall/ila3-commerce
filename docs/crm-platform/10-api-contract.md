# M5/M6/M7 接口契约草案（待评审）

> 状态：**草案，未挂载**。`docs/crm-platform/api/leadgen-openapi.json` 里 14 条路径当前都不存在，`scripts/crm-contract-check.mjs` 会同时检查「草案是否自洽」和「是否与线上 676 条路径撞车」。

## 1. 为什么先写契约再写代码

实现之前先把三条硬规则写进 schema，代码才有东西可对照：

| 规则 | 检查方式 |
|---|---|
| 身份不进 body | 递归扫 request body，出现 `tenantId/organizationId/actorUserId` 即失败 |
| 每个操作声明所需功能点 | 缺 `x-required-features` 或非 `leadgen.*` 即失败 |
| 写操作必须声明幂等键 | 缺 `x-idempotency` 即失败 |
| 额度型写操作声明 429 | 提到 quota/额度 的 POST 缺 429 即失败 |
| 版本化写操作声明 409 | PUT/PATCH 缺 409 即失败 |
| 不撞线上路径 | 与 `/api/docs/openapi` 的 676 条逐一比对 |

## 2. 覆盖的 14 条路径

| 组 | 路径 | 关键点 |
|---|---|---|
| Run | `POST /leadgen/runs` | 幂等：`sha256('run:'+run_key)`；额度不足 429 |
| 候选 | `GET /leadgen/candidates`、`GET /leadgen/candidates/{id}` | 跨组织返回 **404 而非 403** |
| 验证 | `POST /leadgen/candidates/{id}/verify` | 同 `verifier_version + input_digest` 不重算 |
| 审核 | `POST /leadgen/candidates/{id}/decisions` | `decision_key` 幂等；并发 409 |
| 入库 | `POST /leadgen/candidates/{id}/crm-write` | 组合幂等键；归属冲突 409 且只告知归属 |
| 配额 | `GET /leadgen/quota/buckets`、`POST /leadgen/quota/reservations` | 四层余量；预留失败 429 |
| 草稿 | `POST /leadgen/drafts` | 幂等：`candidate_id + body_hash` |
| 审批 | `POST /leadgen/drafts/{id}/approvals` | 绑定 `draft_hash`；正文变动 409 |
| 发送 | `POST /leadgen/drafts/{id}/sends` | 需 `approvalId` + `leaseToken`；send_key 由服务端派生，一个审批最多一次投递；抑制命中 409、无预留 400、预留只消费一次；过期/撤销/改正文/跨草稿复用 409 |
| 抑制 | `GET|POST|DELETE /leadgen/suppressions` | 邮箱以 hash 呈现；同地址只保留一条生效行（部分唯一索引）；`DELETE` 解除后恢复可投递 |
| 回调 | `POST /leadgen/webhooks/providers/{provider}` | 验签（`x-auth: signature`）；`provider_event_id` 去重 |
| 绑定 | `GET|PUT /leadgen/bindings/employees` | 按 `version` 乐观锁 |

## 3. 负向对照（证明 linter 不是空转）

| 注入的错误 | 结果 |
|---|---|
| 在 `/leadgen/runs` 的 body 里加 `tenantId` | **FAIL** `request body exposes tenantId` |
| 把 `/customers/companies` 塞进草案 | **FAIL** 两条：不在 `/leadgen/` 下 + 与线上路径撞车 |

## 4. 尚未决定、因此**未写进 schema** 的部分

- 候选去重键组成（D2）：`companyDedupeKey` 只出现在设计文档，不进请求体。
- 可触达判定字段（D3）。
- 额度层级粒度（D4）：schema 里 `quotaKind` 有值，但四层归属由服务端派生。
- 审批门槛与 TTL（D5）：`expiresInMinutes` 只是范围 5–1440，默认值待定。
- 渠道（D8）：`/sends` 不带 provider 字段，由服务端按绑定解析。
- 发送幂等键（实现偏离草案，2026-11-12）：草案里由客户端传 `send_key`，实现改为**服务端派生**
  并由草稿 CAS（`approved -> sent`）保证一次性；否则客户端可换 key 制造第二次投递。
  `send` 额度在 dispatch 内原子消费（`d34c51c`），抑制名单前置检查同时生效；
  真实 provider 投递与默认关闭的外发开关仍未实现（M6 另批，见
  `leadgen/EVIDENCE-2026-11-12-M6-DISPATCH.md`）。

## 5. 复跑

```bash
node scripts/crm-contract-check.mjs
# 期望：16 operation(s), 14 path(s); OK
```
