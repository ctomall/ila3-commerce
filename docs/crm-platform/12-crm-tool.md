# M4-3 · 员工助手的一个 CRM 只读工具（已实现并实测）

## 1. 交付物

| 文件 | 作用 |
|---|---|
| `src/modules/crm_tools/index.ts` | 模块声明（`@app`，无页面、无实体、无迁移） |
| `src/modules/crm_tools/ai-tools.ts` | 工具声明：`crm.find_companies`，`isMutation: false`，`requiredFeatures: ['customers.companies.view']` |
| `src/modules/crm_tools/lib/companyLookup.ts` | 可测的纯逻辑：scope 解析、输入 schema、查询构造、结果整形 |
| `src/modules/crm_tools/__tests__/ai-tools.test.ts` | 18 例 |
| `src/modules.ts` | 注册 `{ id: 'crm_tools', from: '@app' }` |

## 2. 三条硬约束（对应 `03-dsh-contract.md` §2）

1. **scope 永不来自模型。** 输入 schema 里没有 `tenantId` / `organizationId`；`.strict()` 让"试图塞进去"直接 400，而不是被 zod 静默丢弃（zod 默认就是丢弃，那会让模型以为成功了）。
2. **权限点复用已存在的 ACL feature**，不新造：`customers.companies.view`。
3. **handler 自己重新解析输入**，因此从工具测试器、MCP server 或 pending-action 执行器调用时同样安全。

## 3. 端到端实测（对着运行中的服务，不经 LLM）

`POST /api/ai_assistant/tools/execute`（请求体 `{ toolName, args }`）：

| 用例 | 期望 | 实测 |
|---|---|---|
| 无 cookie | 401 | `401 {"error":"未登录"}` |
| `crm.find_companies` limit=3 | 200 + 明文公司 | `200` `Harborview Analytics` / `harborviewanalytics.com` / `Software` |
| 回显 scope | 等于调用者 tenant/org | `f27fa168…` / `328bc848…` |
| args 里塞 `tenantId` | 400 | `Unrecognized key: "tenantId"` |
| `limit: 500` | 400 | `limit: Too big: expected number to be <=20` |
| 不存在的工具 | 400 | `Tool "crm.delete_everything" not found` |
| `employee` 角色调用 | 200（该角色持有 `customers.companies.view`，`context_whoami` 实测 112 个 feature 含它） | `200` + 明文公司 |
| 与 App 自身的公司列表对齐 | 同一调用者看到同一批 | App `GET /api/customers/companies` → `total: 3`；工具 → 3 家同名（`Harborview Analytics` / `Copperleaf Design` / `Brightside Solar`） |

注册确认：`/api/ai_assistant/tools` 返回 **97 个工具**，其中含 `crm.find_companies`；构建产物 `.mercato/generated/ai-tools.generated.ts` 里有 `AI_TOOLS_crm_tools_*` 的 import。

## 4. 端到端跑出来的两个真缺陷（单测全绿时存在）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | `there is no parameter $1` | 驱动走 knex，占位符是 `?` 而不是 Postgres 的 `$1` | 改 `?`，并把"参数个数 == 占位符个数"钉成断言 |
| 2 | 返回**密文**（`...:v1`），工具等于没用 | `customer_companies` 的字段加密在 **ORM 层**处理，裸 SQL 绕过了解密 | 改用 `em.find(CustomerCompanyProfile, …)`，让 ORM 解密并统一软删/作用域处理 |

这两个都是"14 个单测全绿、工具却不可用"的典型：单测只能证明我写的逻辑自洽，**证明不了它和运行时对得上**。

## 4.0 搜索为什么不在 SQL 里做（端到端抓到的第三个 bug）

第一版把 `query` 翻成 `ilike` 塞进 where。单测还"确认"了它（断言 where 里有 `$ilike`）——**那是把错的设计钉成了正确**。对着运行中的服务一调，任何关键词都返回 0：公司名与域名在库里是**密文**，`ilike` 跑在密文上永远不匹配，而解密发生在 ORM 读出之后。

现在：SQL 只做 scope + 软删过滤，搜索在读出来之后用 `filterByQuery` 在内存里做，并且**只扫描有界的 200 行**、结果里回传 `scanned`，避免把"有界扫描"说成"全量搜索"。代价写在代码注释里：超过 200 行的公司搜不到。

| 关键词 | 结果 |
|---|---|
| `har` | 1 家（Harborview Analytics），`scanned=3` |
| `copperleaf.design` | 1 家，`scanned=3` |
| `zzz-nothing` | 0 家，`scanned=3` |
| 不传 | 3 家，`scanned=3` |

## 4.1 软删过滤（自查发现，未端到端证明）

`customer_companies` **没有** `deleted_at`：软删标记在父表 `customer_entities` 上，公司表通过
`entity_id` 关联。只查公司表会把 CRM 已删除的公司继续答给助手。现在查询条件带
`entity: { deletedAt: null }`，单测直接断言这一项在 `where` 里。

**没能端到端证明**：库里当前 0 条软删公司，造一条属于数据变更（需批准）。所以这条是
"结构正确 + 单测断言"，不是"实测过滤生效"——不写成 pass。

## 5. 还没做到的

| 项 | 为什么 |
|---|---|
| 403 路径实测 | 试过两条路都不通：① 三个用户都持有 `customers.companies.view`；② 改用 `warranty_claims.draft_customer_reply`（要求 `warranty_claims.claim.manage`）间接证明运行时按 feature 拦截——`context_whoami` 实测 employee 持有 **112 个 feature，连这个 manage 都有**（superadmin/admin 同样宽），所以拿不到 403。造一个受限用户属于数据变更（需批准）。机制在 M2 审计过（`hasRequiredFeatures` 7 处调用点），但**这条工具上的 403 没有实测** |
| 每员工 DSH 隔离 | 属 M4 路线（A/B/C 未定），本工具不依赖它 |
| 软删过滤的端到端证明 | 需要一个已软删的公司 fixture（数据变更，需批准） |
| 写类工具 | 本阶段只做只读；写需要 pending-action 审批契约 |
