# DSH 替换：A 阶段端到端证据（2026-11-11）

> 性质：**隔离实例 + mock 模型**的端到端证据。不是真实模型报告，也不是生产切换。
> 生产 `mercato.ila3.top` 仍运行 OpenCode（`OM_AI_ENGINE` 未设置），回退路径保持完好。

## 1. 被测代码

| 项 | 值 |
| --- | --- |
| release | `ec58d9a12837119d6e0a0828b1ac4fe3399efe8d`（CI 产物，main） |
| 代码 | `src/lib/dsh/runtime/*`、`src/app/api/internal/ai-assistant-dsh-chat/route.ts`、`src/proxy.ts` |
| 引擎开关 | `OM_AI_ENGINE=dsh`；未设置/其他值 → 包内 OpenCode 路由 |
| DSH 运行时 | `/home/pro/dsh-src/apps/cli/lib/bin.js`（0.2.2-rc.1，`--profile sdk-minimal`） |
| 模型 | 本机 mock（`/tmp/dsh-e2e/llm-mock.mjs`，Anthropic Messages SSE，回 `MOCK_OK`），**无真实外呼/无密钥** |
| 隔离方式 | release 目录 + 端口 3901 + 独立 `OM_DSH_ROOT=/tmp/dsh-e2e/runs`；不重启生产、不改 DB 业务数据 |

## 2. 结果 A1：运行时直连（`startDshRun`）

```
node --import tsx/esm /tmp/dsh-e2e/run.mts
→ {"sessionId":"session-6620…","eventCount":16,
   "result":{"finalResponse":"MOCK_OK","finishReason":"completed"},
   "closed":{"stopped":true}}
```

mock 收到 `POST /v1/messages`。证明：协议握手、`session/query`、事件流、结果结算、进程退出确认均对真实 DSH 生效。

## 3. 结果 A2：正式聊天入口（Next 产物，端口 3901）

```
OM_AI_ENGINE=dsh DSH_BIN=/tmp/dsh-e2e/dsh-wrap.sh \
OM_DSH_ROOT=/tmp/dsh-e2e/runs node_modules/.bin/next start -p 3901
```

| 断言 | 实测 |
| --- | --- |
| 进程 env | `/proc/2586089/environ` 含 `OM_AI_ENGINE=dsh`、`DSH_BIN=…` |
| 登录 | `POST /api/auth/login` 200 |
| 聊天 | `POST /api/ai_assistant/chat` → **HTTP 200**，6,386 B，1.13 s |
| SSE 事件 | `thinking` ×2、`text` ×5、`debug` ×2、`done` ×1、`dsh.event`（`session.event`/`step/start` 等） |
| 文本 | `MOCK_OK` |
| 引擎证明 | mock 的 `/v1/messages` 计数 1 → 2（OpenCode 不会请求该 mock） |
| 原始流 | `evidence/chat-dsh-mock.sse` |

对照：生产 3000 未设置 `OM_AI_ENGINE`，未登录 `POST /api/ai_assistant/chat` 仍返回 `401 {"error":"未登录"}`（包内 OpenCode 路由），回退未被破坏。

## 4. 当前边界（未完成，如实保留）

| 项 | 状态 |
| --- | --- |
| 真实模型调用 | **未做**（需已获准配置/预算；本轮仅 mock） |
| 生产切换 `OM_AI_ENGINE=dsh` | **未做**（要求真实模型 + 工具桥 + 持久化后再灰度） |
| 持久化接线（B） | 实体/仓储/迁移草案已写（28 tests），迁移**未应用**，路由仍用内存态路径派生；重启恢复未实测 |
| 工具桥接线（C/D） | 桥与逐调用鉴权已写（49 tests），但 A2 尚未签发 run token、未把桥挂给 DSH；写路径未开 |
| 两员工隔离 | **未测**（同 Unix 用户，0700 不等于员工隔离；需 OS 级隔离方案） |
| `customer_access` 员工客户范围 | 不存在，当前仅组织范围 |
| 真实取消/SSE 断线重连 | 仅单测/协议层，未在真实 Next 会话上验收 |

## 5. 复现命令

```bash
# mock 模型
node /tmp/dsh-e2e/llm-mock.mjs            # 127.0.0.1:38123
# 隔离实例（release 目录内）
OM_AI_ENGINE=dsh DSH_BIN=/tmp/dsh-e2e/dsh-wrap.sh OM_DSH_ROOT=/tmp/dsh-e2e/runs \
  node_modules/.bin/next start -p 3901
# 正式入口
curl -b cookies -N -X POST http://127.0.0.1:3901/api/ai_assistant/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Reply with exactly MOCK_OK and nothing else."}]}'
```

## 6. 独立 QA 复核（2026-11-11）

`qa-gate` 在同一隔离实例（:3901，release `ec58d9a`）独立复跑，结论 **PASS**：

| 断言 | 结果 |
| --- | --- |
| 进程/env | pid 2586089；cwd 指向 `ec58d9a` release；`OM_AI_ENGINE=dsh` |
| 正式入口 | 登录 200；`POST /api/ai_assistant/chat` → 200 `text/event-stream` |
| SSE | `MOCK_OK` 命中；`done` 恰好 1；`dsh.event` 11 条 |
| 引擎证明 | mock `/v1/messages` 计数 +1（2→3） |
| 生产回退 | :3000 未登录 POST → 401 `{"error":"未登录"}` |

证据：`/tmp/reverify-loop/dsh-e2e/{summary.md,verify-result.json,chat.sse,mock-before.json,mock-after.json,prod-fallback.json}`。
实例与 mock 已关闭，端口 3901/38123 无监听。
