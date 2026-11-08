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

静态面（子审计 A，可复跑）：后端页 **270**（47 模块）· 可见 152（主 92 = 47 根 + 45 子；设置 58；profile 2）· navHidden 89 · 动态页 76 · API **701**（676 唯一）。

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
