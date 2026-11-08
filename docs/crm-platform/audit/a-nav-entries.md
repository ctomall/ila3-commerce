# 子审计 A · 后端入口与导航（原文归档）

> 只读审计；解析 329 个 `page.meta.ts`、`.mercato/generated/**`（270 后端页 / 701 API / 29 前端 manifest）。结构化产物落在 `/tmp/om-routes.json`（主 Agent 未纳入仓库，数字可复跑）。

## (a) 入口事实

### 1 应用层路由（`src/app`：6 page + 9 route）

| 路径 | 类型 | 说明 |
|---|---|---|
| `/` | page | 站根 |
| `/login`、`/start` | page | 认证 / 启动 |
| `/backend` | page | **唯一应用级后台首页**，内嵌 `DashboardScreen`（`src/app/(backend)/backend/page.tsx:31`） |
| `/backend/[...slug]` | page | **所有模块后台页总入口** |
| `/(frontend)/[...slug]` | page | 29 条前台 manifest（portal/quote/docs） |
| `/api/[...slug]` | route | 701 条模块 API（`src/app/api/[...slug]/route.ts:24`） |
| `/api/auth/login`、`/api/dev-runtime/*`×4、`/api/docs/*`×2、`/api/healthz` | route | 应用自建 |

### 2 `/backend/[...slug]` 的解析

- 页面是**文件约定**，没有 `pages:` 数组：`<module>/backend/**/page.tsx` + `page.meta.ts`；`ModuleInfo` 只有 `backendRoutes?: ModuleRoute[]`（`shared/src/modules/registry.ts:248`）。
- 生成物：`backend-route-metadata.generated.ts`（270 条）+ 51 个 shard（含 `load: import(page)`，例 `backend-route-shard.011.customers.generated.ts:12-30`）。
- 匹配：`page.tsx:60` `findRouteManifestMatch`（registry.ts:403），按 URL 首段懒加载 shard。
- 鉴权：`page.tsx:70` requireAuth；`:73-77` requireRoles；`:79-99` requireFeatures → `rbacService.userHasAllFeatures`（org/tenant 由 `resolveFeatureCheckContext` 派生）。
- 渲染：`page.tsx:118` load → `:119` `resolveRegisteredComponent`，可被 `page:/backend/x` 覆盖。

### 3 导航数据源

- 单一来源＝页面元数据：`ui/src/backend/utils/nav.ts:369`（skip navHidden）、`:373`（groupId=pageGroupKey）、`:377`（visible(ctx)）、`:383`（requireRoles）、`:389`（requireFeatures）、`:414-431`（href 前缀建父子）。
- 服务端：`core/src/modules/auth/lib/backendChrome.tsx:268` 分组、`:391` getEffectiveFeatures、`:486-493` 侧栏偏好。
- 项目层：`src/nav/nav-groups.json`（7 分区）+ `settings-sections.json`（8 分区），经 `src/nav/logic.js` 由**受管补丁**注入 dist（`backendChrome.js:146/172/335`、`:203/336`）。
- 渲染再过滤：`AppShell.tsx:1160/1165/1170`（settings 前缀、pageContext、空组丢弃）。设置按钮写死 `/backend/settings`（`SettingsButton.tsx:11`）。

### 4 规模（可复跑）

| 指标 | 数 |
|---|---|
| 后端页 | **270**（47 个模块） |
| 可见 | **152** = 主侧栏 **92**（47 根 + 45 子）+ 设置 **58** + profile 2 |
| navHidden | 89（非动态 37） |
| 动态页 | 76 |
| 无元数据 | 5 |
| API | 701（676 唯一） |

### 5 当前主侧栏分区（catalog 合并后 **10** 区；⚠ = 父项缺失或挂错）

**客户与销售**：销售渠道、商机设置 ⚠、日历、客户相关任务、公司、商机、联系人、创建销售单据 ⚠、订单、报价单
**商品与库存**：分类、价格规则、产品与服务、支付链接 ⚠、结账模板 ⚠、交易记录 ⚠、运营看板
**履约与售后**：EUDR 概览、保修工单
**人员与排程**：资源类型、资源、请假申请、我的可用性、请假申请(我的)、团队成员、团队角色、团队、我的工作
**财务与规则**：创建货币 ⚠、创建汇率 ⚠、执行日志、业务规则、规则集
**自动化与流程**：工作流定义/事件/实例、工作收件箱
**内容与通信**：文档、通信渠道、收件箱建议、消息（**无权限声明**）、通话记录、附件
**未编目区（英文漏出）**：`Auth`（创建角色/创建用户 ⚠）、`Data designer`（创建实体 ⚠）、`Feature Toggles`（创建功能开关 ⚠）

设置侧栏 58 条 / 8 分区：系统 4 · 身份与权限 8 · 客户与门户 2 · 数据与集成 9 · 模块配置 27 · 组织与财务 5 · 开发者与定制 4 · 安全 1。主/设置两侧互斥（`AppShell:1165`）。

### 6 同一件事多个入口（Top 10）

1. **设置首页两份**：`/backend/settings`（stock 占位，设置按钮指向它）vs `/backend/config/home`（卡片网格，全站无链接）。两者都 `navHidden`；`src/modules/settings_home/index.ts:6-9` 声称「stock 页已被 `auth` override 关闭」——`src/modules.ts:188` 只有 `{ id:'settings_home', from:'@app' }`，**无该 override，注释是假的（主 Agent 已复核）**。
2. AI 智能体两份：`/backend/config/ai-assistant/agents` vs `/backend/config/ai-agents`。
3. 客户详情两套：`people/[id]` vs `people-v2/[id]`、`companies/[id]` vs `companies-v2/[id]`（v2 全仓无入链）。
4. 客户列表拆两份：联系人 / 公司，无统一「客户列表」。
5. 任务三处：`customer-tasks`、`work-inbox`、`staff/time-tracking/board`。
6. 请假两份同中文标签「请假申请」：`staff/leave-requests` vs `staff/my-leave-requests`。
7. 「自定义实体」两份同标签：`/backend/config/settings` vs `/backend/entities/user`。
8. 通知三处：`notifications/user-preferences`、`profile/notification-preferences`、`config/notifications`。
9. 收件箱三处：`inbox-ops`、`work-inbox`、`messages`。
10. 看板两处：`/backend`（DashboardScreen）vs `/backend/wms`（运营看板）。

孤儿/死入口：`availability.nav.group` 仍在映射表但模块被注释；三张设置页混在主侧栏；`/backend/sales/documents/create` 无列表父路由；7 个「创建 X」挂在不存在的父项下成为根项。

### 7 六个意图页现状

| 意图页 | 现状 |
|---|---|
| 业务员首页 | 部分：通用 `/backend`，无角色维度 |
| 开发任务 | **不存在**（最近的是客户任务/工作收件箱/工时任务） |
| 候选审核 | **不存在**（最近的是收件箱建议 = LLM 建议 + 人工批准） |
| 客户列表 | 存在但拆两页 |
| 客户详情 | 存在且 v1/v2 两套 |
| 邮件草稿审批 | **无审批**，草稿在 Messages 内（`MessagesInboxPageClient.tsx:327`） |

### 8 五条风险

1. **双管线**：元数据 → payload → 补丁后的 dist → AppShell 二次过滤；只改 `page.meta` 会静默不生效，必须同时动 `src/nav/*.json` 与补丁目标。→ 收敛放 `src/nav` 数据层，不再 patch dist。
2. **框架包归属**：97% 页面在 `node_modules`，直接改会被重装覆盖并受 patch 预算约束。→ 只走 overrides/UMES/`src/modules` 新页。
3. **权限即入口**：可见性全由 requireFeatures（requireRoles 全仓为空）；无权菜单消失但 URL 仍 403。→ 先定角色-功能矩阵。
4. **两套设置首页 + 两套客户详情**：删任一侧会断深链。→ 先立 301 映射再删。
5. **入口数随租户/路径漂移**（visible 谓词 + pageContext 过滤）。→ 以登录后真实 nav payload 做基线快照。

### 9 代码答不了的问题

1. `/backend/settings` 与 `/backend/config/home` 谁是权威？
2. v2 客户详情是替代还是灰度？（无 flag、无入链）
3. 「业务员首页」是否复用 `/backend`？
4. 角色/功能真实授予在 DB，本轮未查。
5. 「邮件草稿审批」是 Mercato 页还是 DSH 流程？仓库无 spec。
6. 「开发任务」「候选审核」由谁承载（新模块 vs 复用）？
7. 是否允许带超管凭证只读拉 `/api/auth/admin/nav` 冻结 152 条基线？


---

## 主 Agent 勘误（2026-11-08，用运行时 payload 复核）

**「未编目区（英文标签漏出）」一条不成立**：`docs/crm-platform/appendix/nav-superadmin.json` 里 22 个分区名全部是中文（客户与销售 … 开发者），英文命中的 10 条条目是 `EUDR 概览`、`Webhook`、`AI 智能体`、`API 密钥` 这类合法缩写，不是漏翻。

推测原因：原文读的是 `pageGroup` 的**代码默认值**，而不是 `/api/auth/admin/nav` 的服务端 payload。这正是本项目把「服务端 payload 快照」定为 M1 基线的原因——静态读源会把「默认值」当成「用户看到的东西」。

其余结论（270 页 / 701 API / Top 10 重复 / 设置首页假注释 / v2 孤儿）经抽查成立；其中设置首页假注释由主 Agent 亲自复核（`src/modules.ts:188` 无 override）。
