# 子审计 B · 授权链与 AI 扩展面（原文归档）

> 只读审计，未改任何文件。源码为真实 TS（core / ai-assistant 随包发 `src/`），行号可核对。

## (a) 授权链（服务端）

```
Request
 └─ src/app/api/[...slug]/route.ts:153 checkAuthorization
     ├─ resolveAuthFromRequestDetailed   shared/src/lib/auth/server.ts:396
     │   ├─ trusted envelope shortcut    server.ts:398-403   ← 跳过 MFA 与 session 撤销检查
     │   ├─ cookie auth_token / Bearer   server.ts:408-417
     │   ├─ verifyJwt + MFA-pending gate server.ts:419-428
     │   └─ resolveCanonicalStaffAuthContext  auth/lib/sessionIntegrity.ts:29
     │       ├─ session 必须存在/自持/未过期   :92-98
     │       ├─ 回读 users 行，tenantId/orgId 以 DB 为准  :85-107
     │       └─ roles + superadmin 来自 user_roles/user_acls/role_acls :131-146
     ├─ applySuperAdminScope(om_selected_tenant / om_selected_org)  server.ts:157-190
     ├─ requireAuth !== false → 401   route.ts:157-160（默认 fail-closed）
     ├─ 每个 ?tenantId 候选 → enforceTenantSelection route.ts:185-206；auth/lib/tenantAccess.ts:71
     └─ requireFeatures → RbacService.userHasAllFeatures → 403  route.ts:210-255
         organizationId 来自 resolveFeatureCheckContext  directory/utils/organizationScope.ts:553
```

**关键不变量**：JWT 里的 tenant/org 从不是权威，一律被 DB 用户行覆盖（`sessionIntegrity.ts:104-110` 不匹配即返回 null）。未知 scope = null，下游拒绝而不是放宽。

## (b) 能力 → 现有 → 决策

| 能力 | 现有 API / 表 | 决策 |
|---|---|---|
| 当前用户 | `getAuthFromRequest` server.ts:479 | 原样复用 |
| 会话撤销/MFA | sessionIntegrity.ts:29 | 复用 |
| tenant/org 派生 | `users.tenant_id/organization_id`；resolveOrganizationScope :259 | 复用；绝不信任 payload |
| 员工↔登录 | `staff_team_members.user_id` staff/data/entities.ts:97；getStaffMemberByUserId | 复用 |
| 组织树 | `organizations`（parent/ancestor/descendant）directory/data/entities.ts:28 | 复用 |
| 角色 vs 权限 | roles/user_roles/role_acls/user_acls；RbacService.loadAcl :440 | 复用；只认 features |
| 「U 在 O 有 F 吗」 | `RbacService.userHasAllFeatures(sub,F,{tenantId,organizationId})` rbacService.ts:911 | 原样复用 |
| 路由门 | `metadata.requireFeatures` + dispatcher | 复用 |
| 记录级 scope | resolveFeatureCheckContext + crud factory org filter | 复用 |
| agent 定义 | `ai-agents.ts` + registry agent-registry.ts:282 | 复用（新增 app agent） |
| tool 注册 | `ai-tools.ts` → toolRegistry.ts:14 | 复用 |
| tool 鉴权 | agent-tools.ts:331,353 → agent-policy.ts:157 | 复用 |
| 从 tool 复用路由 | ai-api-operation-runner.ts:296-315 | 包装（逐次重鉴权） |
| run/session | ai_chat_conversations(owner_user_id)、ai_chat_messages | 复用 |
| 用量账本 | ai_token_usage_events / _daily；事件 `ai.token_usage.recorded` | 复用 + 补硬配额 |
| 审批 | ai_pending_actions + `ai.action.confirmed` | 复用 |
| 发送 | messages / message_confirmations + communication_channels | 复用 |
| 发送身份门 | outbound-bridge.ts:167-190（sender 必须拥有 channel.user_id） | 作为模型复用 |
| 抑制列表 | 无（只有 notification_preferences） | **新建** |
| Bot 绑定 | communication_channels.user_id（按用户建渠道） | 包装 |
| 能力策略版本 | ai_agent_mutation_policy_overrides（单值、无版本） | **新建** |
| 扩展缝 | module-override:`ai.agents/ai.tools/ai.extensions`；UMES 扩展 11 个 ai_assistant 实体；7 个事件；DI | 复用，不 fork |

真实用法两处：`customers/api/entity-roles-factory.ts:113`、`audit_logs/api/audit-logs/actions/undo/route.ts:76`（都用 `userHasAllFeatures`），外加 dispatcher `route.ts:221`。

## (c) 八个安全缺口（M4 必须逐条有证据）

| # | 缺口 | 证据 |
|---|---|---|
| G1 | **trusted envelope 短路安全** | server.ts:81-86 明确写 envelope 跳过 MFA-pending 与 session 撤销；AI runner 自己造了一个（ai-api-operation-runner.ts:111-130，:315 挂上）。任何用客户端数据造 envelope 的新调用点都会复活 MFA 绕过 |
| G2 | **AI 工具调用不复跑路由 RBAC** | runner 直接调 handler（:315-320），授权只靠静态超集断言 `tool.requiredFeatures ⊇ route.requireFeatures`（:306-314）；漂移在树里已有记录：tool-test-fixtures.ts:116 注明 `catalog.list_offers` 覆盖不住 `GET /catalog/offers` 的门 |
| G3 | **AI 权限检查漏掉组织白名单维度** | `hasRequiredFeatures`（ai_assistant/lib/auth.ts:134-145）调 `authorizeFeatures` 不传 `scopeAllowed`，而 `userHasAllFeatures`（rbacService.ts:917-921）会校验 `acl.organizations.includes(scope.organizationId)`。agent/tool 门只看 feature |
| G4 | **同一请求两种 org 上下文** | dispatcher 用 resolveFeatureCheckContext（选中 org），AI chat/confirm 用 `acl.loadAcl({tenantId, organizationId: auth.orgId})`（chat/route.ts:469-482；confirm/route.ts:126-130）。组织级授权可能过一门、挂另一门 |
| G5 | **超管 scope 来自未签名 cookie** | `om_selected_tenant` / `om_selected_org`（server.ts:16-17,130-190），含 `__all__` 哨兵（:140-152）。设计如此，但助手不得继承可切换 scope |
| G6 | **MCP dev 路径可造无 userId 的 superadmin** | mcp-server.ts:56-96 `allowUnauthenticatedSuperadmin` |
| G7 | **无「按租户的 agent 白名单」** | 注册表是全局代码，只有 mutation-policy/prompt/runtime 可按租户覆盖；`POST /api/ai/chat` 只要 `ai_assistant.view`（chat/route.ts:181），任何调用者可指定任意已注册 agent |
| G8 | **工具上下文是可变的扁平快照** | types.ts:8-29 的 userFeatures 无签名 principal；子运行（workflows ai-draft-runner、in-process-client.ts:68-75）可原样转发身份与 features |

**可抄的既有正确做法**：`staff/ai-tools/types.ts:37-54` 拒绝模型传入 staffMemberId，一律由 `ctx.userId` 解析；`workflows` 用 provisioned execution principal（definition-grant.ts:199-213，fail closed）。这正是「模型不能选择操作者」的姿态。

## (d) 五个必须定契约的问题

1. 助手以**员工本人**身份执行（按用户凭据，像 per-user channel），还是以**按策略版本 provision 的执行主体**执行（像 workflows）？这决定绑定键。
2. 每次工具调用**重跑路由的 authorize**，还是维持「静态 requiredFeatures 超集 + 漂移测试」？
3. 一轮对话的权威 org 是账号 org（auth.orgId）还是选中 org（om_selected_org）？采用后者会改变 G4。
4. 配额只复用每日 token 汇总，还是加**按员工账本 + 发送前硬拦截**？
5. 抑制范围（员工/渠道/租户）与落地位置（app 模块 or messages 的 UMES 扩展）？现在没有表。

---

## 主 Agent 勘误（2026-11-08，逐行复核后）

**G7 的表述过强，就地更正**：原文写「任何调用者可指定任意已注册 agent」。实际代码是：

- `agent-policy.ts:170-176`：`checkAgentPolicy` 对 `agent.requiredFeatures` 调 `hasRequiredFeatures`，不满足即 `agent_features_denied`；
- `agent-policy.ts:190-206`：工具必须在该 agent 的 `allowedTools` 白名单内（`tool_not_whitelisted`），且用户必须持有 `tool.requiredFeatures`（`tool_features_denied`）；
- 生产调用点：`agent-tools.ts:331`（agent 门）、`:353`（逐工具门）、`api/ai/chat/route.ts:469`。

所以真正缺的是「租户/组织级可选 agent 集合」，而不是「没有 agent 级鉴权」。

**由此产生一个更重要的结论**：`hasRequiredFeatures`（无 `scopeAllowed`）同时被 agent 门、tool 门、以及 `ai-api-operation-runner.ts:296-314` 的 tool→route 超集断言调用。**改这一处，三条门同时补上组织白名单维度**——G3 是八条里性价比最高的一条。
