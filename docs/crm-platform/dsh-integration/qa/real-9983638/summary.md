# 生产 DSH 复验 · release 9983638（工具卡 / 写闸门 / 并发）

- 运行 commit：`9983638b39e60c19ae670fcf5668386c0c938448`（v0.2.2，createdAt 2026-11-11T15:35:57.609Z）
- 实例：生产 `http://127.0.0.1:3000`，pid **3092836**，cwd `…/releases/mercato/9983638…`
- env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`
- 总体：**5 PASS / 0 FAIL**

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 工具卡渲染 | **PASS** | admin 默认 UI 入口（无 deep link）发送 “Use crm_find_companies with query Brightside limit 3, then say TOOLCARD_OK”：DOM `[data-ai-chat-tool-calls]` **1**、`[data-ai-chat-tool-call]` **1**（`mcp.crm.crm_find_companies`，完成）；助手文本包含 `crm_find_companies` 与 `TOOLCARD_OK`；`ai/chat` 200；DB run `b235e7d7…` completed，finalResponse 含 `TOOLCARD_OK`；截图 `ui-toolcard.png`，server 日志 `dsh.tool_call allowed` |
| 2 | 写拒绝 | **PASS** | 取最新 completed run `0f8506f4…` 的 run/binding/user/tenant/org，用 canary.env 的 `OM_DSH_RUN_TOKEN_SECRET` 调 `signRunToken`（token 未打印；与生产 env secret 一致 = true），`POST /api/internal/dsh-tools/crm.update_company` → **403 `{"code":"write_denied"}`**（`write-denied.json`） |
| 3 | 并发冲突 | **PASS** | 同 key 并发：第一个 **200 SSE**（12,033 B），第二个 **409 `run_in_progress`**（含 runId/cursor）；不同 key 同 binding：**409 `run_in_progress`**；DB 仅新增 1 行 run `ed2fa152…` completed；结束后无 `apps/cli/lib/bin.js`/DSH 子进程（`concurrency-result.json`、`db-check.txt`） |
| 4 | 回归抽验 | **PASS** | UI 文本：item 1 `TOOLCARD_OK` 回显；停止：长任务点击停止 → run `36c43e27…` cancelled、`finishReason:"cancelled"`、无子进程；撤权：employee UI 长任务 → admin revoke 200，UI **144 ms** 停止，run `f0f41c41…` cancelled、error `qa-ui-revoke-9983638`，binding SQL 恢复 active（revision 15）（`ui-stop.json/.png`、`ui-revoke.json/.png`） |
| 5 | 文档 §18/§19/§20 | **PASS** | §18 写拒绝与实测一致（403 write_denied）；§19 工具卡 DOM/文本与实测一致（list 1 / call 1、`mcp.crm.crm_find_companies`、完成、`TOOLCARD_OK`）；§20 并发结果与实测一致（1×200、1×409 run_in_progress、DB 1 行、子进程 0）。未发现夸大；§18 的读路径 `READ_OK_29` 本轮未单独复跑（不影响写拒绝结论）（`doc-check.txt`） |

## 调用/点击路径

- UI：`/backend` → topbar “AI” launcher → `customers.account_assistant` → composer → 发送工具 prompt；工具卡片由新桥 `tool-input-start`/`tool-input-available`、`tool-output-available` 渲染。
- 写拒绝：`POST http://127.0.0.1:3000/api/internal/dsh-tools/crm.update_company`，`Authorization: Bearer <signRunToken 生成，未打印>`；secret 取自 `/home/pro/.local/state/ila3-dsh/canary.env`。
- 并发：`POST /api/internal/ai-assistant-dsh-chat`，同/不同 `idempotencyKey`，admin cookie。
- 停止/撤权：UI 停止按钮；admin `POST /api/internal/dsh-bindings/revoke`；SQL 恢复 binding active。

## 未通过项

无（5/5 PASS）。

## 证据文件

`summary.md`、`ui-toolcard.json`/`ui-toolcard.png`（`ui-toolcard-aborted.*` 为首次被中途关闭的尝试，未计入）、`write-denied.json`、`sign-write-probe.mts`、`concurrency-result.json`、`ui-stop.json`/`ui-stop.png`、`ui-revoke.json`/`ui-revoke.png`、`doc-check.txt`、`db-check.txt`

> 说明：写拒绝探针脚本最初在 release 目录生成 `write-denied.json`，已移至本目录并删除 release 内临时文件；未改任何代码/配置。
