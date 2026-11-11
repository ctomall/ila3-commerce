# EVIDENCE-2026-11-11-REAL.md §14 与实跑一致性

- 实跑 release：`92510316fed61c9de5c3188b1d9a910aba20960d`（生产 :3000，pid 2993768）
- 实际 env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`
- 判定：**FAIL（§14 主体与实跑基本一致，但文档头部与 §14.3 自相矛盾；另有 1 处表述需降级理解）**

## 不一致

### 1. 文档头部仍称生产运行 OpenCode（明确错误）
- 文档第 4 行：`生产 mercato.ila3.top 仍运行 OpenCode；本轮未切换生产引擎。`
- 同文 §14.2 标题：`生产 UI 实测（Playwright，v26/v27，生产 3000）`；§14.3 第 250 行：`当前生产已开`。
- 实跑：生产 :3000 进程 env 为 `OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`；`POST /api/ai_assistant/ai/chat` 实际重写到 `dsh-agentic-chat` 并返回 200。
- 结论：第 4 行是过期/错误陈述，且与 §14.3 自相矛盾。

### 2. “页面可见 Brightside / UI→DSH→工具→UI 闭环”应按“文本可见”理解
- 文档 §14.2 第 242 行：`UI 返回 TOOL_UI_OK，页面可见 Brightside；证明 UI→DSH→受控工具→UI 闭环`。
- 实跑：让助手查 Brightside 时，UI 助手文本确实出现 `The company name is Brightside Solar.`，但 DOM 中 **工具卡片数 = 0**（`[data-ai-chat-tool-call]` 为 0）；工具调用发生在 server 日志（`dsh.tool_call allowed`），未渲染为 UI 卡片。
- §14.3 第 248 行已如实写明 `UI 不展示工具卡片`，因此第 242 行若被读成“有工具卡片”就是夸大；按文本闭环理解则与实跑一致。判定为“表述需降级”，非硬错误。

## 与实跑一致的部分
- §14.1 重写条件与代码：`src/proxy.ts` 在 `OM_AI_ENGINE=dsh` + `OM_DSH_AGENTIC=1` 时把 `POST /api/ai_assistant/ai/chat` 重写到 `src/app/api/internal/dsh-agentic-chat/route.ts`；后者转发到 `/api/internal/ai-assistant-dsh-chat` 并用 `createUIMessageStream` 仅重封装 text 事件。
- §14.2 文本回合：UI 气泡返回唯一标记；`ai/chat` 200；DB 最新 run completed 且 finalResponse 同值。
- §14.2 工具回合：UI 文本出现 `TOOL_OK`；server 日志 `{"name":"dsh.tools","tool":"crm.find_companies","decision":"allowed",...}`。
- §14.2 停止：点击停止后 DB 最新 run `cancelled`，`result_json.finishReason="cancelled"`；检查时无 DSH 子进程（`apps/cli/lib/bin.js` 0 条）。
- §14.3 边界：只映射文本、不展示工具卡片、每轮新 run、`OM_DSH_AGENTIC` 显式开启——均与实跑一致。

## 附：§14 未提及的 UI 入口缺陷（与 §14 的“生产 UI 可用”叙述相关）
- admin 打开 launcher 选 `customers.account_assistant` 时，默认加载 **employee 的 private conversation** `357a19ce…`：`isOwner=false`，页面显示“这是一个共享对话，你可以查看但不能回复”，composer 被隐藏，无法按该路径发送。
- 只有用 `?openAiConversation=ad0a60a5…`（admin 自己的会话）才能发送。§14.2 未说明该入口限制，故“生产 UI 实测”的可复现性依赖 admin 自有会话/deep link。
