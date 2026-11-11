# 生产 DSH 复验 · release 07112a6（UI 桥重试幂等）

- 运行 commit：`07112a63f4b0f5224a512e850b44eff05a5f5a94`（v0.2.2，createdAt 2026-11-11T22:58:43.577Z）
- 实例：生产 `http://127.0.0.1:3000`，pid **3252810**，cwd `…/releases/mercato/07112a6…`
- env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`、`OM_DSH_SINGLE_INSTANCE=1`
- 总体：**5 PASS / 0 FAIL**

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 重试幂等 | **PASS** | 固定 `sessionId=qa-session-07112a6-mwcq24js`、唯一标记 `RETRY_QA_07112A6_MWCQ24JS`，同一 body 连发两次：均 **200**、均含标记；`dsh_runs` admin 计数 **53→54**（第一次）→ **54**（第二次，未新建）；第二次为同一 run `e69818bc…` 重放（`retry-idempotency.json`、`retry-first.sse`、`retry-second.sse`） |
| 2 | 新轮次不误重放 | **PASS** | 同一 sessionId、消息内容改为 `…_NEW`：第三次 **200**、含新标记；计数 **54→55**，新建 run `9721b7fe…` completed，finalResponse 为新标记（`retry-idempotency.json`、`retry-newturn.sse`、`db-check.txt`） |
| 3 | 回归抽验 | **PASS** | UI 文本：`UI07112A6-MWCQ2FS6` 气泡回显，run `340d11fb…` completed；停止：run `37b4fb76…` cancelled、`finishReason:"cancelled"`、无 DSH 子进程；撤权：employee UI 长任务，admin revoke 200，UI **396 ms** 停止，run `a34162b6…` cancelled、error `qa-ui-revoke-07112a6`，binding SQL 恢复 active（revision 19）（`ui-text-stop.json/.png`、`ui-revoke.json/.png`） |
| 4 | 文档 §27 | **PASS** | §27 描述与实测一致：同 body+sessionId 两次均 200、第二次不新建、重放同回答；新轮次文本变化换 key（本次 53→54→54→55，文档 75→76→76 为环境计数）。未发现夸大；证据文件 `bridge-retry-first.sse`/`bridge-retry-second.sse` 存在（`doc-check.txt`） |
| 5 | 源码 key 公式 | **PASS** | `dsh-agentic-chat/route.ts` L49-52：`sha256(sessionId + '\u0000' + prompt).slice(0,32)`；用本次 sessionId/prompt 计算 key `e44ed5b2…` 与 DB run 的 idempotency_key **一致**；`randomUUID()` 仅用于 UI `text-start` part id，不参与 key（`source-check.txt`、`key-check.json`） |

## 调用路径

- 重试：admin 登录 → `POST /api/internal/dsh-agentic-chat`（body 含 `sessionId` + `messages`）连发两次；再发内容变化的一次。
- 回归 UI：`/backend` → AI launcher → `customers.account_assistant` → composer；停止按钮；employee UI 长任务 + admin `POST /api/internal/dsh-bindings/revoke`，SQL 恢复 active。
- 计数/DB：`dsh_runs` 按 admin user_id 查询；key 比对用同一 sessionId/prompt 复算。

## 未通过项

无（5/5 PASS）。

## 证据文件

`summary.md`、`retry-idempotency.json`、`retry-first.sse`、`retry-second.sse`、`retry-newturn.sse`、`key-check.json`、`source-check.txt`、`ui-text-stop.json`/`ui-text-stop.png`、`ui-revoke.json`/`ui-revoke.png`、`doc-check.txt`、`db-check.txt`
