# 生产 UI 修复复验 · release 5113ec9

- 运行 commit：`5113ec92e9d0227718439325e634673c80abba88`（v0.2.2，createdAt 2026-11-11T14:56:41.798Z）
- 文档 commit：`b76e6ec94f106518098f0d5bcb8fb45161249759`（仅文档）
- 实例：生产 `http://127.0.0.1:3000`，pid **3036553**，cwd `…/releases/mercato/5113ec9…`
- env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`
- 总体：**5 PASS / 0 FAIL**（上轮 2 个 FAIL 均已修复，回归项未发现退化）

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 默认 UI 入口 | **PASS** | `/backend` → topbar AI launcher → 选 `customers.account_assistant`（无 deep link）→ 默认会话 `ad0a60a5…`（admin 自有）、`isOwner=false` 未出现、composer `flex`、placeholder `随便问…`；发送 `DEFAULTUI-5113EC9-MWC8VIJA` → 助手气泡原样返回；`POST /api/ai_assistant/ai/chat?agent=customers.account_assistant` 200；DB run `8d20d02e…` completed，finalResponse 同值（`ui-default-entry.json/.png`、`db-check.txt`） |
| 2 | 会话 owner 过滤 | **PASS** | admin `GET /api/ai_assistant/ai/conversations?limit=10` 仅 `ad0a60a5…`、`f78d9dfd…`，不含员工 `357a19ce…`；employee 列表仅 `357a19ce…`，不含 admin `ad0a60a5…`/`f78d9dfd…`（`conversation-filter.json`） |
| 3 | 文档 §14/§16 | **PASS** | 头部第 4 行已改为“生产已于 12:57Z 切到 DSH”；§14.2 改为“文本中可见 Brightside；工具卡片未渲染（仅文本级闭环）”；§16 默认入口证据存在（`prod-ui-default-entry.png`，113353 B）；文档 commit b76e6ec。仅第 3 行仍以“性质：隔离实例”开篇，但已由第 4 行限定 §1–§9，无事实矛盾（`doc-check.txt`） |
| 4 | 回归抽验 | **PASS** | 文本：item 1 唯一标记回显 + DB completed；工具：UI 文本 `TOOL_OK`、工具卡片 0、server 日志 `dsh.tool_call allowed`（runId `82982371…`）；停止：run `f19a6be8…` cancelled、`finishReason:"cancelled"`、无 DSH 子进程；撤权：employee UI 长任务，admin revoke 200，UI **433 ms** 停止，run `7c0282c5…` cancelled、error `qa-ui-revoke-5113ec9`，binding 恢复 active（revision 13）（`ui-tool-regression.json/.png`、`ui-stop-regression.json`、`ui-revoke-regression.json/.png`） |
| 5 | 双员工浏览器隔离 | **PASS** | 两个独立 browser context：admin 默认会话 `ad0a60a5…`、列表 `ad0a60a5…`/`f78d9dfd…`；employee 默认会话 `357a19ce…`、列表仅 `357a19ce…`；两者 composer 均可见。home：admin `…/homes/667d4bd3…`、employee `…/homes/91b8e5d0…`，均 **0700**，不同目录；run→home 映射：admin run `8d20d02e…` 在 667d，employee run `7c0282c5…` 在 91b8（`ui-isolation.json`、`ui-isolation-*.png`、`db-check.txt`） |

## 点击/调用路径

- 默认入口（本次实际）：`/backend` → topbar “AI” launcher → 选 `customers.account_assistant` → composer（`textarea[placeholder="随便问…"]` / `aria-label="消息输入框"`）→ `发送消息`（无 deep link）。
- 工具回归：同会话发送“Use crm_find_companies query Zzz limit 1, then say TOOL_OK.”。
- 停止：长任务流中点击 `button[aria-label="取消流式响应"]`。
- 撤权：employee 同路径打开会话 → 长任务；admin `POST /api/internal/dsh-bindings/revoke {targetUserId, reason}`；SQL 恢复 binding active（revision+1）。
- 日志：`journalctl` 的 `ila3-auto-deploy-app[3036553]`，`dsh.tools` 记录 `crm.find_companies` `decision=allowed`。

## 未通过项

无（5/5 PASS）。

> 仅记录一个非阻断文档观察：文档第 3 行仍写“性质：隔离实例”，但第 4 行已明确生产切换并限定 §1–§9 为切换前隔离证据，不构成事实矛盾；如需完全消除歧义可把“性质”改为“隔离实例 + 生产切换后证据”。

## 证据文件

`summary.md`、`ui-default-entry.json`/`.png`、`conversation-filter.json`、`doc-check.txt`、`ui-tool-regression.json`/`.png`、`ui-stop-regression.json`、`ui-revoke-regression.json`/`.png`、`ui-isolation.json`、`ui-isolation-admin.png`、`ui-isolation-employee.png`、`db-check.txt`
