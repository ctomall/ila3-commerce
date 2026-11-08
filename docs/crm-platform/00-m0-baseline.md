# M0 现状审计 · CRM 企业 AI 获客平台

- 审计时间：2026-11-08（UTC）
- 审计者：主 Agent（本轮亲自核对），另有三路只读子审计并行（见 §7）
- 结论一句话：**运行时、数据库、构建链、权限骨架都可用；真正的缺口不是「没有能力」，而是「入口重复、AI 面没有按员工隔离的证据、获客/触达链路没有候选与配额模型」。**

## 1. 运行入口与运行事实（已核对）

| 项 | 值 | 证据 |
|---|---|---|
| 服务 | systemd `mercato`，`active` | `systemctl is-active mercato` → `active` |
| 监听 | `http://127.0.0.1:3000`，公网 `mercato.ila3.top` | `curl -o /dev/null -w '%{http_code}' /login` → 200 |
| 进程 | Node v24.22.2，Yarn 4.18.1 | `node -v`、`yarn -v` |
| 框架 | Next.js 16 App Router · React 19 · Open Mercato 0.9.0 | `package.json` |
| 数据库 | `postgres://mercato@127.0.0.1:5432/open_mercato`，public schema **313 张表** | `psql -c "select count(*) from information_schema.tables where table_schema='public'"` |
| 数据初始化 | **45 张按模块拆分的迁移表**（`mikro_orm_migrations_*`，无统一的 `_migrations`；例：customers+sales+auth+staff 已应用 78 条） | `psql` 只读查询 |
| 构建 | `bash /tmp/ila3-rebuild.sh` → `BUILD_OK`；`/login` 200 | 本会话实测 |
| 区域设置 | `OM_FORCE_LOCALE=zh`（界面中文） | `.env` |

### 1.1 版本与分支

| 项 | 值 |
|---|---|
| 分支 | `main` |
| HEAD | `6eda47f refactor(patches): install 12 source-built files from a tracked prebuilt tree` |
| 未提交修改 | 无（`git status --short` 空） |
| 贡献者 | 近 30 次提交仅 `ILA3 DevOps <devops@ila3.top>`；无并发开发者风险 |
| 远端 | `github.com:ctomall/ila3-commerce.git` |

### 1.2 代码构成（决定了「改哪里」）

| 层 | 位置 | 规模 | 含义 |
|---|---|---|---|
| 应用路由 | `src/app/**` | 6 个 `page.tsx`、9 个 `route.ts` | 应用自己的页面/接口，数量很少 |
| 应用模块 | `src/modules/**` | 9 个：`agent_directory`、`agent_examples`、`ai_model_config`、`example`、`example_customers_sync`、`module_directory`、`ratelimit_probe`、`settings_home`、`system_update` | 这就是「我们能直接改」的业务代码 |
| 框架模块 | `node_modules/@open-mercato/**` | 25 个包：`core`、`ui`、`shared`、`ai-assistant`、`web-research`、`channel-{gmail,imap,resend,ses,discord,expo,fcm,apns}`、`enterprise`、`gateway-stripe`、`scheduler`、`queue`、`search`、`sync-akeneo`、`tillio`、`telemetry`、`webhooks` 等 | **不得直接改**；按项目既有 mirror + vendor `prebuilt` 流程（§5） |
| 生成注册表 | `.mercato/generated/**` | 360 个文件；`modules.generated.ts` 含 67 个模块 id、701 条 `path:` | 生成物，不手改，改完源码跑 `yarn generate` |

> 关键判断：CRM 业务（customers / sales / catalog / staff / auth）**不在** `src/modules`，而在框架包里。因此本项目的主要交付形态是「应用层模块 + 受管镜像补丁 + UMES/overrides 扩展」，而不是往 `src/modules` 里重写 CRM。

## 2. 能力矩阵（现状 → 可复用性）

| 能力 | 现状 | 复用判断 | 证据/位置 |
|---|---|---|---|
| 身份/登录/会话 | 有；登录只接受 form-urlencoded，JSON 返回 400「邮箱或密码不正确」 | 原样复用，不重做 | `POST /api/auth/login` 实测 |
| 组织/租户/部门 | 有 `organizations`、`staff` 体系；租户与组织由服务端派生 | 原样复用，新增能力必须挂在其上 | 框架 `auth`/`staff` 模块；本轮子审计 B 详查 |
| RBAC/ACL | 有 feature-check（`/api/auth/feature-check`）；侧栏按 feature 过滤（超管 40 项 / 员工 30 项） | 原样复用；**员工助手权限 = 员工当前授权 ∩ 公司限制 ∩ 助手上限 ∩ 任务限制 ∩ 渠道限制** 要在其之上做交集 | 本会话早前实测 |
| 后端页面 | 由模块声明 + `/backend/[...slug]` 解析；侧栏 8 个分区 | 收敛入口时改「声明与分组」，不改解析器 | 子审计 A 详查 |
| API 面 | `/api/docs/openapi` **需要鉴权**（未带 token 返回 401），早前带凭证拉到 676 paths / 1149 ops | 契约核验必须带凭证重新拉 | `curl` 实测 401；`docs/quote-order-api-map.md` |
| AI/Agent | `@open-mercato/ai-assistant` 已装；生成注册表按模块聚合 ai-agents / ai-tools（customers、catalog、staff、workflows、inbox_ops、search、ai_assistant、eudr） | 助手不新写内核，挂在现有 agent/tool 注册与授权上 | `.mercato/generated/ai-{agents,tools}.generated.ts` |
| 获客/调研 | `@open-mercato/web-research` 已装 | 作为 DSH 执行侧工具来源，需审计其外部调用与配额 | `node_modules/@open-mercato/web-research` |
| 触达渠道 | `channel-{gmail,imap,resend,ses}` 等已装 | 先草稿后真实发送；**真实外发未获授权** | 包存在 ≠ 已配置；子审计 C 详查 |
| 审批/通知 | 有 inbox_ops、notifications、tasks 一类模块 | 审批链复用，不自造 | 子审计 C 详查 |
| 配额/限流 | 有 `ratelimit_probe` 应用模块与限流基建 | 配额账本需新建（业务级额度，不是限流） | `src/modules/ratelimit_probe` |
| 客户/公司/商机 | 有 companies / people / deals，含自定义字段、归属、阶段 | 原样复用；候选入库落在这三张实体上 | 本会话已实测（关系健康度自定义字段、列优先级） |
| 报价→订单 | 已有状态迁移守卫（409）、参数校验（422）、字典清洗、locale 格式化；**convert 会物理删除源报价单，订单无 quote_id** | 保留不动；语义待用户决策 | 本会话 `8a95612`、`6eda47f` |

## 3. 既有修复的保护清单（本轮不得回归）

| 修复 | 位置 | 回归证据 |
|---|---|---|
| 报价转订单状态守卫（409） | mirror `packages/core/src/modules/sales/commands/documents.ts` → `vendor/open-mercato/prebuilt/...` | `POST /sales/quotes/{id}/convert` on draft → 409 中文原因 |
| ZodError → 422 + 字段 details | mirror `.../sales/api/quotes/{convert,send}/route.ts` | 传 `{id}` 而非 `{quoteId}` → 422 `details[0].path=["quoteId"]` |
| 字典控制字符清洗 | mirror `.../dictionaries/commands/factory.ts` | 状态字典回读 0 个 CR |
| 金额/日期 locale | mirror `packages/ui/src/utils/format-locale.ts` + `format.ts` | `¥0.00` / `US$496.00` / `2026/11/8` |
| 客户列表列优先级/选项标签/加载失败 | mirror `.../customers/backend/customers/{companies,people,deals}/page.tsx` | 4/20 列、良好/需关注、无法连接服务器文案 |

门禁（当前实测）：`verify-patches` 11 patch / 22 target · `patches:budget` 11/15 · `ui-regression` 18/18 · 对比度 10/10 AA · `yarn build` BUILD_OK。

## 4. 风险清单（M0 结论）

| # | 风险 | 为什么是风险 | 处置 |
|---|---|---|---|
| R1 | **产物只在构建机上有效** | `vendor/**/dist/**` 曾被 `.gitignore` 吞掉，git 里没有文件；别人 clone 后 build 必断 | 已修：改为 `vendor/open-mercato/prebuilt/**` 并在本轮全部 `git add`；后续任何产物必须 `git check-ignore` 验证 |
| R2 | 入口结构性重复 | 67 个模块、701 条声明路径、侧栏 8 分区；「同一个活有两条路」是默认状态，不是意外 | M1 逐条建映射表，只做收敛不新增 |
| R3 | AI 面未证明按员工隔离 | 有 agent/tool 注册表，但「跨员工猜 ID / 模型伪造身份 / 子 Agent 扩权」没有证据 | M4 双员工 PoC 作为硬门禁，失败不进入业务开放 |
| R4 | 触达能力「已装但未授权」 | `channel-*` 包存在；一旦误配就可能真实外发 | M6 前只做草稿；真实发送、域名认证、额度另行批准 |
| R5 | 契约发现需要凭证 | `/api/docs/openapi` 401，历史数字（676/1149）来自带凭证的会话 | M2 核验时必须带登录凭证重拉，并记录时间戳 |
| R6 | 报价 convert 破坏性语义未定 | 物理删除源报价单、订单无 `quote_id`；改动会牵动审计与追溯 | 冻结现状，列入 `decisions.md`，等用户拍板 |
| R7 | 313 张表 + 生成注册表 | 手改生成物或多处并发改同一文件必然漂移 | 只用 `yarn generate`；文件域分派（§7） |
| R8 | **验证层比它自称的弱** | 子审计 D 抽查并经我复核：`jest.config.cjs:10 passWithNoTests:true`、`:36 diagnostics:false`（0 测试也绿）；`.ai/qa` 只有 config、**0 个 spec**（`yarn test:integration` 不证明任何事）；`build:inner` **不含 lint/typecheck/test**；`check-contrast.mjs:41` 用 `.filter(([, el]) => el)` 丢掉未渲染元素、`:74` 分母随样本减少（被踢回登录页仍报 PASS）；`hooks:check` 恒退出 0 | 先记为风险；修法见 `backlog.md` M0-8（只做加强，不改判据） |

### 4.1 R8 已修部分（本轮，只加强不放宽）

| 缺陷 | 修法 | 正向证据 | 负向对照 |
|---|---|---|---|
| `check-contrast.mjs` 丢样本后仍 PASS | 断言落地 URL + 样本数下限；`CONTRAST_PAGE` 可注入以便测试 | `12/12 within AA`（**此前报 10/10 其实每主题只测到 5 个样本**，primary button 选择器漏了 `<a>`） | `CONTRAST_PAGE=/login` → exit 1：`measured /backend instead of /login … refusing to pass` |
| Jest `passWithNoTests:true`（0 测试也绿） | 删除该开关 | 8 suites / 40 tests 全绿 | `yarn test --testPathPattern=__none__` → exit 1 |

仍未修（留给 M0-8 后续）：`.ai/qa` 0 个 spec、`build:inner` 不含 typecheck/lint/test、`hooks:check` 恒退出 0。

## 5. 工程边界（本轮确认，不越线）

- 不改 `node_modules`；框架改动走既有 mirror 源码 + `vendor/open-mercato/prebuilt` + 受管补丁（`scripts/patches/manifest.json`，现 11 条 / 22 目标）。
- 不手改 `.mercato/generated/**`；改完声明跑 `yarn generate`。
- 迁移：只生成与审阅 SQL，**应用迁移需要用户批准**。
- 未获批准不做：迁移应用、生产发布、真实外发、购买付费服务、破坏性删除。
- 单公司内部多部门多员工，不做 SaaS；不重写 Agent 内核。

## 6. 本轮不执行

- 未跑任何 migration、未改数据库结构与数据。
- 未做真实邮件/社媒外发、未调用付费 API。
- 未改报价 convert 语义。

## 7. 并行只读子审计（本轮启动）

| 代号 | 范围 | 产物 | 状态 |
|---|---|---|---|
| A | 业务导航/运行入口审计 | 入口映射原始清单（标签/路由/来源模块/权限/重复） | 运行中 |
| B | CRM 授权与数据范围 + DSH 安全扩展点 | 授权链、可复用 API、安全缺口 | 运行中 |
| C | 获客渠道/校验/配额/审批复用 | 复用表 + 缺失项 + 需用户决策的业务规则 | 运行中 |
| D | 独立 QA 验收设计 | 里程碑→验收→证据矩阵 + 对抗性安全用例 | 运行中 |

子审计结论未写回本文前，本文所有判断只以 §1–§5 的亲自核对事实为准。

## 3.1 报价修复回归（可复跑，2026-11-08）

`node scripts/crm-quote-regression.mjs` —— 每次改动后重跑，输出 `docs/crm-platform/regression/quote-<日期>.md`。

| 用例 | 实测 |
|---|---|
| 错误 payload 键（`{id}` 而非 `{quoteId}`） | **422** + `details[0].path=["quoteId"]` |
| 草稿转订单 | **409**「报价单当前状态为「draft」，需先发送并确认后才能转订单。」 |
| 副作用检查 | 订单 4 → 4，报价仍 `draft|USD`（未被删除） |
| 字典 **条目** 标签控制字符 | 0 |
| 字典 **名称** 控制字符 | **19（已知遗留）** |

**需要更正一处旧表述**：之前说「字典尾随 CR 已修」只对**条目（entries）**成立。**字典名称（dictionaries.name）仍有 19 条带 CR**——`applySnapshot` 的清洗是写入口拦截，不会回改历史行。

这 19 条不是回归，是需要一次性数据清洗的遗留项；清洗属于写数据，**需你批准后**再做（或改为只读导出+人工确认）。
