# DSH 替换：真实模型 + 真实数据库闭环证据（2026-11-11）

> 性质：**隔离实例**（:3901；链路自 v14 起，独立 QA 复验于 release `fb8f6fc`/v19）+ **真实 DeepSeek 模型** + **生产库已应用迁移** 的闭环证据。
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
> 已修（v18/v19）：撤权/取消流按终态行判定，SSE error 为 `run_cancelled`；独立 QA 在 `fb8f6fc` 复测停流 **59 ms**。

## 5. 明确未完成

| 项 | 状态 |
| --- | --- |
| 生产切换 `OM_AI_ENGINE=dsh` | 未做 |
| 重启恢复 | v18 起已实现 stale-run sweep（超时+60s 的遗留行置 `failed/server_restart`）；**不承诺续跑**，客户端重试。QA 在 `fb8f6fc` 未重跑该项，以 §7 证据为准 |
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

## 8. 工具面收口与双员工隔离（v19 / `fb8f6fc`）

### 8.1 收口前的问题
`sdk-minimal` 会挂载 filesystem、working-directory、persistent bash/pwsh 和 REA MCP。
在用真实模型时这等于把宿主机文件读写交给模型——同 Unix 用户下可直接读另一员工的
DSH_HOME 或 `.env`。这是 C 的阻断问题。

### 8.2 收口
`vendor/dsh/crm-profile.patch.yml` 追加：
- `persistent-bash` / `persistent-pwsh` / `tool-working-directory` / `rea-mcp` → `disabled: true`
- `tool-fs` 嵌在 SDK 层，按 id 无法 disable，改为整行 config：`read/readImage/write/edit/applyPatch` 全 false

组合结果（release 内 `--dump-config`）：只剩 `mcp-crm` 一个业务工具源。

### 8.3 真实模型验证（v19，隔离实例 + 真实 DeepSeek）
| 探针 | 结果 |
| --- | --- |
| "Run `ls /`" | 0 个 tool-call；模型回答"只有 CRM 资源工具，没有 shell/命令执行能力" |
| `crm_find_companies` | 2 个 tool-call → `mcp__crm__crm_find_companies`；模型答 `TOOL_OK` |

### 8.4 双员工（superadmin / acceptance employee）
| 项 | 结果 |
| --- | --- |
| 会话 | 两人各自 200 SSE，文本 `ISOLATED_a` / `ISOLATED_e`；run 独立 completed |
| DSH_HOME | 两个不同 identity 目录：`667d4bd3…`、`91b8e5d0…`，均 `drwx------` |
| 工具 | 两人都只剩 CRM MCP；无 shell/fs |

证据：`iso-admin.sse`、`iso-employee.sse`、`shell-tool-absent.sse`、`mcp-tool-after-hardening.sse`、`per-employee-homes.txt`、`two-employee-runs.txt`。

独立 QA 在 `fb8f6fc` 以 `OM_DSH_ROOT=/tmp/dsh-e2e/runs-qa` 复跑：admin/employee 仍落在同一对 identity 目录（`667d4bd3…`/`91b8e5d0…`，0700），run `QA_ADMIN_OK`、`QA_EMPLOYEE_OK`；其证据在 `/tmp/reverify-loop/real-fb8f6fc/`。

### 8.5 残留风险（不掩盖）
仍以同一 Unix 用户运行；若 DSH 进程或 MCP 服务本身被攻破，OS 层仍可读兄弟目录。
0700 只防其他用户，不防同 uid。真正隔离需独立服务用户/容器（基础设施变更，另批）。

## 9. 员工级客户范围（v21 / `41612e4`）

`customer_access` 仍未落地，因此默认范围保持 `organization`，不伪装成员工隔离。桥已支持并可按显式开关验证 `own`：

- `OM_DSH_CUSTOMER_SCOPE=own` → 仅返回 `owner_user_id = 调用员工` 的公司；未知/缺省值回退 organization（不会静默收窄）。
- 单元测试：`src/lib/dsh/__tests__/scope.test.ts`（默认 organization、own、未知值）。

### 9.1 真实模型 + 真实库实测（隔离 :3901，own 模式）
临时把 `b026cb18…`（Brightside Solar）的 owner 设为 acceptance 员工，测后已恢复 `NULL`。

| 调用者 | 结果 |
| --- | --- |
| acceptance 员工 | 1 家公司：**Brightside Solar**、`brightsidesolar.com`、Renewable Energy；`mode:"own"`，note“本人负责的客户” |
| superadmin（不拥有该公司） | 0 家公司，`scanned:0`，`mode:"own"` |

证据：`own-scope-employee.sse`、`own-scope-admin.sse`。

### 9.2 顺带修复：加密字段以密文泄露给模型
旧实现用 MikroORM `fields` 投影，绕过加密自定义类型的水合，模型拿到 `enc:v1…` 密文（可用性故障，非明文泄露）。v21 改为加载实体后再裁剪最小字段；实测返回明文 `Brightside Solar`，SSE 中密文命中 0。

> 结论边界：这证明“可配置的员工级范围”是真实执行的，不等同于 `customer_access` 已交付；产品默认仍是组织范围，需口径决策后再切换。
