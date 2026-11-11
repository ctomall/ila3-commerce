# DSH 替换 OpenCode：集成设计（2026-11-11）

> 状态：设计与分阶段实施中。不是验收证据；验收必须给同一候选 commit 的代码路径、正式路由实际引擎、真实账号路径、结果/失败/权限拒绝/撤权/重启恢复证据。
> 约束：复用现有代码；不直接改 `node_modules`；不新增超预算补丁；生产迁移、重要删除、真实外发、新增付费调用另批。

## 1. 现状（已核对）

| 事实 | 位置 |
| --- | --- |
| 正式聊天路由直接实例化 OpenCode 客户端 | `node_modules/@open-mercato/ai-assistant/src/modules/ai_assistant/api/chat/route.ts:218`（`createOpenCodeClient()`），SSE 由 `handleOpenCodeMessageStreaming` 产生 |
| 前端调用固定路径 | `.../frontend/hooks/useCommandPalette.ts` → `POST /api/ai_assistant/chat` |
| 包路由由 app catch-all 分发 | `src/app/api/[...slug]/route.ts` + `.mercato/generated/api-route-shards.generated.ts` |
| app 已有静态路由覆盖先例 | `src/app/api/auth/login/route.ts`（Next 静态路由优先于 catch-all） |
| DSH 规则组件已存在 | `src/lib/dsh/profile.ts`、`run.ts`（Run 状态机/撤权 10s 契约）、`tool-policy.ts`（工具三类分权） |
| PoC 仅协议层 | `/home/pro/dsh/crm-dsh-adapter-poc`：真实 SDK 子进程 + synthetic fixture，模型 mock，RunAdapter 用内存 Map，未接 CRM 路由/工具/数据库 |

## 2. 目标架构

```
Browser (command palette, 既有 SSE 契约)
   │ POST /api/ai_assistant/chat
   ▼
app route override  src/app/api/ai_assistant/chat/route.ts   ← 引擎开关 OM_AI_ENGINE
   │  认证=CRM session；Run 持久化；事件游标；取消/重连
   ├── opencode（回退路径，保持原包 handler 不变）
   └── dsh  src/lib/dsh/runtime/*  ── spawn ──▶ dsh 运行时（固定版本，独立 DSH_HOME/run workspace）
                                                   │ MCP stdio/HTTP（run token, 每次调用重鉴权）
                                                   ▼
                                        CRM 工具桥（crm.find_companies 等）
                                                   │ RBAC + customer_access + 写前 canWriteToCrm
                                                   ▼
                                             CRM 业务 API / ORM
```

**关键决策**

1. 不 import 未发布的 `dsh-sdk-client` 源码；按 `@deepseek-ai/dsh-sdk-protocol` 文档实现 CRM 自己的 newline-JSON-RPC 客户端（可维护、可测试、无跨仓路径依赖）。
2. 运行时用 npm 固定版本 `@deepseek-ai/dsh@0.2.2-rc.1`（已发布；CLI bin `dsh`），通过 CRM 专用 profile/patch 文件启动；模型与密钥来自现有已获准配置（env 白名单注入，不落库、不日志）。
3. 路由用 Next 静态路由覆盖（与 `api/auth/login` 同机制），不改包；`OM_AI_ENGINE=opencode|dsh` 提供受控切换与回退。
4. 身份只来自服务端 session；请求体中的 actor/员工字段一律不信任。Run token = HMAC(userId, tenantId, orgId, bindingId, runId, exp)，工具桥每次调用重算权限。
5. 持久化用新模块表；内存 Map 只允许出现在单测。迁移先生成审阅，应用另批。

## 3. 文件地图（分阶段）

| 阶段 | 文件 | 内容 |
| --- | --- | --- |
| A1 | `src/lib/dsh/runtime/{types,transport,launch,index}.ts` | JSON-RPC ndjson、进程启动/环境白名单/超时/close 确认；fixture 测试 |
| A2 | `src/app/api/ai_assistant/chat/route.ts` | 引擎开关、认证、SSE 兼容映射、取消/游标（先 mock runtime，再真实） |
| B1 | `src/modules/dsh_runs/{index.ts,data/entities.ts,services/*,migrations/*}` | binding/run/event 表、幂等键、游标、结果、恢复 |
| C1 | `src/lib/dsh/runtime/tool-bridge.ts` + `src/app/api/internal/dsh-tools/*` | run token 校验、逐调用 RBAC/写入前校验 |
| D1 | `vendor/dsh/crm-profile.patch.yml`（或 `src/lib/dsh/profile.ts` 生成） | 仅挂 CRM 工具与模型，禁用 shell/文件写；per-employee DSH_HOME |
| E | M4/M5/M8 验收脚本与证据 | 撤权/隔离/获客审核/试用 |

## 4. 验收映射（A–E）

- A：正式路由在 `OM_AI_ENGINE=dsh` 下实际 spawn DSH 并完成一轮 prompt；同一 commit 代码路径 + 运行证据。
- B：run/幂等/游标/结果落库；重启恢复、超时、取消、重复请求、并发冲突、SSE 断线重连用例。
- C：两真实测试员工的会话/文件/记忆/产物/浏览器/凭据隔离；撤权后 ≤10s 终止且写前拒绝。
- D：工具桥复用 `crm.find_companies` 与既有授权，员工/团队/组织范围核对；真实闭环；mock 与真实模型分别报告。
- E：M4 对抗、M5 获客审核/去重/幂等入库、M8 试用验收；M6/M7 另批。

## 5. 分步发布顺序

1. A1 运行时客户端 + A2 路由骨架（mock runtime，flag 默认 opencode）→ 单测/typecheck，不切换。
2. B1 持久化（迁移草案不应用）→ 路由接持久化 + SSE 重连。
3. 固定版本 dsh 依赖 + CRM profile → mock 模型端到端 → 再真实模型（已获准配置）。
4. C/D 工具桥与逐调用鉴权 → 员工绑定 → 两员工隔离/撤权证据。
5. 切换 `OM_AI_ENGINE=dsh` 灰度 → 正式入口实测 → 保留白名单回退。
