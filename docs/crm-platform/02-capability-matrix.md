# M2 契约（一）· 能力矩阵与执行权限

> 目标原文：**执行权限 = 员工当前授权 ∩ 公司限制 ∩ 助手上限 ∩ 任务限制 ∩ 渠道限制**；默认拒绝；可信身份由后端注入；模型不能选择操作者；服务端逐次鉴权。
>
> 本文只写**已被代码证据支持**的结论。子审计 B 的结论中，G1/G2/G3 由主 Agent 亲自复核（下附行号）；其余标注「来源：子审计 B，未逐行复核」。

## 1. 五个约束因子各自落在哪

| 因子 | 现有承载 | 代码位置 | 今天在 AI 面上是否真的生效 |
|---|---|---|---|
| 员工当前授权 | `grantedFeatures` → `authorizeFeatures` | `ai_assistant/lib/auth.ts:134-145` | **部分**：只看 features，**丢了组织白名单**（G3） |
| 公司限制 | `acl.organizations` 白名单 + 租户开关 | `auth/services/rbacService.ts:911-926`（HTTP 路由走这条） | **否**：AI 面不复用这条路径 |
| 助手上限 | agent 定义 + `requiredFeatures`/`allowedTools` | `ai-agents.ts` → `registry agent-registry.ts:282`；`agent-tools.ts:331,353` → `agent-policy.ts:157` | **部分**：`checkAgentPolicy` 执行 agent 级策略，但工具→路由的授权是静态超集断言（G2） |
| 任务限制 | 工具调用的 `ctx`（tenant/org/userFeatures/isSuperAdmin） | `agent-tools.ts:118-123,158-163` | **弱**：扁平可变快照，子运行可原样转发（G8） |
| 渠道限制 | `communication_channels.user_id`（按用户建渠道）+ 发送身份门 | 子审计 C：`outbound-bridge.ts:167-190`（sender 必须拥有该 channel） | **是**（这是目前最像样的一个因子，可作为模板） |

**结论**：五因子里，只有「渠道限制」今天真的在做隔离；「公司限制」「任务限制」在 AI 面上是缺的，「员工授权」缺一个维度。所以 **M4 之前必须先补 G2/G3**，否则「助手权限不超过员工」这句话没有证据。

## 2. 身份与执行模型（三选一，推荐 A）

| 方案 | 含义 | 优点 | 代价 |
|---|---|---|---|
| **A（推荐）以员工身份执行 + 每次调用重鉴权** | 工具调用带后端注入的 principal（userId/tenant/org + 策略版本），每次调用前用 `rbacService.userHasAllFeatures` 重算，再执行 | 与 HTTP 路由同一条授权路径，不会漂移；撤权天然立刻生效 | 每调用一次 ACL 读取（可缓存，但要带版本失效） |
| B provisioned 执行主体（workflows 模式） | 按策略版本 provision 一个执行主体，权限取自策略而非用户 | 与既有 `definition-grant.ts:199-213` 一致 | 撤权需要额外失效机制；「员工当前授权」变成快照 → 违反目标原文 |
| C 把 features 快照塞进工具 ctx（现状） | 沿用 `userFeatures[]` 扁平快照 | 零改造 | G3/G8 无法关闭；模型或子运行可转发 |

选 A 的理由不是偏好，而是目标原文写死了「员工**当前**有效权限」——快照方案在语义上就不满足。

**身份注入规则（不可协商）**：
1. principal 只由服务端信任链产生（`resolveAuthFromRequestDetailed` → `sessionIntegrity` 用 DB 行覆盖 JWT 的 tenant/org）。
2. 模型可见的参数里**不得**出现 actorUserId / onBehalfOfUserId / tenantId / organizationId；出现即忽略并记审计。
3. 工具执行时用 principal 重新过 `userHasAllFeatures(required, {tenantId, organizationId})`，**包含组织白名单维度**。
4. 子 Agent / 子运行继承父 principal，但每次调用重新鉴权；父无权 → 子无权（交集，不是并集）。

## 3. 能力矩阵：复用 / 包装 / 新建

| 能力 | 现有 | 决策 | 依据 |
|---|---|---|---|
| 当前用户、会话、MFA | `getAuthFromRequest` `shared/lib/auth/server.ts:479` | 复用 | 已复核（B） |
| tenant/org 派生 | `sessionIntegrity.ts:85-110` 用 DB 覆盖 JWT | 复用，**禁止**从 body 取 | 已复核（B） |
| 功能点判定 | `rbacService.userHasAllFeatures(userId, required, {tenantId, organizationId})` | **AI 面改为复用这一条** | 已复核：它带 `scopeAllowed`（:911-926） |
| 组织白名单 | `acl.organizations` / `__all__` | 复用 | 已复核 |
| 员工↔登录 | `staff_team_members.user_id` | 复用 | B |
| agent 定义/注册 | `ai-agents.ts` + registry | 复用（新增 app agent） | B |
| 工具注册 | `ai-tools.ts` → toolRegistry | 复用 | B |
| 工具→路由 | `ai-api-operation-runner.ts:296-320` 静态超集 + 直调 handler | **包装：调用前重鉴权** | 已复核（G2） |
| 运行记录 | `ai_chat_conversations` / `ai_chat_messages` | 复用 + 补 Run/Artifact 语义 | B |
| 待审批动作 | `ai_pending_actions`（含 `idempotency_key`/`expires_at`/`resolved_by_user_id`） | 复用 | 已复核 schema |
| 用量账本 | `ai_token_usage_events` / `_daily` | 复用；**配额要新建** | C |
| 发送 | `messages` / `message_confirmations` / `communication_channels` | 复用 | C |
| 发送身份门 | `outbound-bridge.ts:167-190` | **作为「渠道限制」的模板复用** | C |
| 抑制/退信/投诉 | 无 | 新建 | C |
| 候选/证据/验证 | 无 | 新建（app 模块） | C |
| 配额预留 | 只有 `attachment_quota_reservations` | 新建（照抄其 lease 模式） | C |
| 插件授权分类 | 无按用户分类 | 新建（每用户能力/实例全局/高权限） | 目标 M4 |

## 4. 八个缺口 → 处置（M4 门禁用）

| # | 缺口 | 阻塞 M4？ | 处置（按子审计 E 的复核，PoC 前提＝双员工/单租户/单组织/无 MFA） |
|---|---|---|---|
| G1 | trusted envelope 短路 MFA/会话撤销 | 否（策略）；**演示会话撤销时升级为是** | 应用层关不掉：PoC 用 `mutationPolicy:'read-only'`，不演示撤销；要演示就先做上游 guard |
| G2 | 工具调用不复跑路由 RBAC | **是（唯一硬阻塞）** | 无包装缝：用 `aiToolOverrides` 把变更类工具替换为抛错 + `deleteAllowedTools` 删除其名，PoC 只留只读 |
| G3 | AI 面丢组织白名单（**fail-open**：`featurePolicy.ts:38` 只认 `=== false`） | 否（单组织天然满足） | 一处修复覆盖 7 个调用点；需上游一行 |
| G4 | 两条 org 上下文 | 否（单组织） | 策略：PoC 一租户一组织 |
| G5 | 超管 scope 来自未签名 cookie | 否 | Run 显式拒绝 `__all__` |
| G6 | MCP dev 可造无 userId superadmin | 是（仅 dev） | 生产禁 `allowUnauthenticatedSuperadmin` + 启动断言 |
| G7 | 无租户级 agent 白名单 | 否（同租户） | 收窄 `allowedTools`；必要时关掉 `/api/ai/chat` |
| G8 | 工具上下文扁平可变 | 否 | 不接第三方工具；加固用 `Object.freeze` |

**没有拦截缝这件事本身就是结论**（E 复核）：`aiToolOverrides` 只能替换不能包装；`ApiInterceptor` 只在 `makeCrudRoute` 内生效且 runner 构造的请求头是空的，无法区分 AI 流量；runner 是直接 import，不走 DI；middleware 不跑。因此「在应用层给 AI 工具加一道鉴权」做不到，只能**关工具**或**改上游**。

每条的请求/期望/产物与「是否阻塞 M4」的完整论证见 `audit/e-authz-enforcement.md` §3。

## 5. 被业务决策阻塞的契约字段

| 待决 | 阻塞的契约字段 |
|---|---|
| D2 去重键 | 候选表的 `dedupe_key` 组成与唯一索引 |
| D3 可触达判定 | 候选/公司上的 `reachable` 与 `email_status` 语义 |
| D4 额度模型 | 配额账本的层级与预留粒度 |
| D5 审批分离 | 审批记录与「改动后重审」的字段 |
| D6 离职转交 | 绑定/任务的状态迁移分支 |
| D8 渠道 | 发送侧的 channel 绑定与域名认证字段 |

这些字段先按「建议默认」写进 `03-dsh-contract.md` 并标注 `[待确认]`，不写成既定事实。

## 6. 契约面计数（带凭证重拉，2026-11-08T18:14Z）

```
curl -b <cookie> http://127.0.0.1:3000/api/docs/openapi
→ 200, 11 252 219 bytes, info.version 0.9.0
paths 676 · operations 1149 · /sales/* 36 · /customers/* 56 · AI 相关 34
```

未带凭证时同一端点返回 `401 {"error":"unauthorized"}`——所以「拉不到契约」不是能力缺失，是鉴权在生效。这份计数是 M2 的契约基线，后续任何路由增删都要重拉并 diff。
