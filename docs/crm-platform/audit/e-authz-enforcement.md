# 子审计 E · 安全缺口的最小强制点（原文归档）

> 只读；未改任何文件、未重启服务。包目录是 `node_modules/@open-mercato/ai-assistant/...`（连字符）。

## 1. 逐条证据（主 Agent 已复核 G1/G2/G3/G7 的关键片段）

| 缺口 | 位置 | 证据 |
|---|---|---|
| G3 | `ai_assistant/lib/auth.ts:140-144` | `void rbacService` → `return authorizeFeatures(requiredFeatures ?? [], { grantedFeatures, unrestricted })`，`rbacService` 收下就丢 |
| **G3 为何是 fail-open** | `shared/security/featurePolicy.ts:38` | `if (subject.scopeAllowed === false) return false` —— 不传时是 `undefined`，**不等于 false**，于是放行 |
| G3 参照实现 | `core/auth/services/rbacService.ts:911-924` | 算出 `organizationAllowed` 后传 `scopeAllowed` |
| G2 | `ai-api-operation-runner.ts:306-313` | 仅静态超集：`if (routeFeatures.length && !hasAllFeatures(toolFeatures, routeFeatures)) 403` |
| G2 直调 | 同上 `:315-319` | `attachTrustedAuthContext(...)` → `await handler(syntheticRequest, ...)` |
| **G2 绕过确实到数据层** | `shared/lib/crud/factory.ts` | `requireFeatures` 在 `:160-162` 只是**声明**，CRUD 工厂自己不执行 |
| G1 | `ai-api-operation-runner.ts:111-133` | 自造 `{ sub, userId, tenantId, orgId, roles: [], isSuperAdmin }` + `status:'authenticated'` |
| G1 短路点 | `shared/lib/auth/server.ts:396-404` | 读到 trusted context 就 return，**早于** MFA 门 `:422` 与会话撤销 `resolveCanonicalInteractiveAuthContext :431` |
| G4 | `api/ai/chat/route.ts:464-467, 680` | `loadAcl(..., { organizationId: auth.orgId })` 用原始 org；dispatcher 用 `resolveFeatureCheckContext`（`organizationScope.ts:553,629-638`，会收窄甚至返回 null） |
| G7 | `chat/route.ts:180-181` | `requireFeatures: ['ai_assistant.view']` |
| G7 注册表 | `agent-registry.ts` | 零 `tenant` 引用，进程级全局 |
| G8 | `types.ts:8-22`、`tool-executor.ts:86`、`agent-tools.ts:152-167,282-286`、`pending-action-executor.ts:301-302` | 上下文扁平可变，`userFeatures` 数组按引用共享；子运行/原子通道原样转发 |

G3 的可达面：**7 处调用点全部走同一个 helper** —— `tool-executor.ts:45`、`agent-policy.ts:178`(agent) 与 `:208`(tool)、`pending-action-recheck.ts:143`、`mcp-server.ts:123`、`mcp-dev-server.ts:80`、`in-process-client.ts:135,158`。受影响工具：38 个 `defineApiBackedAiTool`（经 `api-backed-tool.ts:64` 进 runner）。

## 2. 拦截缝的结论：**不存在**

| 候选缝 | 签名/位置 | 实际能力 | 为什么不够 |
|---|---|---|---|
| `aiToolOverrides` | `Record<string, AiToolDefinition \| null>`，`src/modules/<id>/ai-tools.ts` 或 `overrides.ai.tools` | **替换**同名工具 | 拿不到原实现，必须枚举全部 38 个，无法通用拦截 |
| `ApiInterceptor` | `{ id, targetRoute, methods, features?, priority?, timeoutMs?, before?, after? }`（`shared/lib/crud/api-interceptor.ts:47-60`） | 真前置门，但只在 `makeCrudRoute` 工厂内执行（`factory.ts:1422`） | 自定义路由拿不到 `before`；且 runner 构造的 `Headers` 是空的（`runner.ts:248`），**无法区分 AI 与人类流量** |
| `overrides.di` | `src/modules.ts` | 真 DI 替换 | `createAiApiOperationRunner` 是**直接 import**（`api-backed-tool.ts:64`），不在 DI 里 |
| Next middleware / route handler | — | — | runner 在进程内构造合成 Request 直接调 handler，中间件不跑 |

**最小上游改动（仅建议，未实施）**：把 runner 工厂注册进 DI，并在 `api-backed-tool.ts:64` 用 `container.resolve`；再加一个 `registerAiToolExecutionGuard({ onBeforeExecute })` 在 `tool-executor.ts:45` 与 `runner.ts:315` 前置，同时给合成请求打 `x-om-ai-origin` 头，让 `ApiInterceptor` 能区分 AI 流量。

## 3. 每条缺口的强制点与 M4 判定

| 缺口 | 应用层最小强制 | 验证用例 | 阻塞 M4？ |
|---|---|---|---|
| **G1** | 应用层无法关闭。缓解：`overrides.ai.agents` 把 agent 设 `mutationPolicy:'read-only'`；PoC 不启用 MFA | 执行一次工具变更 → 撤销会话 → 用旧 cookie 再 POST `/api/ai/chat`，**期望 401**（今天 200 且工具照跑） | 否（策略可缓解）；**一旦演示「撤权即时生效」就成为阻塞** |
| **G2** | 无包装缝。硬处置：用 `aiToolOverrides` 把所有**变更类**工具替换为抛错 + `aiAgentExtensions.deleteAllowedTools` 删除变更工具名；只留只读 | 造一个 `requiredFeatures:['X.view']` 的工具打 `POST /api/<mutation>`（路由要 `X.edit`），用只有 X.view 的用户跑，**期望 403，今天 200** | **是 —— 唯一的硬阻塞** |
| **G3** | 需上游一行为之（`auth.ts:141-144` 传 `scopeAllowed`）。PoC 单组织时 `scopeAllowed=true`，无差异 | 用户属 org A，ACL 只允许 org B，调用需要组织范围的工具，**期望 403（今天 200）** | 否（单组织 PoC 天然满足） |
| **G4** | 策略：PoC 一租户一组织。多组织时无应用层解法 | 同一用户在 dispatcher `feature-check` 得 403，而 AI chat 返回 200 | 否（单组织不受影响） |
| **G7** | 无门。策略：单租户 + 用 `overrides.ai.agents` 收窄 `allowedTools`；必要时 `overrides.routes.api: {'POST /api/ai/chat': null}` 直接关掉 | 另一租户用户带 `ai_assistant.view` 指定别家 agent，**期望 404/403（今天 200）** | 否（双员工同租户） |
| **G8** | 策略：PoC 不接第三方工具（38 个都是一方、不改 ctx）。加固：override 里 `Object.freeze` 上下文 | 注册一个把 `ctx.userFeatures.push('*')` 的测试工具，随后调受控工具，**期望 403（今天 200）** | 否（策略可缓解） |

**M4 结论**：六条里五条在「双员工 / 单租户 / 单组织 / 无 MFA」的 PoC 前提下可被策略缓解；**只有 G2 是硬阻塞**——要么用 `aiToolOverrides` 关掉全部 AI 变更工具，要么先拿到上游 guard/DI 改动，否则 PoC 不能演示写操作。G1 只有在演示「会话撤销」时才升级为阻塞。
