# M4 计划 · 双员工安全 PoC

> 目的：**证明隔离与撤权是真的**，不是证明功能好用。任一条失败 → M4 不通过，业务不开放（目标原文：失败不得进入业务开放）。
>
> 当前状态：计划。未创建员工、未建绑定、未改任何权限。执行前需要用户批准「关工具路线」或「上游改动路线」。

## 1. 两条路线（先选一条）

| | A 关工具（默认，应用内可做） | B 改上游（需另行批准） |
|---|---|---|
| 做法 | `aiToolOverrides` 把**所有变更类**工具替换为抛错；`aiAgentExtensions.deleteAllowedTools` 移除其名；只留只读工具 | runner 工厂进 DI + `registerAiToolExecutionGuard(onBeforeExecute)` + 合成请求打 `x-om-ai-origin` 头 |
| 关闭的缺口 | G2（硬阻塞）、G1 的一部分（无写操作可演示） | G2、G1、G8 全部 |
| 代价 | 助手不能写 CRM；候选入库改由员工本人会话执行 | 动 framework 包，走 mirror/vendor，承担上游合并成本 |
| 批准 | 不需要（不改框架、不改 DB 结构） | **需要** |
| 回滚 | 删 `ai-tools.ts` 里的覆盖即可 | 回退 vendor 文件 + manifest 条目 |

**未选定前不执行任何写操作演示。**

## 2. 参与实体

| 实体 | 取值 | 说明 |
|---|---|---|
| 员工 A | `employee@acme.com`（现有） | 归属 Acme Corp，功能点 117 |
| 员工 B | 需新建或复用 admin | 必须与 A **不同组织归属或不同角色**，否则隔离测试无意义 |
| 助手 1 | `crm.lead_researcher`（只读工具集） | 绑定 A |
| 助手 2 | `crm.lead_researcher` 的另一绑定 | 绑定 B，独立 DSH profile |
| CRM 只读工具 | 一个：读公司详情（`customers.companies.view`） | PoC 只暴露这一个 |

创建员工/绑定属于数据写入，不是迁移；但仍需在 PoC 文档里逐条列出，不静默创建。

## 3. 隔离矩阵（7 维，每条都要证据）

| # | 维度 | 测试 | 通过判据 | 证据 |
|---|---|---|---|---|
| 1 | 会话 | A 的 cookie 换到 B 的浏览器上下文 | 401/重定向登录，且无 B 的数据 | 两个上下文的状态码 + 截图 |
| 2 | 订阅/任务 | A 用 B 的 runId 调 `/api/ai/chat` 或事件接口 | **404**（不是 403） | 状态码矩阵 CSV |
| 3 | 文件 | 列出 A 的 DSH 产物目录，grep B 的标识 | 0 命中 | 目录清单 + grep 输出。**落盘层已证（47 轮）**：产物目录按 profile key 分开建，0700；换 OS 用户读对方目录得 Permission denied |
| 4 | 记忆 | A 的助手检索 B 的历史 | 空结果 + 一条审计行 | 检索响应 + 审计行 |
| 5 | 凭据 | A 的助手尝试用 B 的渠道发送 | 发送身份门拦截（`outbound-bridge.ts`）。**2026-11-08 修复**：拒绝时不再静默 return，改为写结构化日志 `outbound_bridge.ownership_rejected`（含 messageId/channelId/senderUserId/channelOwnerUserId，不含正文与地址）。**2026-11-08 第二轮**：同时写 `action_logs` 审计行（`commandId=communication_channels.outbound_blocked`，含 `resourceKind/Id`、`actorUserId`、`context.reason`），走 `actionLogService`；审计失败降级为日志，不阻断事件。`userId=null` 的租户级渠道仍放行任意 sender（D8 策略待定） | 发送尝试的日志行 + 渠道消息计数不变 |
| 6 | 浏览器状态 | 两个 profile 的 cookies/localStorage | 互不包含对方域内会话 | 两段导出对比。**派生+落盘层已证（46/47 轮）**：两个真实员工的四个根目录不重叠、路径不含对方 userId、换策略版本记忆重新分区；目录实建为 0700、元数据 0600，跨 OS 用户读被拒（带同一棵树里的 0644 阳性对照）；**DSH 运行时是否按此隔离仍未验** |
| 7 | 插件权限 | 每用户能力 / 实例全局 / 高权限三类各一个样本 | 高权限插件只对授权员工可见；共享实例不可信则隔离 | 三类清单 + 可见性矩阵 |

**分类已落成可执行的定义（第 55 轮）**：`src/lib/dsh/tool-policy.ts`，判据来自注册表元数据而不是人工贴标签。

| 类 | 判据 | 现在的实况（注册表 94 + 平台内置 3 = **97 个**） |
|---|---|---|
| `high_privilege` | `isDestructive` / `isBulk` / **没有任何 `requiredFeatures`**（任何登录用户都能调）/ 平台内置且**能写** | **4 个**：3 个 `catalog.*` 批量工具 + **`execute`** |
| `instance_global` | 在 `appendix/tool-policy.json` 里显式声明（作用不限于调用者本人） | 0 个 |
| `per_user` | 其余 | 93 个 |

**为什么把平台内置工具也纳入（第 57 轮）**：模块注册表只有 94 个，运行时有 **97** 个——差的三个是 `context_whoami` / `search` / `execute`。其中 `execute` 是在 `node:vm` 沙箱里跑 JS 调**任意已登记 API**，单次最多 50 次调用、其中 20 次可以是写操作。它不在注册表里，所以原来的门根本没看见它：**分类了 94 个、声称覆盖，实际漏掉的是权力最大的那个。**

现在门做两件事：
1. `platformTools` 必须逐个声明；**能写的工具声明成 `per_user` 直接红**（功能点决定"能写哪些"，不决定"是否跨员工"）。
2. 拿线上 `/api/ai_assistant/tools` 的清单核对：**线上有、清单里没有 → 红并点名**。负向对照实测：从声明里删掉 `execute` → `FAIL live-vs-inventory 线上有未分类工具：execute`、exit 1。

- 高权限类**由注册表算出、不可声明**：新加一个批量工具会自动变成高权限，门 `crm-tool-policy-check.ts` 会红到有人按名字认领并写下理由为止。
- 声明与注册表**双向核对**：声明了不存在的 → 红；该认领的没认领 → 红；写操作被声明成 `instance_global` → 红。
- `mayRunTool({ instanceMode })` 把 §7 那句"共享实例不可信则隔离"变成判定：高权限工具在 `shared` 实例一律拒（`high_privilege_requires_isolation`），`instance_global` 两种实例都拒（归运维，不归租户）。
- **未证**：运行时是否真的按这个判定拒。函数有单测，接进 ai-assistant 运行时属于 DSH 桥接，尚不存在。

## 4. 对抗用例（每条 = 攻击 → 期望 → 产物）

| # | 攻击 | 期望 | 产物 |
|---|---|---|---|
| 1 | 猜 ID 跨员工取 candidate/run/artifact | **404** | 状态码矩阵 |
| 2 | 绕过 UI 直调写接口 + body 注入 `tenantId/organizationId` | 服务端拒绝；注入字段不生效 | 原始请求/响应 + 落库 scope |
| 3 | 模型伪造 acting user（`actorUserId`/`onBehalfOfUserId`） | 不采信；审计分别记真实 actor 与 on-behalf-of | 审计两列原文 |
| 4 | 子 Agent 提权 | 工具集 = 交集 | **派生层已证（46 轮）**：`scripts/crm-dsh-profile-check.ts` 用真实工具清单证明子请求只能在父集内收窄、越界请求被丢弃、父集缺失时告警点名；**运行时子 agent 仍 blocked**（`dsh-profile-per-employee` 不存在） |
| 5 | 撤权影响在飞任务 | ≤10s 停止；**不完成** CRM 写入 | 撤销时间戳 + 终止日志 + CRM 行数 0 |
| 6 | 配额绕过：超额度创建 Run | 429 | 原始响应 |
| 7 | 审批令牌复用发别的草稿 | 4xx（令牌与草稿 hash 绑定） | 复用拒绝原文 |

## 5. 撤权时序（必须按序演示）

```
T+0s   收回 A 的 leadgen.candidates.review（或直接 revoke 绑定）
T+0..10s  在途 Run 收到 principal.revoked → 停止调度
T+10s  A 的工具调用 → 403 agent_features_denied / tool_features_denied
T+10s  A 试图完成候选入库 → 拒绝（绑定非 active）
T+30s  审计行可查到：撤销时间、受影响 Run、被拒调用
```

## 6. 通过判据

- 7 维隔离 + 7 条对抗：**全部通过**，任何一条失败即 M4 失败。
- 失败时不得用「按钮隐藏」「前端拦截」当替代；必须服务端拒绝。
- 证据落在 `docs/crm-platform/poc/<date>/`：状态码矩阵、审计行、目录清单、工具清单 diff。

## 7. 与 DSH 的关系

- 每员工独立 profile 与数据目录（同机即可），验证后再谈共享实例降本。
- DSH 只执行；身份、权限、业务数据以 CRM 为准（见 `03-dsh-contract.md`）。
- 助手工具集由 CRM 侧配置决定，DSH 侧不得自行扩集。

## 7.5 已有基线（2026-11-08）

`node scripts/crm-security-probe.mjs` 已跑通 14 例、14 符合预期、**零写入**（5 张表前后一致；脚本现在会在不符合或写入时 exit 1）。覆盖：匿名 401、租户注入 403、组织注入结果集不变、写操作三种拒绝、删除随机 id 404、审计日志自限、未知 agent 404。

覆盖不到的：跨组织（只有 1 个组织）、DSH 跨员工、AI 工具越权（G2）、撤权在飞任务 —— 这四项正是 M4 的执行主体，见 `poc/README.md`。

**对抗用例执行器已就绪**：`node scripts/crm-m4-harness.mjs`。7 条用例中 3 条现在可跑（猜 ID、直连写+注入、伪造身份），4 条因缺 fixture 标为 blocked；缺 fixture 的**不计入验收**。

顺带确认两条对 M5 有影响的事实：
1. **CRM 写入需要组织上下文**：`POST /api/customers/companies` 无组织时 400「需要组织上下文」，不是校验失败。候选入库必须带解析后的 org，否则写不进去。
2. **审计日志按 ACL 自限**：员工塞 `canViewTenant=true` 也返回本人范围（`canViewTenant:false`）。

## 8. 本轮不做

不创建员工、不建绑定、不改 ACL、不写 PoC 代码、不做任何外发。等路线选定后按本计划执行。

## 用例 #3.1 解阻（2026-11-09）

`模型伪造操作者` 一直卡在"缺一个能报出运行时解析身份的探针工具"。这个工具本来就有：ai-assistant 包里的 `context_whoami`。现在 harness 从 `/api/ai_assistant/tools` 的运行时工具表里发现它，然后对比两次调用：

| 调用 | 结果 |
|---|---|
| `context_whoami {}` | `userId = 7a176d46…`（employee 的真实 id） |
| `context_whoami {actorUserId: …001, userId: …002, onBehalfOfUserId: …003}` | 同一个 `7a176d46…`，三个注入值全部无效 |

判为 **pass-weak** 而不是 pass：它证明的是"运行时忽略注入字段"，还没有证明审计行里记录的就是真实 actor——后者要等 leadgen 有写入路径（迁移未批）才能复核。

**判定本身验过会红**：把 judge 改成"期望解析结果等于伪造值"，用例立刻 `FAIL`、exit 1；改回后恢复 pass-weak。
