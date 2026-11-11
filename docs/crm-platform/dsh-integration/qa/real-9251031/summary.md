# 生产 UI · DSH agentic 桥独立复验 · 9251031

- 运行 commit：`92510316fed61c9de5c3188b1d9a910aba20960d`（v0.2.2，release createdAt 2026-11-11T14:20:29.559Z）
- 实例：生产 `http://127.0.0.1:3000`，pid **2993768**，cwd `…/releases/mercato/9251031…`
- env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`
- 总体：**4 PASS / 2 FAIL**（运行时 3 项 + 代码路径 PASS；UI 入口路径 FAIL、文档 §14 一致性 FAIL）

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 代码路径 | **PASS** | `src/proxy.ts` L12-13/L55-64：dsh+AGENTIC=1 时 `POST /api/ai_assistant/ai/chat` → `/api/internal/dsh-agentic-chat`；`dsh-agentic-chat/route.ts` L46 转发到 `/api/internal/ai-assistant-dsh-chat`，L72-108 用 `createUIMessageStream` 仅重封装 `text-start/delta/end`（`code-path.txt`） |
| 2 | UI 文本 | **FAIL（指定入口）** | 选 `customers.account_assistant` 默认加载 employee 的 private conversation `357a19ce…`，`isOwner=false`、页面显示“共享对话…不能回复”、composer `display:none`，无法发送（`ui-default-readonly.json/.png`）。改用 admin 自有会话 `?openAiConversation=ad0a60a5…` 后：唯一标记 `QAUI-9251031-MWC7QX93` 出现在助手气泡；`ai/chat` 200；DB run `fb2d484c…` completed，finalResponse 同值（`ui-text-result.json`、`ui-text.png`、`db-ui-checks.txt`） |
| 3 | UI 工具 | **PASS（文本级）** | prompt 后 UI 助手文本 `TOOL_OK`；DOM **工具卡片数 0**（桥只映射 text，§14.3 已声明）；server 日志 `dsh.tool_call` `tool=crm.find_companies` `decision=allowed`（runId `237ff4c8…`）；DB run completed finalResponse `TOOL_OK`（`ui-tool-result.json`、`server-log.txt`） |
| 4 | UI 停止 | **PASS** | 长任务流中点击方形停止按钮；DB 最新 run `a7c225ee…` `cancelled`，`result_json.finishReason="cancelled"`；无 `apps/cli/lib/bin.js` / DSH 子进程残留（`ui-stop-result.json`、`ui-stop.png`） |
| 5 | UI 撤权 | **PASS** | employee UI（自有会话）长任务 running 时 admin revoke → 200 `{revokedRuns:1}`；UI **135 ms** 停止；run `4111d066…` `cancelled`，`error=qa-ui-revoke-9251031`；binding `revoked` 后 SQL 恢复 `active`（revision 10→11）（`ui-revoke-result.json`、`ui-revoke.png`） |
| 6 | §14 文档一致性 | **FAIL** | 见 `evidence-audit.md`：①文档头仍称生产运行 OpenCode，与 §14.2/14.3 和实际 env 矛盾；②“页面可见 Brightside / UI→工具→UI 闭环”应按“文本可见”理解（工具卡片 0，§14.3 已如实声明，非硬错误）；③§14 未披露 admin 默认选中 employee 只读会话的入口缺陷 |

## 调用/点击路径

- 代码：`POST /api/ai_assistant/ai/chat` → proxy（dsh + AGENTIC=1）→ `/api/internal/dsh-agentic-chat` → `/api/internal/ai-assistant-dsh-chat` → DSH 子进程；text → `createUIMessageStream`。
- UI 正常路径（文档口径）：`/backend` → topbar “AI” launcher → 选 `customers.account_assistant` → 发送。
- 本次实际可发送路径：`/backend?openAiConversation=ad0a60a5-bd37-4642-aa35-10a217cd14b3`（admin 自有会话）→ composer “发送消息”。
- 停止：流中 `button[aria-label="取消流式响应"]`。
- 撤权：employee UI 会话 `357a19ce…` 发长任务；admin `POST /api/internal/dsh-bindings/revoke {targetUserId, reason}`；SQL 恢复 binding active。
- 日志：`journalctl` 的 `ila3-auto-deploy-app[2993768]`（`dsh.tools`/`dsh_bindings.revoke`）。

## 未通过项

1. **第 2 项 UI 入口 FAIL**：launcher 选择 `customers.account_assistant` 时没有按 owner 过滤会话，admin 被带入 employee 的 private 会话 `357a19ce…`（`isOwner=false`），composer 隐藏，指定“选 agent → 发送”路径不可用；用 admin 自有会话 deep link 才能发送。建议：launcher/AiChat 只自动打开当前用户拥有的会话，或选择 agent 后新建自己的会话。
2. **第 6 项文档 FAIL**：`EVIDENCE-2026-11-11-REAL.md` 第 4 行仍写“生产仍运行 OpenCode”，与 §14.3“当前生产已开”、实际 env `OM_AI_ENGINE=dsh` 矛盾；§14.2 的“Brightside / 闭环”应按文本可见理解（工具卡片实际 0），§14.3 已声明但 §14.2 未显式限定。

## 证据文件

`summary.md`、`code-path.txt`、`ui-default-readonly.json`/`.png`、`ui-text-result.json`/`ui-text.png`、`ui-tool-result.json`/`ui-tool.png`、`ui-stop-result.json`/`ui-stop.png`、`ui-revoke-result.json`/`ui-revoke.png`、`server-log.txt`、`db-ui-checks.txt`、`evidence-audit.md`
