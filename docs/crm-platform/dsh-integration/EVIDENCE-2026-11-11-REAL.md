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

## 10. 生产切换（v22 / `b8bf3e4`，2026-11-11 12:57Z 起）

### 10.1 切换前发现：旧 OpenCode 引擎已不可用
生产 `POST /api/ai_assistant/chat`（引擎未切换、原生 OpenCode 路由）实测返回
`{"type":"error","error":"fetch failed"}`，日志显示 session 建立后 478 ms 失败。
根因：OpenCode 路由依赖本地 OpenCode server `http://localhost:4096`，本机无该二进制、
无该服务。**这不是 DSH 改动引入的回归；切换前聊天对所有人都是失败态。**

### 10.2 切换方式
- systemd drop-in `ila3-auto-deploy-app.service.d/20-dsh-canary.conf`
  → `EnvironmentFile=/home/pro/.local/state/ila3-dsh/canary.env`（0600）
- `canary.env`：`OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、`DSH_BIN=/home/pro/.local/bin/ila3-dsh-run`、
  `OM_DSH_ROOT=/home/pro/.local/state/ila3-dsh/root`、`OM_DSH_RUN_TOKEN_SECRET`、
  `OM_DSH_MCP_SCRIPT`、`OM_DSH_BRIDGE_URL=http://127.0.0.1:3000/api/internal/dsh-tools`、
  `OM_DSH_MODEL_BASE_URL=https://api.deepseek.com/anthropic`
- `OM_DSH_ENGINE_USERS` 先只放 acceptance 员工，验证通过后移除 → 全部员工走 DSH。

### 10.3 生产实测
| 账号 | 结果 |
| --- | --- |
| acceptance 员工 | 200；11 个 `dsh.event`；文本 `PROD_DSH_OK` / `PROD_EMP_DSH2`；run completed |
| superadmin | 200；11 个 `dsh.event`；文本 `PROD_ADMIN_DSH`；run completed |
| 未登录 | 401 |

证据：`prod-admin-dsh.sse`、`prod-employee-dsh.sse`；旧引擎失败：`prod-opencode-fetch-failed.sse`、`prod-opencode-fetch-failed-native.sse`。

### 10.4 回退边界
删除 drop-in 并重启即回到“原生 OpenCode 路由”，但该路由当前因缺 OpenCode server
仍然失败；真实可用的回退需要先部署 OpenCode server。**当前状态下 DSH 是唯一可用聊天引擎。**

### 10.5 未验证/未完成
- 除 admin + acceptance 外的其他员工未逐个实测（绑定为首次聊天懒创建）。
- `answerQuestion` 仍 501；写工具仍关闭；工具集仅 `crm_find_companies`。
- UI 前端对 DSH SSE 的完整交互（停止、重试、问题卡片）未逐个回归。
- 同 uid OS 隔离未实现。

## 11. 生产 UI 可达性探测（2026-11-11 13:0xZ）

用 Playwright（headless Chromium，任务专属 profile）以 API 登录后加载 `/backend`：

- acceptance 员工与 superadmin 的 `button[aria-label="打开 AI 助手"]` 均为 **`display:none` / 0×0**，页面上没有可见的聊天入口；截图：`prod-ui-assistant-hidden-admin.png`、`prod-ui-assistant-hidden-employee.png`。
- 该隐藏行为在切换前即存在（同一构建的 `AiAssistantIntegration` 只在挂载处渲染 DockableChat），不是 DSH SSE 改动导致。
- 因无可见入口，本轮无法完成“点击 → 输入 → 停止 → 重连”的 UI 回归；只能完成 API 级生产验证（见 §10）。

**未完成**：聊天入口的产品/权限暴露决策 + UI 端到端回归。当前生产可用路径是 CRM 内已有的 API/自动化入口，而非可点击的助手面板。

## 12. 生产 UI 恢复（v24/v25，`07fecd3` → `271b95c`）

### 12.1 根因链
1. UI 打开助手前请求 `/api/ai_assistant/health`，包内 handler 访问不存在的 OpenCode server → `fetch failed` → UI 判定不可用。
2. 即使 health 修好，`/api/ai_assistant/ai/agents` 的 `aiConfigured` 来自进程内 provider registry；该 registry 只在管理端读写设置时填充，重启后为空 → UI 仍报“未配置提供方密钥”。
3. UI 实际聊天走 **`/api/ai_assistant/ai/chat?agent=…`**（agentic 路径，AI SDK），不是 `/api/ai_assistant/chat`。

### 12.2 修复
- `src/proxy.ts`：`OM_AI_ENGINE=dsh` 时把 `GET /api/ai_assistant/health` 与 `GET /api/ai_assistant/ai/agents` 重写到内部 handler；
- `dsh-health`：同 auth + `ai_assistant.view` 门槛，返回 `{status:"ok",engine:"dsh"}`；
- `dsh-agents`：调用包内 catalogue（保留鉴权/列表），把 `aiConfigured` 置 true，并在返回前 `ensureProviderRuntime` 水合 provider registry。

### 12.3 生产 UI 实测（Playwright，headless Chromium）
| 步骤 | 结果 |
| --- | --- |
| 打开助手（本地可见性开关） | 助手列表出现 `Customers Account Assistant` |
| 选择 agent → 发送 `Reply with exactly UI_LIVE_OK` | 助手气泡返回 **`UI_LIVE_OK`**；截图 `prod-ui-chat-ok.png` |
| 同一时刻 `/api/ai_assistant/chat` | 200、11 个 `dsh.event`、`DSH_AFTER_UI`；证据 `prod-dsh-after-ui.sse` |

### 12.4 关键边界（必须保留）
UI 的 agentic 路径现在**可用**，但执行的是包内 AI SDK agent loop，**不是 DSH**；DSH 仍只覆盖 `/api/ai_assistant/chat`。把 UI agentic 协议接到 DSH 是下一阶段工作，不能把“UI 可用”当成“DSH 已接管 UI”。

默认可见性仍为隐藏（包内 `DEFAULT_VISIBILITY.enabled=false`），本轮测试通过 localStorage 打开；是否默认展示是产品决策。
