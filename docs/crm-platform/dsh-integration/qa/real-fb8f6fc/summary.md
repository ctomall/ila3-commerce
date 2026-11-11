# DSH 替换独立复验 · fb8f6fc（隔离实例 :3901）

- 运行 commit：`fb8f6fc7a4a6ed678f9274accd6d3325cc4c9913`（release.json v0.2.2，createdAt 2026-11-11T12:13:09.025Z）
- 实例：`http://127.0.0.1:3901`，pid 2840547，`OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、`OM_DSH_ROOT=/tmp/dsh-e2e/runs-qa`，DB 迁移已应用
- 性质：只读/业务查询/聊天；未重启、未改生产配置、未写 docs；聊天产生的 run 行属验收允许
- 总体：**6 PASS / 1 FAIL（仅文档一致性审计 FAIL；运行时 6 项全 PASS）**

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 工具面 dump-config | **PASS** | `dump-config.txt`：persistent-bash(L113-115)/persistent-pwsh(L136-138)/tool-working-directory(L44-46)/rea-mcp(L167-175) 均 `disabled: true`；tool-fs(L32-39) `read/readImage/write/edit/applyPatch=false`；mcp-crm(L177-185) 存在（serverName crm） |
| 2 | 真实模型 QA_OK + DB | **PASS** | 登录 200；POST chat → 200，2.6 s，顶层 text `QA_OK`、done 1；DB run `9ce0a59b…` completed，cursor 17，events 1..17，result `QA_OK`（`qa-ok.sse`、`db-checks.txt`） |
| 3 | shell 探测 | **PASS** | POST chat → 200，**tool-call=0**；模型文本明确“can't run shell commands … only read-only CRM lookups”（`shell-probe.sse`） |
| 4 | CRM 工具 | **PASS** | tool-call `mcp__crm__crm_find_companies`（2 条同 id 转发，query Zzz/limit 1）；tool-result `companies:[],scanned:3`；最终文本 `TOOL_OK`（`crm-tool.sse`） |
| 5 | 双员工隔离 | **PASS** | admin run `8eefa280…` completed `QA_ADMIN_OK`；employee run `a2cd07ed…` completed `QA_EMPLOYEE_OK`；home `runs-qa/homes/667d4bd3…`（admin）与 `…/91b8e5d0…`（employee）均 **0700**（`iso-admin.sse`、`iso-employee.sse`、`db-checks.txt`） |
| 6 | 撤权 | **PASS** | 员工长任务 running 时 admin revoke → 200 `revokedRuns:1`；**59 ms** 停流；SSE `error:"run_cancelled"` + done；run `cancelled`（reason `qa-revoke-fb8f6fc`）；binding 曾 revoked，SQL 恢复 **active**（revision 7）（`revoke-result.json`、`revoke-inflight.sse`） |
| 7 | 文档一致性审计 | **FAIL** | 发现 4 处不一致：头部 release 过期、撤权文案旧状态、重启恢复“未接线”与第 7 节矛盾、双员工证据来自 `runs-real6` 而非当前 `runs-qa`（详见 `evidence-audit.md`） |

## 调用/执行路径

- 工具面：`cd /home/pro/releases/mercato/fb8f6fc… && OM_DSH_MCP_SCRIPT=$PWD/scripts/dsh-crm-mcp.mjs OM_DSH_BRIDGE_URL=http://127.0.0.1:9 OM_DSH_TOOL_TOKEN=x node /home/pro/dsh-src/apps/cli/lib/bin.js --profile sdk-minimal --patch $PWD/vendor/dsh/crm-profile.patch.yml --dump-config`
- 聊天：`POST http://127.0.0.1:3901/api/ai_assistant/chat`（admin / acceptance-employee 各自登录）
- 撤权：`POST http://127.0.0.1:3901/api/internal/dsh-bindings/revoke` body `{targetUserId, reason}`
- 恢复绑定：SQL `update dsh_assistant_bindings set status='active', revision=revision+1, updated_at=now() where user_id='77f676ed…'`
- DB 只读查询：`/home/pro/releases/mercato/fb8f6fc…/.env` 的 `DATABASE_URL`（未打印）

## 未通过项

- **第 7 项（文档一致性）**：4 处，均为文档/证据过期或自相矛盾，不是运行时缺陷：
  1. 文档头写 release `53e08fd`，同文第 8 节写 `fb8f6fc`，实跑 fb8f6fc。
  2. 第 4 节仍称撤权 error 为 `persistence_unavailable`；第 7 节和实跑均为 `run_cancelled`。
  3. 第 5 节称重启恢复“未接线”，第 7 节已给出 v18 restart-sweep 证据（本次未重跑，仅指出冲突）。
  4. 双员工证据文件路径为 `runs-real6`，当前实例 `OM_DSH_ROOT=runs-qa`；home 哈希可复现，但证据非当前实例产出。

## 证据文件

`summary.md`、`dump-config.txt`、`qa-ok.sse`、`shell-probe.sse`、`crm-tool.sse`、`iso-admin.sse`、`iso-employee.sse`、`revoke-inflight.sse`、`revoke-result.json`、`db-checks.txt`、`sse-summary.json`、`evidence-audit.md`、`revoke-test.mjs`
