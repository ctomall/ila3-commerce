# M1 入口映射（基线 + 收敛候选）

> 基线来源：**服务端真实 payload**，不是静态 grep。
> 复跑：`node scripts/crm-nav-baseline.mjs`（只读，一次登录 + 一次 GET/角色；凭证取自 `~/.ila3-admin-credentials`，不落盘、不打印）
> **先失效缓存**：导航响应缓存在 `.mercato/cache/cache.db`（TTL ~15 分钟，重建不清）。验证前删掉 value 含旧文案的 `cache_entries` 行，否则会把「缓存没失效」误判成「改动没生效」。
> 产物：`docs/crm-platform/appendix/nav-{superadmin,admin,employee}.json` + `nav-summary.json`

为什么不拿静态清单当基线：导航 = 页面元数据 → payload builder → 打过补丁的 dist → `AppShell` 二次过滤（`pageContext`、settings 前缀、空组），且 `visible(ctx)` 可**按租户**隐藏入口。静态清单会随这三个环节漂移。

## 1. 规模（2026-11-08 实测）

| 角色 | 侧栏分组 | 主区条目（含子项） | 设置区条目 | 已授功能点 | 证据 |
|---|---|---|---|---|---|
| superadmin | 22 | **152** | 60 | 316 | `appendix/nav-superadmin.json` |
| admin | 22 | 150 | 58 | 300 | `appendix/nav-admin.json` |
| employee | 12 | **74** | 11 | 117 | `appendix/nav-employee.json` |

> **2026-11-09 收敛后（M7，见 §11）**：superadmin 22→**19** 组 / 152→**130** 主区条目；admin 22→19 / 150→**128**；employee 12 组不变 / 74→**64**。减少的 22 个（employee 10 个）全部是「对象级创建动作」的独立菜单项，动作本身仍在列表页（逐页用 `createHref`/`Link` 核对）。设置区 superadmin 60→58、admin 58→56（货币/汇率两个子快捷方式），employee 11 不变。基线与快照已按新构建重录。

静态面（子审计 A，可复跑）：后端页 **270**（47 模块）· 静态可见 **152**（主 92 = 47 根 + 45 子；设置 58；profile 2）——这是**静态声明**口径，与上面表格的**服务端 payload** 口径不同名同值，别混用· navHidden 89 · 动态页 76 · API **701**（676 唯一）。

## 2. 分区现状（superadmin 视角）

| 分区 | 条目 | 归属 | 备注 |
|---|---|---|---|
| 客户与销售 | 10 | customers + sales | 核心业务区 |
| 商品与库存 | 7 | catalog / checkout / wms | 含 3 个 checkout ⚠（父项缺失） |
| 履约与售后 | 2 | eudr / warranty_claims | |
| 人员与排程 | 9 | staff | 员工只剩 3 |
| 财务与规则 | 6 | currencies / rules / logs | **员工完全看不到此区** |
| 自动化与流程 | 4 | workflows | |
| 内容与通信 | 6 | documents / messages / comms | 「消息」无权限声明 |
| 功能开关 | 1 | feature_toggles | 中文正常（子审计 A 的「英文漏出」判断有误，见 §5 勘误） |
| 数据设计器 | 1 | entities | 同上 |
| 身份与权限 | 2 | auth | 中文正常 |
| 组织与租户 / 外部系统 / 客户门户 / 模块配置 / 系统 / 自定义 / 身份认证 / 账户 / 安全 / 开发者 | 3/5/2/25/4/1/5/2/1/1 | 设置区混入主区 | 25 条「模块配置」是最大单体 |

## 3. 角色差异（这是「收敛」的真实约束）

**employee 看不见**：财务与规则（整个区）、功能开关、数据设计器、身份与权限、组织与租户、客户门户、系统、自定义。
**employee 缩水**：人员与排程 9→3、自动化与流程 4→3、模块配置 25→4、外部系统 5→4。

结论：菜单数量由 `requireFeatures` 决定，不由设计稿决定。**先定角色-功能矩阵，再谈「减少菜单」**，否则减的是超管的菜单、业务员那边一条没少。

## 4. 重复入口（同一件事多条路，Top 10）

| # | 重复 | 两条路径 | 判定 |
|---|---|---|---|
| 1 | 设置首页 | `/backend/settings`（stock 占位，设置按钮指向它）vs `/backend/config/home`（卡片网格） | 两者 `navHidden:true`；`settings_home/index.ts:6-9` 声称「stock 页已被 auth override 关闭」，而 `src/modules.ts:188` **无该 override** —— 注释为假（主 Agent 已复核） |
| 2 | AI 智能体 | `/backend/config/ai-assistant/agents` vs `/backend/config/ai-agents` | 同一功能点，两份实现 |
| 3 | 客户详情 | `people/[id]` vs `people-v2/[id]`；`companies/[id]` vs `companies-v2/[id]` | v2 全仓无入链 = 孤儿路由 |
| 4 | 客户列表 | `customers/people` vs `customers/companies` | 缺统一「客户列表」承载 |
| 5 | 任务 | `customer-tasks` / `work-inbox` / `staff/time-tracking/board`（标签「任务」） | 三处同名不同物 |
| 6 | 请假 | `staff/leave-requests` vs `staff/my-leave-requests` | **同中文标签**，权限不同易误点 |
| 7 | 自定义实体 | `/backend/config/settings` vs `/backend/entities/user` | 同标签两份 |
| 8 | 通知 | `notifications/user-preferences` / `profile/notification-preferences` / `config/notifications` | 三处 |
| 9 | 收件箱 | `inbox-ops` / `work-inbox` / `messages` | 三处 |
| 10 | 看板 | `/backend`（DashboardScreen）vs `/backend/wms`（运营看板） | 后者是仓储域看板，需改名区分 |

## 5. 孤儿 / 断链 / 假声明

| 类型 | 对象 | 证据 |
|---|---|---|
| 孤儿路由 | `people-v2/[id]`、`companies-v2/[id]` | 全仓无入链（A 审计） |
| 断链 | `/backend/sales/documents/create` 无 `/backend/sales/documents` 列表父路由；7 个「创建 X」挂在不存在的父项下成为根项 | A 审计 ⚠ 标注 |
| 死映射 | `availability.nav.group` 仍在 `settings-sections.json`，但对应模块在 `src/modules.ts` 被注释 | A 审计 |
| 假注释 | `settings_home/index.ts:6-9` 宣称的 override 不存在 | 本条已由主 Agent 亲自复核 |
| ~~英文漏出~~ | 子审计 A 报称三个分区名未中文；**主 Agent 用运行时 payload 复核后否定**：22 个分区名全部中文，10 条英文标题是 EUDR/Webhook/AI/API 这类合法缩写 | `appendix/nav-superadmin.json` |

## 6. 收敛候选（第一批，可逆、不断链）

原则：**只做「同一件事留一条路」，不新增分区、不靠删除制造整洁**。

| # | 动作 | 对象 | 风险 | 需要 |
|---|---|---|---|---|
| ~~C1~~ | ~~三个英文漏出区并入~~ | — | — | **撤销**：运行时已是中文，无事可做 |
| C2 | 两个 AI 智能体入口留一个，另一个 `navHidden` 或 301 | `config/ai-assistant/agents` vs `config/ai-agents` | 低 | 先确认哪份是权威 |
| C3 | 「请假申请」两处改名区分（管理 / 我的） | staff 两页 | 低 | i18n 键 |
| C4 | 「自定义实体」两处改名区分 | config/settings、entities/user | 低 | i18n 键 |
| C5 | ~~7 个「创建 X」不再作根项~~ **已核对：实际 5 个，且不建议加补丁** | 详见 §6.1 | 低 | 上游对齐 `pageGroupKey`（见下） |
| C6 | 设置首页权威化：`/backend/settings` → `/backend/config/home` | 断链面 | 中 | 决策 D11 |
| C7 | 客户详情 v2 收编或删除 | v2 两页 | 中 | 决策 D12 |

## 7. 六页意图 × 现行承载

| 意图页 | 现行承载 | 缺口 |
|---|---|---|
| 业务员首页 | `/backend`（通用仪表盘，无角色维度） | 需要角色化（待 D14） |
| 开发任务 | **无** | 新建（M5） |
| 候选审核 | **无**（最近的是收件箱建议） | 新建（M5） |
| 客户列表 | 联系人 / 公司 两页 | 需要统一入口 |
| 客户详情 | v1 + v2 两套 | 定权威版本 |
| 邮件草稿审批 | 无审批，草稿在 Messages 内 | 新建审批（M6） |

## 8. 目标骨架 × 现行承载（不建空分区）

| 目标分区 | 承载 | 处置 |
|---|---|---|
| 工作台 | `/backend` + 角色化首页 | 复用 + 收窄 |
| 客户开发 | **无承载** → M5 新建「开发任务」「候选审核」两页 | 唯一需要新开的分区，理由是有两个真实页面要落 |
| 销售业务 | 客户与销售（10）+ 商品与库存（7）+ 履约与售后（2） | 复用，仅重命名与去重 |
| 资料中心 | 内容与通信（6：文档/消息/附件）+ 通话记录 | 复用 |
| 管理后台 | 设置区 60 条 + 三个英文漏出区 + 财务与规则 | 复用，仅归位 |

> 规则落地：上表若某分区没有任何真实承载，就不建该分区。目前只有「客户开发」是因为 M5 的两页而新建，不是设计稿要求的。

## 9. 待决（已写入 `decisions.md`）

- D11 设置首页谁权威（stock vs 卡片网格）
- D12 v2 客户详情：替代 / 灰度 / 删除
- D13 基线口径：以本文件的服务端 payload 快照为准（每次改导航必须重跑 `crm-nav-baseline.mjs` 并 diff）
- D14 业务员首页是否复用 `/backend`

## 10. 英语残留（已定位并修复，另附扫描工具）

改名验证时顺带发现，部分框架页仍有英文原文，且**不在 `src/i18n/zh.json` 里**，所以改名解决不了：

| 位置 | 英文 | 说明 |
|---|---|---|
| `/backend/staff/leave-requests` 搜索框 | `Search leave requests...` | 占位符硬编码在框架页，zh.json 无对应键 |
| 同页列头 | `Dates` | 同上，列定义里的标签 |

**已修**：源码本来就用 `t(key, fallback)`，缺的只是 `src/i18n/zh.json` 的键。补三条键后，团队请假的搜索框与列头全部中文（`搜索…`、`日期`）。不需要改代码，也不需要加补丁。

**可复跑的扫描**：`node scripts/crm-i18n-sweep.mjs` → `appendix/i18n-residual.md`（8 个页面，过滤合法缩写）。最新结论：界面结构无英文残留，命中项全是公司名/人名/单据号/渠道值这类**数据**。


## 6.1 「创建 X」根项的真实情况（2026-11-08 复核）

之前口头说「7 个创建 X 挂在缺失父项下」。用脚本复核（`node scripts/crm-nav-nesting-check.mjs`）后，真实分布是 **5 个「有父页面却没嵌套」+ 1 个「根本没有父页面」**：

| 入口 | 现有父页面 | 直接原因 |
|---|---|---|
| `/backend/users/create` 创建用户 | `/backend/users` | 父子 `pageGroupKey` 不一致 |
| `/backend/roles/create` 创建角色 | `/backend/roles` | 同上 |
| `/backend/entities/user/create` 创建实体 | `/backend/entities/user` | 父 `settings.sections.dataDesigner` vs 子 `entities.nav.group` |
| `/backend/feature-toggles/global/create` 创建功能开关 | `/backend/feature-toggles/global` | 父/子分组键不同 |
| `/backend/config/customers/deals` 商机设置 | `/backend/config/customers` | 同上（脚本才扫出来的第 5 条） |
| `/backend/sales/documents/create` 创建销售单据 | **无** | 没有 `/backend/sales/documents` 页面 |

**机制**（已核实）：`nav.ts` 按 href 前缀建父子，但只在**同一分组内**匹配。父子声明了不同的 `pageGroupKey` 时，它们被分进两个同名分组，前缀匹配永远不触发。

**结论：不在这里加补丁。** 这是上游元数据不一致，加一条 nav 后处理过滤器只会掩盖问题，并让下一次升级更难对齐。正确修法：upstream 对齐父子 `pageGroupKey`（5 个），以及给 `/backend/sales/documents` 补父页面或显式 parent 元数据（1 个）。

**可复跑的检测器**：`node scripts/crm-nav-nesting-check.mjs`（默认只报告，`--strict` 才作为门禁），输出 `appendix/nav-nesting.json`。

C5 因此不算“未完成的收敛”，而是“已定位、且明确不该用补丁解决”。



## 11. M7 可见收敛（2026-11-09，已落地并实测）

> 载体：正式页面（核心 `customers` / `sales` / `catalog` / `warranty_claims` / `currencies` / `rules` / `resources` / `staff` / `auth` / `feature_toggles` / `entities` 模块的列表页），不是 `navHidden` 原型。
> 机制：`src/modules.ts` 的 `overrides.routes.pages[*].metadata`（框架自带的 route-metadata override：`pageRouteMetadata.ts` → `registry.registerBackendRouteManifests` → 导航 payload），**不改 node_modules、不加 nav 后处理补丁、不动角色权限**。
> 为什么用这个抓手：`navHidden` 只隐藏菜单项，路由、`requireFeatures`、列表页按钮全部不动；同一动作因此只剩「列表页操作区」一条入口，而不是两条。

### 11.1 本轮改了什么（22 个入口，全部 navHidden；按同一判据筛完整一类）

判据：**只有当该页面的列表/表格自身声明了 `createHref` 或指向它的 `Link` 时才隐藏**。逐页核对，不按名称猜。

| 旧名称 / 路由 | 动作的真实位置（证据） | 处置 |
|---|---|---|
| 创建公司 `/backend/customers/companies/create` | `customers/companies/page.js` → `Link` | 下沉到客户列表 |
| 创建联系人 `/backend/customers/people/create` | `customers/people/page.js` → `Link` | 下沉到联系人列表 |
| 创建商机 `/backend/customers/deals/create` | `customers/deals/page.js` → `Link` | 下沉到商机列表 |
| 创建渠道 `/backend/sales/channels/create` | `sales/channels/page.js` → `Link` | 下沉到销售渠道列表 |
| 创建销售单据 `/backend/sales/documents/create` | `SalesDocumentsTable` → `?kind=quote|order` | 下沉到报价单 / 订单列表 |
| 创建产品 `/backend/catalog/products/create` | `ProductsDataTable` → `createHref` | 下沉到产品列表 |
| 创建价格规则 `/backend/catalog/prices/create` | `PricesDataTable` → `createHref: canManage ? …` | 下沉到价格规则列表 |
| 创建分类 `/backend/catalog/categories/create` | `CategoriesDataTable` → `createHref: canManage ? …` | 下沉到分类列表 |
| 新建工单 `/backend/warranty_claims/create` | `warranty_claims/page.js` → `Link` | 下沉到保修工单列表 |
| 新建登记 `/backend/warranty_claims/registrations/create` | `registrations/page.js` → `Link` | 下沉到保修登记列表 |
| 新建供应商政策 `/backend/warranty_claims/vendor-policies/create` | `createHref` | 下沉到供应商政策列表 |
| 新建排障指南 `/backend/warranty_claims/troubleshooting-guides/create` | `createHref` | 下沉到排障指南列表 |
| 创建用户 `/backend/users/create` | `auth/users/page.js` → `Link` | 下沉到管理后台「用户」列表 |
| 创建角色 `/backend/roles/create` | `auth/roles/page.js` → `Link` | 下沉到管理后台「角色」列表 |
| 创建货币 `/backend/currencies/create` | `createHref`（同时是 `settings.sections.org` 里「货币」的子快捷方式） | 下沉到货币列表；设置区「货币」入口保留 |
| 创建汇率 `/backend/exchange-rates/create` | `createHref`（同上，「汇率」子快捷方式） | 下沉到汇率列表；设置区「汇率」入口保留 |
| 创建业务规则 `/backend/rules/create` | `createHref` | 下沉到业务规则列表 |
| 创建规则集 `/backend/sets/create` | `createHref` | 下沉到规则集列表 |
| 创建资源 `/backend/resources/resources/create` | `createHref` | 下沉到资源列表 |
| 创建团队 `/backend/staff/teams/create` | `createHref` | 下沉到团队列表 |
| 创建功能开关 `/backend/feature-toggles/global/create` | `FeatureTogglesTable` → `createHref` | 下沉到全局开关列表 |
| 创建实体 `/backend/entities/user/create` | `UserEntitiesTable` → `Link` + `createHref` | 下沉到自定义实体列表 |

**刻意不动**：`/backend/definitions/create`、`/backend/resources/resource-types/create` —— 它们的列表页**没有**创建按钮，隐藏菜单项会删掉唯一入口。这不是遗漏，是判据的边界。

副作用（正向）：`auth.nav.group`、`feature_toggles.nav.group`、`entities.nav.group` 三个组只剩这些「创建」项，隐藏后整组消失（超管/管理员 22→19 组）；employee 的 6 个业务分组一条不少。

### 11.2 旧 → 新 · 五目标区映射（按现行 manifest 与真实页面，不按排除法）

| 目标区 | 现行承载（真实页面） | 处置 |
|---|---|---|
| 工作台 | `/backend`（DashboardScreen） | **保留**；业务员首页角色化仍待 D14，不新建空分区 |
| 客户开发 | **无正式承载**：开发任务 / 候选审核只有 `crm_prototype`（navHidden，不算交付），数据依赖 `leadgen_*` 迁移（未批） | **本轮不建分区**（§8 规则：没有真实承载就不建）；不拿原型冒充 |
| 销售业务 | 组 `sales`：公司/联系人/商机（含地图、漏斗）/客户相关任务/日历/报价单/订单/销售渠道/渠道报价；组 `catalog`：产品与服务/价格规则/分类/运营看板(+7)/支付链接/结账模板/交易记录；组 `fulfillment`：保修工单(+登记/供应商政策/排障指南)/EUDR(+5) | **保留**；22 个「创建 X」**下沉**（见 11.1）；不合并地图/漏斗（同一对象的不同视图，不是重复入口） |
| 资料中心 | 组 `comms`：文档/附件/消息/收件箱建议/通信渠道/通话记录 | **保留**（目录/模板/消息/附件职责不同，未发现同对象双入口） |
| 管理后台 | 设置区（employee 11 条、admin 56 条、superadmin 58 条）+ `/backend/users`、`/backend/config/*`、`/backend/webhooks` 等 | **保留并复核归位**：这些页面的 `pageContext` 已是 `settings`，AppShell 的 `isMainItem()` 已把它们挡在主侧栏之外（`@open-mercato/ui/backend/AppShell.js` 的 `pageContext !== "main"` 与 `settingsPathPrefixes` 过滤）；本轮再把「创建用户/创建角色/创建功能开关/创建实体」从主区 payload 移除 |

**两个区外保留（不硬塞进五区）**：`people`（我的请假/我的可用性/我的工作）是个人事务面，`automation`（工作流定义/实例/工作收件箱）是流程操作面——都是真实在用的入口，五区没有对应归属；要改名/并组必须改 `src/nav/nav-groups.json`（不在本次文件边界），列为待决而不是用隐藏菜单凑数。

### 11.3 基线变化（相对旧基线：只有删除，没有新增/改名）

| 角色 | 分组 | 主区条目(payload) | 设置区条目 | 主侧栏可见（AppShell 过滤后） |
|---|---|---|---|---|
| superadmin | 22→**19** | 152→**130** | 60→**58** | 根 40→**39** · 节点 85→**69** |
| admin | 22→**19** | 150→**128** | 58→**56** | 根 40→**39** · 节点 85→**69** |
| employee | 12（不变） | 74→**64** | 11（不变） | 根 30→**29** · 节点 60→**50** |

- 删除的 22 条 = 11.1 全表；三组空组消失（auth / feature_toggles / entities）。
- 设置区少 2 条（superadmin/admin）：`创建货币`、`创建汇率` 原本还是 `settings.sections.org` 里「货币」「汇率」的子快捷方式；列表页本身有新建按钮，故一并下沉。employee 的设置区 11 条不变。
- `appendix/nav-nesting.json`：根入口 102→**97**；「有父页面却未嵌套」5→**1**（只剩 `/backend/config/customers/deals` —— 它是 settings 子页与父页 `pageGroupKey` 不一致，**未加补丁掩盖**）。

### 11.4 验证命令与结果

新构建（`next dev`，独立 `OM_DIST_DIR`、端口 3310，同一数据库）：

```text
NAV_CHECK_BASE_URL=http://127.0.0.1:3310 node scripts/nav-check.mjs
  groups 19 / settings 8 / items 188 / duplicate hrefs 0 / issues 0

NAV_BASE_URL=http://127.0.0.1:3310 node scripts/crm-nav-baseline.mjs --check
  superadmin 130 / admin 128 / employee 64  → RESULT: PASS

NAV_BASE_URL=http://127.0.0.1:3310 node scripts/crm-nav-nesting-check.mjs --check
  1 条已知未嵌套入口与基线一致 → RESULT: PASS
```

**部署依赖（必须写明）**：生产 3000 仍服务 05:50 的旧构建（`mercato.service`，`.mercato/next`），默认 `node scripts/crm-nav-baseline.mjs --check`（指向 3000）会报「新增入口 创建公司…」等差异——那是**旧构建 vs 新基线**，不是回归失败。重建并切换后即一致；切换属于发布链路，不在本次子任务范围。

### 11.5 正式界面闭环（employee 实测，真实落库 / 真实草稿）

路径：`/backend/customers/companies`（客户列表）→ 点公司进 `/backend/customers/companies/<id>`（详情）→ 详情页「记录跟进」（Notes）或右上「写邮件 → 保存草稿」。

| 动作 | 端点 | 结果 | 是否真实落库 | 是否外发 |
|---|---|---|---|---|
| 记录跟进 | `POST /api/customers/comments`（`customers.activities.manage`） | 201 + id；`GET ?entityId=…` 能读回同一条 | **是**（随后 DELETE 清理，200） | 否 |
| 生成邮件草稿 | `POST /api/messages` + `isDraft:true`、`objects:[{customers,company,id}]`（`messages.compose`） | 201 + id；`GET /api/messages/<id>` 返回 `isDraft:true`、`sentAt:null`；drafts 文件夹 `status:"draft"` | **是**（随后 DELETE 清理，200） | **否**（`sendViaEmail:false`、无 `sentAt`） |

两个写动作都走现有命令/CRUD，没有引入 leadgen 迁移，也没有新增表。

### 11.6 未完成 / 明确不做

1. **客户开发区**：仍无正式承载（leadgen 迁移未批）。原型六页继续 `navHidden`，不计入交付。
2. **合并重复入口**：employee 可区里没有「同对象双入口」；被点名的 AI 智能体双入口（`config/ai-assistant/agents` vs `config/ai-agents`）不在 employee 权限内，且哪份权威是产品决策（C2/D12），本轮不猜。
3. **技术/配置类入口**：employee 主侧栏已无此类入口（`pageContext:"settings"` + AppShell 过滤）；但导航 **payload** 里设置页仍会同时出现在 `groups` 与 `settingsSections`（服务端 `buildAdminNav` 不做 context 过滤）。要让基线也反映「视觉真实」需要改上游 `backendChrome`，不在本任务文件边界。
4. **人员与排程 / 自动化与流程**并入五区：需改 `src/nav/nav-groups.json`（文件所有权外）。


## 12. 跨表面重复：已知偏差（2026-11-09，第 65 轮）

四个业务区已上线（工作台 / 销售业务 / 资料中心 / 管理后台）。剩下的问题不是分组，而是同一批页面被**两个表面**索引：

| 事实 | 值 |
|---|---|
| 主区与设置区重复的 href | **11**：`/backend/webhooks`、`/backend/integrations`、`/backend/data-sync`、`/backend/payment-gateways`、`/backend/config/{sales,translations,scheduled-jobs,wms}`、`/backend/users`、`/backend/audit-logs`、`/backend/docs` |
| 试过的修法 | 对上述 11 个页面加 `navHidden` 掉主区入口 |
| 结果 | **失败并已回退**：`navHidden` 是全局的，设置区也一起变空（`settingsSections: []`），员工只能手打 URL 进配置 |
| 根因 | 上游 `buildAdminNav` 不按 `pageContext` 过滤；设置区是对同一批页面的第二个索引 |

**结论**：在不动上游的前提下，只能二选一——四个区 + 11 条重复，或者 0 条重复 + 设置区为空。选前者，因为“菜单里能点到配置”比“账面没有重复”更重要。要真正两者兼得，需要上游按 pageContext 过滤，属独立改动。
