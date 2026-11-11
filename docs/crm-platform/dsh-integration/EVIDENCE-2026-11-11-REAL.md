# DSH 替换：真实模型 + 真实数据库闭环证据（2026-11-11）

> 性质：**隔离实例**（:3901，release `53e08fd`）+ **真实 DeepSeek 模型** + **生产库已应用迁移** 的闭环证据。
> 生产 `mercato.ila3.top` 仍运行 OpenCode；本轮未切换生产引擎。

## 0. 前置（已批准执行）

| 项 | 证据 |
| --- | --- |
| 迁移应用 | `Migration20261111083458_dsh_runs` 已应用于 `open_mercato`；`to_regclass` 三表非空；ledger 记录 1 行 |
| 备份 | `/home/pro/backups/open_mercato-schema-pre-dsh-runs-20261111T104706Z.sql` |
| 模型 | CRM 系统默认 provider `deepseek-flash`（settings 凭据，服务端解密，不落日志）；Messages 端点经 `OM_DSH_MODEL_BASE_URL=https://api.deepseek.com/anthropic` |
| 实例 | `OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、独立 `OM_DSH_ROOT`、独立端口 3901 |

## 1. 真实模型 + 持久化（superadmin）

```
POST /api/ai_assistant/chat → 200, 8,380 B, 3.9 s
SSE text: READY ; done: 1
```

数据库：

| 表 | 结果 |
| --- | --- |
| `dsh_assistant_bindings` | 1 行 active，assistant `crm-assistant` |
| `dsh_runs` | `completed`，idempotency `real-2`，cursor 17，result `{"finishReason":"completed","finalResponse":"READY"}` |
| `dsh_run_events` | 17 行，seq 1..17 连续 |

## 2. 幂等与断线恢复

| 场景 | 结果 |
| --- | --- |
| 同 idempotencyKey 同 prompt 重放 | 200；runs 计数 2→2（未新建）；SSE 5 text + 1 done；0.09 s |
| `{runId, cursor:15}` 重连 | 200；3 帧（seq 16、17 + done） |

## 3. 真实模型调用 CRM 工具（受控桥，binding active）

```
POST chat: 200, 10,572 B, 4.4 s
tool-call mcp__crm__crm_find_companies ×2（同 id 转发）
tool-result 200: {"companies":[],"scanned":3,
  "scope":{"mode":"organization","tenantId":"…","organizationId":"…"},
  "note":"只读查询；结果限定为调用者所在组织…"}
模型文本：确认调用并说明结果为空
```

这证明 D 的 200 路径：真实模型 → MCP → CRM 桥 → RBAC/范围 → 结构化结果 → 回到模型。

## 4. 取消与撤权（10 秒窗口）

| 场景 | 从调用到流结束 | DB | SSE |
| --- | --- | --- | --- |
| 用户取消（in-flight） | **401 ms** | `cancelled` | 200，error + done；响应 `{status:"cancelled"}` |
| 主管撤权（in-flight） | **858 ms** | run `cancelled`（reason `e2e-revoke-3`），binding `revoked` | 200，error + done（修复后不再 503） |

> 撤权场景首版在 submit→begin 竞态下返回 503；`1af6213` 修复为受控终态（200 SSE error+done），本表为修复后复测。
> 遗留：撤权流的 error 文案仍是通用 `persistence_unavailable`，应改成 `revoked/cancelled`（下轮修）。

## 5. 明确未完成

| 项 | 状态 |
| --- | --- |
| 生产切换 `OM_AI_ENGINE=dsh` | 未做 |
| 重启恢复（服务重启后 in-flight 行的收口/续跑） | 未接线；当前只有 `recoverInFlight` 查询与服务函数 |
| 两员工文件/记忆/产物/浏览器/凭据隔离 | 未测；同 Unix 用户，0700 ≠ 隔离 |
| `customer_access` 员工级客户范围 | 不存在，当前 `organization` 模式 |
| `answerQuestion` | 501（DSH 未迁移） |
| 写工具 | `write_not_enabled` |
| T7/T8 口径 | 待产品 |

## 6. 证据文件

`evidence/real-model-chat.sse`、`real-model-tool.sse`、`replay-idempotent.sse`、`resume-cursor.sse`、`revoke-inflight.sse`、`cancel-inflight.sse`、`dsh-runs.txt`、`dsh-bindings.txt`。

## 7. 重启恢复与撤权文案（v18 / `777cb7a`）

| 场景 | 结果 |
| --- | --- |
| 伪造 1h 前 `running` 行（模拟上一进程遗留） | 首个持久化请求后置为 `failed` / `server_restart`；同请求真实模型返回 `SWEEP_OK` 并 completed |
| v18 复测 2h 前 stale 行 | `stale-sweep-2 → failed/server_restart`，新 run `completed` |
| 撤权 in-flight（v18） | 200、**549 ms** 停流；SSE `error:"run_cancelled"`；run `cancelled`（reason `e2e-revoke-5`）；binding revoked |

证据：`restart-sweep.sse`、`revoke-run-cancelled.sse`、`recovery-sweep.txt`。

> 恢复口径：只收口"超过 run timeout + 60s"的遗留行，避免误杀并发 worker 的活 run；不承诺续跑，客户端可重试。
