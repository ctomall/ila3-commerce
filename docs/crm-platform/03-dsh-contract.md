# M2 契约（二）· DSH 桥接与运行模型

> 定位：**CRM 是身份、权限和业务数据的权威源；DSH 只负责执行。** 助手权限不得超过员工当前有效权限（见 `02-capability-matrix.md` §2）。
>
> 本文是契约草案。标注 `[待确认]` 的字段依赖 `decisions.md` 的待决项，未经确认不写成实现依据。

## 1. 员工助手绑定

一条绑定 = 「谁（员工）× 用哪个助手 × 在什么能力版本下 × 在哪个组织范围内」。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | 绑定 id |
| `tenant_id` / `organization_id` | uuid | 服务端派生，永不接受客户端传值 |
| `employee_user_id` | uuid | 员工登录身份（`users.id`） |
| `staff_member_id` | uuid | `staff_team_members.id`，用于组织/部门归属 |
| `assistant_id` | text | agent 注册 id（如 `crm.lead_researcher`） |
| `capability_policy_version` | int | 能力策略版本；每次变更 +1，Run 固化当时版本 |
| `status` | enum | `active` / `suspended` / `revoked` |
| `revoked_reason` | text | 离职/审计/用户主动解绑 |
| `created_at` / `updated_at` | timestamptz | 记录版本字段，更新走 409 |

规则：
1. 一个员工同一时刻**最多一条 `active`** 绑定（部分唯一索引）。
2. 绑定不授予任何权限，只声明「这个员工可以用这个助手」；真正权限在每次工具调用时重算（§4）。
3. 策略版本变化 → 旧 Run 继续用完即止，**新 Run 必须用新版本**；不允许把旧版本 Run 延长。

## 2. 数据模型（候选/证据/验证/配额/审批/抑制/Bot）

详见 **`03a-data-model.md`**（候选/证据/验证、配额账本、审批→发送、绑定五组表 + 幂等键 + API 面 + UMES 用法 + 迁移约定）。要点：新模块 `leadgen`，表前缀 `leadgen_`，不改 core 迁移，跨模块只用标量 id；迁移生成到 `src/modules/leadgen/migrations/`，**应用需用户批准**。

## 3. Run / 事件 / 产物

### 3.1 状态机

```
queued → running → (completed | failed | cancelled | budget_exhausted)
running → awaiting_approval   # 候选已提交，等人工审核
```

- 状态迁移只允许服务端执行；客户端只能「请求取消」。
- `awaiting_approval` 不是终态，超时按 `expired` 处理并记审计。

### 3.2 事件

| 事件 | 方向 | 幂等键 | 说明 |
|---|---|---|---|
| `run.created` | CRM → DSH | `runId` | 携带 principal 引用、策略版本、预算 |
| `run.cancel` | CRM → DSH | `runId+cancelSeq` | DSH 必须在 `cancel_grace`（默认 10s）内停 |
| `run.event` | DSH → CRM | `runId+seq` | 单调递增 seq，重放按 seq 去重 |
| `candidate.submitted` | DSH → CRM | `runId+candidateKey` | 候选载荷只带证据引用，不带「已验证」结论 |
| `artifact.attached` | DSH → CRM | `artifactId` | 原始抓取物，带 sha256 |
| `principal.revoked` | CRM → DSH | `bindingId+version` | 撤权广播 |

### 3.3 重连与游标

- 每个 Run 一条单调 `seq`；客户端重连用 `since=<seq>` 拉增量。
- CRM 对 `seq` 有唯一约束（`run_id, seq`），重复投递返回**已存在**而不是重复写入。

### 3.4 超时预算

| 预算 | 默认 | 超时行为 |
|---|---|---|
| 单 Run 墙钟 | 15 min | 置 `budget_exhausted`，取消在途工具调用 |
| 单工具调用 | 60 s | 该调用失败，Run 可继续 |
| 单 Run 令牌 | 由配额账本决定 | 硬拦截，不再发起新调用 |

预算是**契约**不是建议：DSH 侧超时也必须主动上报，不能静默续命。

## 3.5 桥接的现实约束：没有拦截缝

子审计 E 复核后的硬事实（`audit/e-authz-enforcement.md`）：

| 想做的事 | 现有缝 | 结论 |
|---|---|---|
| 在应用层给每次 AI 工具调用加前置鉴权 | `aiToolOverrides` 只能**替换**工具，拿不到原实现 | 做不到通用拦截，只能枚举工具 |
| 用 `ApiInterceptor.before` 做门 | 在 `makeCrudRoute` 工厂内**确实会执行**（`shared/lib/crud/factory.ts`），`InterceptorContext` 带 userId/orgId/container，可按 `targetRoute` 重跑该路由的 `requireFeatures` | 能覆盖 CRUD 路由的鉴权；覆盖不到自定义路由，也**无法只对 AI 生效**（runner 自造空 Headers，无来源标记） |
| 用 `overrides.di` 替换 runner | runner 是直接 import（`api-backed-tool.ts:64`），不在 DI 里 | 不可替换 |
| Next middleware | runner 在进程内构造合成 Request 直调 handler | 不经过 |

**更正（独立 QA 复核后）**：早前写“不存在拦截缝”过头了。准确说法是：**CRUD 路由上存在零上游改动的 `before` 重鉴权缝**，缺的只是“识别这是 AI 调用”，所以无法只对 AI 生效。这意味着路线 A 不必只做“关工具”——也可以给工具会打到的那几条 CRUD 路由装 interceptor 做逐次重鉴权。

因此 M4 的处置有三条路，选一条并写清楚再开工（原两条 + 新增的 interceptor 方案）：

1. **关工具**（现在可做）：`aiToolOverrides` 把变更类工具替换为抛错 + `aiAgentExtensions.deleteAllowedTools` 移除其名，PoC 只暴露只读工具。代价：Agent 不能写 CRM，候选入库改由「人工审核后由员工自己的会话执行」。
2. **改上游**（需另行申请）：runner 工厂进 DI + `registerAiToolExecutionGuard(onBeforeExecute)` + 合成请求打 `x-om-ai-origin`。代价：动 framework 包，要走 mirror/vendor 流程并接受上游合并成本。

**在选定之前，M4 只能演示只读能力**；任何「助手代员工写数据」的演示都属于未关闭 G2 的越权路径。

## 4. 执行权限（逐次鉴权）

每次工具调用必须通过：

```
allowed = employee.hasNext(feature)            # 员工当前授权（含组织白名单）
       && company.allows(org, channel)          # 公司限制
       && assistant.allows(tool)                # 助手上限
       && run.scope.contains(target)            # 任务限制
       && channel.allows(send|read)             # 渠道限制
```

实现要求：
1. 用 `rbacService.userHasAllFeatures(principal.userId, required, {tenantId, organizationId})`，**不要**用扁平 `userFeatures[]` 快照（那是 G3/G8 的根源）。
2. 工具 → 路由的调用在 handler 前**再跑一次**路由声明的 `requireFeatures`（关闭 G2）。
3. 审计行同时记录：真实 actor、绑定 id、策略版本、Run id、工具名、判定结果。
4. 模型传入的任何身份字段（actorUserId/tenantId/organizationId）**一律忽略**并记一条 `identity_spoof_attempt`。

## 5. 隔离（M4 门禁）

| 维度 | 要求 | 证据形态 |
|---|---|---|
| 会话 | 每员工独立 DSH 会话目录，不共享 cookie | 目录清单 + 跨读失败原文 |
| 订阅/任务 | 任务归属绑定，跨员工查 id 返回 404（不是 403） | 状态码矩阵 |
| 文件 | 每 Run 独立产物目录，路径不含他人 id | 目录树 |
| 记忆 | 记忆按 (employee, assistant, policy version) 分区 | 检索越界返回空 + 审计 |
| 凭据 | 每员工自己的渠道凭据；不允许借用他人 channel | 发送身份门拒绝证据 |
| 浏览器状态 | 独立 profile，不共享 localStorage/cookies | profile 目录 + 交叉读取失败 |

**共享实例不可信就隔离**：先做每员工独立 profile（同机），验证隔离后再谈共享降本。隐藏按钮不算安全。

### 5.1 派生层已实现（第 46 轮），运行时层仍未验

`src/lib/dsh/profile.ts` 负责把一个员工派生成一个 profile：工具集 = 运行时报告的已授权工具 ∩ 助手上限 ∩ 调用方请求（外加 0 个），四个根目录（会话/产物/记忆/浏览器）由身份元组的 hash 唯一定出，撤权即清零。`scripts/crm-dsh-profile-check.ts` 是它的门：拿**真实**登录态下 `/api/ai_assistant/tools` 的清单当输入，逐条断言。

| 已证（派生层 + 落盘层） | 未证（运行时层） |
|---|---|
| 派生工具集与运行时报告逐个一致（employee 78、admin 97） | DSH 是否真的按这些根目录隔离 |
| 子请求只在父集内收窄；越界请求被丢弃并记原因；父集缺失时提权告警会点名（78 个全部点名） | 运行中的子 agent 是否无法触达 profile 之外的工具 |
| 两个真实员工的 key 不同、四个根目录无重叠、路径不含任一方 userId | 跨员工"记忆检索返回空"的检索层行为 |
| 目录真的被建出来：四个 0700、`profile.json` 0600；重复调用幂等；元数据属于别人时**拒绝复用目录** | 在途 Run 是否 ≤10s 停 |
| 换一个 OS 用户（`postgres`）读 `pro` 的 profile → **Permission denied**（同一棵临时树里 0644 控制文件读得到，证明拒绝来自权限位而不是路径写错） | 生产环境的服务账号/容器边界是否与这条演练一致 |

**别把左栏当右栏用。** 左栏绿了只说明"派生的名字是对的"，不说明"文件真的没人能越界读"。

## 6. 撤权与离职

| 触发 | 必须发生 | 时限 |
|---|---|---|
| 角色/功能点被收回 | 下次工具调用即失败（逐次鉴权） | 立即 |
| 绑定被 revoke | 新 Run 拒绝创建；在途 Run 收到 `principal.revoked` 后停止调度 | ≤ 10s |
| 员工离职 | 绑定 revoked + Bot 解绑 + 在途 Run 取消 + 草稿转交 + 归属转部门池 | 离职流程内 |
| 策略版本升级 | 新 Run 用新版本；旧 Run 不得延长 | 立即 |

在途 Run 被撤销后**不得完成 CRM 写入**：写入前校验 `run.status === 'running'` 且绑定仍 active。

**实现（第 54 轮）**：`src/lib/dsh/run.ts` 把这两半分开落地，因为它们是两个不同的事实：

| 半 | 函数 | 说明 |
|---|---|---|
| 撤权广播 | `applyPrincipalRevoked()` | 把该绑定的在途 Run（`queued`/`running`/`awaiting_approval`）转 `cancelled`；已终结的不动（否则等于改写历史）；别的绑定只计数不碰 |
| 写入前判定 | `canWriteToCrm({ run, bindingState, now })` | 绑定状态是**参数**，不是从 run 上读的：取消广播可能还没落到 run 对象上，那个时间差正是被撤销的在途任务会用的窗口 |
| 时限 | `withinRevocationDeadline()` | 10 s 是承诺，不是描述；早于撤销时间或缺失时间戳都判失败 |

拒绝原因区分 `no_run` / `run_not_running` / `run_cancelled` / `run_terminal` / `binding_not_active` / `time_unparseable`，审计能看出是哪一道拒的。

**仍未验**：没有真实 DSH 进程可撤，也没有 leadgen 的 Run 表可落库，所以用例 5 的端到端仍 blocked。

## 7. 待确认（阻塞实现的部分）

| 项 | 依赖决策 | 影响 |
|---|---|---|
| 候选去重键与唯一索引 | D2 | §2 表结构 |
| 可触达判定字段 | D3 | 候选/公司字段 |
| 配额层级与预留粒度 | D4 | §2 配额账本 |
| 审批与发送分离细节 | D5 | §2 审批表 + §3 状态机 |
| 渠道与发信域名 | D8 | §3 渠道限制、§5 凭据隔离 |

在这些确认前，实现只做**结构**（表、索引、状态机、鉴权路径），不做业务判定逻辑，避免把猜测写成规则。
