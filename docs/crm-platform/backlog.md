# 分阶段 Backlog · CRM 企业 AI 获客平台

状态口径：`todo` 未开始 · `doing` 进行中 · `blocked` 等决策/授权 · `done` 有证据完成。
**「done」只认证据，不认自报**：每项必须有可复现命令或截图/日志，见「证据」列。

## M0 现状审计

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M0-1 | 读项目规范（AGENTS/CLAUDE/`.ai`） | 本目录 `00-m0-baseline.md` §5 | 文件存在 + 引用了具体条款 | done |
| M0-2 | 运行入口/分支/未提交/服务/DB/贡献者核对 | 同上 §1 | `systemctl is-active`、`git status`、`psql count(*)` 输出 | done |
| M0-3 | 代码构成与「改哪里」边界 | 同上 §1.2 | 目录计数、`modules.generated.ts` 统计 | done |
| M0-4 | 能力矩阵（复用/包装/新建） | 同上 §2 + `02-capability-matrix.md` | 每条带位置 | done |
| M0-5 | 风险清单 | 同上 §4 | R1–R8 共 8 条，含已修的 R1/R8 | done |
| M0-6 | 既有报价/订单修复保护清单 | 同上 §3 | 五项修复 + 当前门禁数字 | done |
| M0-7 | 四路只读子审计 A/B/C/D | `audit/{a,b,c,d}-*.md` | 四份原文归档，关键结论由主 Agent 抽查复核 | done |
| M0-8 | 验证层加固（只加强不放宽） | ① `check-contrast` 断 URL+样本数（12/12，负向 exit 1）；② `jest` 去 `passWithNoTests`（负向 exit 1）；③ `security-probe` 开始会 exit 1（负向 exit 1）；④ `crm-verify-all` 纳入 `tokens`/`i18n-hardcoded`/`lint` | 剩余：`build:inner` 未加 typecheck/lint（构建时长风险，留待发布流程单独决策）、`hooks:check` 恒 0（自述 informational）。~~`.ai/qa` 0 spec~~ → 已补 3 条浏览器断言并成为第 15 道门 | done（可做的已做） |

## M1 业务规则与入口治理

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M1-1 | 入口清单基线 | `01-entry-map.md` + `appendix/nav-*.json` | 服务端 payload：superadmin 152 / admin 150 / employee 74；复跑 `node scripts/crm-nav-baseline.mjs` | done |
| M1-2 | 重复/孤儿/兼容映射判定 | 同上 §4–5 | Top 10 重复 + 5 类孤儿/断链/假声明；其中 2 条由主 Agent 亲自复核 | done |
| M1-3 | 目标骨架与现行声明核对 | 同上 §8 | 五区逐区列承载；只有「客户开发」因 M5 两页而新建 | done |
| M1-4 | 候选入库、去重、归属、外发、导出、转交、离职规则 | `decisions.md` D1–D14 | 14 条待决，全部带建议默认 | doing |
| M1-5 | 门集完整性审计：存在但没进门的脚本 | 本轮 | 26 个脚本逐个核对，找出两处实质缺口：`crm-contract-check`（契约一直自洽但没人跑它）与 `crm-nav-nesting-check`（默认只是报告，`--strict` 因 5 条上游问题永远红）。前者直接进门；后者改为白名单比对——多一条或修好一条都红，两个方向各有负向对照 | done |

## M2 契约

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M2-1 | 授权链核验 | `02-capability-matrix.md` §1 + `audit/{b,e}` | 链图带行号；G1/G2/G3/G7 由主 Agent 亲自复核 | done |
| M2-2 | AI 能力契约 | 同上 §3 | agent 门 `agent-policy.ts:178`、tool 门 `:208`、7 处 `hasRequiredFeatures` 调用点 | done |
| M2-3 | 绑定 / 策略版本 / Run·事件·产物 | `03-dsh-contract.md` §1 §3 | 状态机 + 幂等键 + 重连游标 + 预算 | done |
| M2-4 | 候选/配额/审批发送/抑制/Bot 表 | `03a-data-model.md` | 五组表 + 唯一索引 + 幂等键组合 + API 面 | done |
| M2-5 | 执行权限交集 | `02` §2 + `03` §4 | 选定「员工身份 + 逐次重鉴权」；五因子落到具体函数 | done |
| M2-6 | DSH 适配语义 | `03` §3 §6 | 幂等/取消/游标/预算/继承/撤权各有断言；并记录「无拦截缝」约束 | done |
| M2-7 | 带凭证重拉 openapi | `02` §6 | 676 paths / 1149 ops，未带凭证 401 | done |

### 新增 M2 决策项（阻塞 M4 或实现）

| # | 事项 | 需要谁定 | 现状 |
|---|---|---|---|
| M2-8 | M4 走「关工具」还是「改上游」 | 用户 | `03` §3.5：两条路二选一，未定前 M4 只演示只读 |
| M2-9 | 是否接受 `leadgen` 模块启用 + 迁移 | 用户 | **已演练**：`03b` §3.2 —— 隔离库上真实 CLI 应用 2 条、16 表、漂移零差异、`down()` 回滚干净、再 `up()` 复现一致；生产库零写入。仍需你批准才应用 |
| M2-10 | 迁移演练门（防止未经演练就应用） | 本轮 | `scripts/crm-migration-drill.mjs` + `crm-migration-drill-gate.mjs` 成为 `--full` 第 14 门；可直接从评审分支取迁移文件跑；PASS/FAIL/SKIP 三条路径 + 4 条负向对照全部验过 | done |

## M3 原型（六页）

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M3-1 | 六页连贯原型 | `src/modules/crm_prototype/**` + `04-prototype.md` | 六页截图 + 页签可达；`proto-*.png` | done |
| M3-2 | 视觉与密度 | 同上 | 对比度 12/12、ui-regression 18/18、typecheck 0 | done |
| M3-3 | AI 随业务动作出现 | 同上 §2/§4 | 首页「让助手继续调研」、详情页「AI 建议 · 需人工确认」 | done |
| M3-4 | 原型六页的浏览器验收（替代截图验收） | `04-prototype.md` §8 | `.ai/qa/tests/crm-prototype.spec.ts` 3 条：六页 200 + 横幅文案、子导航 aria-current 唯一且正确、真实后台页无横幅且侧栏无入口、匿名拿不到；一次登录；负向对照（改坏路由→exit 1）验过；已是第 15 道门 | done |

## M4 双员工安全 PoC（硬门禁）

> 计划已落 `05-security-poc.md`；**执行前需用户选定路线**：A 关工具（应用内，不需批准）或 B 改上游（需批准）。

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M4-1 | 两个测试员工、两个专属助手 | `05-security-poc.md` §2 | 计划已写；执行待路线确认 | blocked |
| M4-0 | 安全基线与探针脚本 | `scripts/crm-security-probe.mjs` + `poc/` | 14 例 / 14 符合 / 5 张表零写入；**脚本现在会 exit 1**（负向对照：改期望 → exit 1） | done |
| M4-0b | 对抗执行器（12 条） | `scripts/crm-m4-harness.mjs` + `poc/<日期>-m4/` | **5 pass · 2 弱通过 · 0 fail · 4 blocked · 1 invalid**；#3.1 伪造操作者已由 `context_whoami` 探针执行（注入三个 actor 字段后解析出的 id 与基线一致），fixture 由「未注册探针工具」变为「运行时工具表里查到」 | doing |
| M4-0c | 执行手册 | `05a-m4-runbook.md` | 前置检查 + fixture + 7 维命令 + 回滚 + 四份交付物 | done |
| M4-2 | 隔离 DSH 数据/执行环境（会话/订阅/任务/文件/记忆/凭据/浏览器态） | 同上 | 7 类隔离逐条证据 | todo |
| M4-3 | 一个 CRM 只读工具 | `12-crm-tool.md` | **已完成**：`crm.find_companies`（`src/modules/crm_tools/`，18 测）+ 运行时注册实测（97 工具内含它）；端到端七项：401 / 200 明文数据 / scope 回显 / 注入 tenantId 400 / limit 500 → 400 / 未知工具 400 / employee 角色 200。端到端跑出并修掉两个单测抓不到的缺陷（knex 占位符、ORM 解密被绕过）| done（403 路径缺 fixture）|
| M4-4 | 对抗用例：猜 ID / 直连 API / 伪造操作者 / 子 Agent 扩权 / 撤权后在途任务 | `crm-m4-harness.mjs` | 已跑的记 pass/弱通过；缺 fixture 的记 blocked，**不计入通过** | doing |
| M4-5 | 插件分三类（每用户能力/实例全局/高权限）并处置共享实例 | 同上 | 分类表 + 不可信的隔离处置 | todo |

## M5 获客 MVP

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M5-1 | 一产品一市场，公开来源与合规门 | `11-leadgen-sources.md` | 包能力实测（无 robots）+ 7 条合规门；robots 组件 10 测试 | partial（方案 + robots 组件；抓取未开始） |
| M5-2 | 任务→额度预留/排队→DSH 调研→候选提交 | `06` §9（配额算术） | 预留/消费/退还/过期回收 | 部分（算术层） |
| M5-3 | 确定性验证（不猜造联系人，MX 只作弱信号） | `src/lib/leadgen/verification.ts` + `06-leadgen.md` | 19 例单测；负向对照（改判规则 → 5 红） | done（规则层） |
| M5-3b | 联系人抽取器 | 依赖 DSH 侧 | — | blocked（M4 路线） |
| M5-4 | 公司级去重/归属冲突→人工审核→幂等入库 | 同上 | 重复注入两次的返回 | todo |
| M5-5 | 客户阶段/归属与候选/任务/审核/验证分开建模 | 同上 | 表关系图 | todo |

## M6 受控触达

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M6-1 | 草稿→审批→幂等发送→回执→回复分类 | `src/lib/leadgen/outreach.ts` + `07-outreach.md` | 19 例（门/状态机/分类）；负向对照 9 红 | done（逻辑层） |
| M6-2 | 额度、退订抑制、退信投诉、重复防护 | `src/lib/leadgen/quota.ts` + `06` §9 | 10 例：四层取小、lease、过期回收、幂等 | done（算术层） |
| M6-3 | 真实渠道验收 + 域名认证 | 同上 | **需用户批准真实外发** | blocked |
| M6-4 | 四层规则串成判决链 | `06-leadgen.md` §10 | `src/lib/leadgen/pipeline.ts` + 20 测：验证→人审→可达性→配额→草稿→审批→发送门，每阶段 continue/handoff/stop；负向对照（拆掉人审门→测试红）验过；无 IO、不发送、`deliverability` 恒 unknown | done |

## M7 Bot

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M7-1 | 绑定真实员工、验签、防重放、群聊限制 | `src/lib/bot/guard.ts` + `08-bot.md` | 14 例；负向对照 4 红 | done（守卫层） |
| M7-2 | 离职解绑、发送时重新鉴权 | 同上 §5 | revoke/offboard/离职三种拒绝 + 逐消息判定 | done（判定层） |

## M8 试用发布

| # | 事项 | 产物 | 证据 | 状态 |
|---|---|---|---|---|
| M8-1 | 试用；两种口径分别压测 | `09-trial.md` §2 §6 | 方案已写；执行待 M4 通过 | blocked |
| M8-2 | 备份恢复、版本固定、灰度回滚 | 同上 | **备份恢复已自动化且比对到结构与内容**：`scripts/crm-restore-drill.mjs` 第 18 道门——dump 14.7 MB / 2.1 s，`pg_restore` 4.5 s；结构摘要覆盖 4076 列 / 1027 索引 / 3005 约束 / 53 序列（`scripts/lib/catalog-digest.mjs`），探针表另比整表内容摘要。**比对器每次运行先做反向自证**（同构 schema→0 差异；多索引/多列/丢序列/丢外键各自必须被点名）。真实数据反向证据：删 `sales_quotes_acceptance_token_unique` → 点名缺失索引与约束；改一行 `users.email`（行数 3→3 不变）→ 内容摘要判红，旧实现两种都放行。既有负向对照仍在（截断归档→FAIL、预存库→拒绝且不删、指向源库→拒绝）| done（结构+值级）|
| M8-2b | 版本固定与灰度回滚 | 同上 | 需发布决策（镜像/版本钉住、回滚剧本），依赖 ①迁移与生产发布批准 | todo |
| M8-3 | 四层完成口径 | `09-trial.md` §1 | 四层判据 + 拒收条件 | done（口径） |
| M8-4 | 字典名称 CR 清理的审计与可回滚演练 | 用户批准 | `scripts/crm-dict-cr-audit.mjs`（只读）：19/19 行带尾随 CR、291 条条目 0 CR、同 scope 无撞名；`dict-cr-cleanup.sql` 在事务内干跑六项断言全中、回滚逆操作实测恢复 19 条；生产库仍 19/19 未变 | 待批准执行 |
| M8-5 | 独立 QA 复核第 25–28 轮新增（三个只读 Agent） | `audit/f-qa-round29.md` | 6 条 P1/P2 可复现缺陷全部当轮修掉并各配负向对照；5 条明确列为"承认但不修"并写进文档；修完单元 143、门禁 16/16 | done |
| M8-6 | 变异门：证明规则层测试真的会红 | QA 结论 | `scripts/crm-mutation-check.mjs`：7 个变异全部被杀；存活/锚点失效都让门失败；改源在 finally 按 SHA-256 还原 + exit 兜底；三条路径实测 | done |
| M8-9 | 每员工 DSH profile 派生 + 隔离不变量（M4 派生层） | `src/lib/dsh/profile.ts`、`scripts/crm-dsh-profile-check.ts`（第 22 道门） | 用真实登录态的工具清单当输入：employee 78 / admin 97 个工具与运行时逐个一致；子请求越界被丢弃并记原因；父集为空时 78 个全部被提权告警点名；两个真实员工 key 不同、四个根目录无重叠、路径不含任一方 userId；换策略版本记忆重新分区；撤权失败关闭。**运行时隔离（DSH 是否真按这些根目录隔离、在途 Run 是否 ≤10s 停）仍未验 → 用例 4/6 仍 blocked** | done（派生层） |
| M8-8 | 报告自带证据：PASS 行不再是空话，且记录工作树 | 本轮 | `crm-verify-all.mjs`：PASS 行写入该门禁自己的摘要行（可 `evidence: /re/` 指名），报告头记工作树干净/脏与未提交项；新增 `--require-clean`，脏树判失败（实测 exit 1）。同时复核并按反向证据关掉 QA 挂账 D2/D6/D13–D15/D17–D19/D21/D22；D17 本轮实测：给 `postcss.config.mjs` 加一行 → 新鲜度门 exit 1，还原 → PASS。剩 D16（无路由可挂）、D20（带写权限仍可伪造，未签名）仍开 | done |
| M8-7 | 构建新鲜度门：验证「跑着的就是当前源码」 | 本轮 | 构建记录 `03427c5@20:04` 落后于 HEAD，但 dist 里已含 20:08 提交的内容（构建先于提交，属正常）。判据因此改为：运行时文件**内容**在构建后变过、或进程启动早于构建，两条各有负向对照。顺手发现变异门改写源码会顶掉 mtime，与新鲜度门互相打架，已改为还原时保留 mtime。随后真重建（BUILD_OK，commit `5e82006`），21 门全绿 | done |

## M1 收敛执行记录（C3–C4 已完成）

| 项 | 结果 | 证据 |
|---|---|---|
| C3 请假两处同名 | 改名为「请假申请（管理）」/「我的请假」 | 服务端 payload 标题改变，入口数不变 |
| C4 自定义实体两处同名 | 改名为「浏览自定义实体」/「自定义实体设置」 | 同上 |
| AI 智能体两处 | 「AI 智能体设置」 vs app 的「智能体列表」 | 同上 |
| 重名检测 | **0 组重名**（原 2 组） | `appendix/nav-*.json` 去重脚本 |
| 附录 | `appendix/entries.md`（根项 102 / 含子项 152） | 生成脚本 |

## 回归与护栏（新增）

| 项 | 脚本 | 当前结果 |
|---|---|---|
| 报价/订单修复 | `scripts/crm-quote-regression.mjs` | 4 通过 + 1 已知遗留（字典名称 19 条 CR；已审计+事务内干跑，见 `scripts/crm-dict-cr-audit.mjs`，执行待批准） |
| 授权行为基线 | `scripts/crm-security-probe.mjs` | 14 例符合预期、零写入 |
| M4 对抗用例 | `scripts/crm-m4-harness.mjs` | 5 通过 / 2 弱通过 / 4 阻塞 / 1 用例无效（阻塞项见 M4 表） |
| 导航基线 | `scripts/crm-nav-baseline.mjs` | 152 / 150 / 74，重名 0 |
| 英语残留 | `scripts/crm-i18n-sweep.mjs` | 界面无结构英文，命中均为数据 |
| 全量汇总 | `scripts/crm-verify-all.mjs` | `--full` 22/22 通过，0 SKIP（PASS/FAIL/SKIP 分开计）；PASS 行自带门禁摘要，报告头记工作树，`--require-clean` 脏树即失败 |
| 接口契约 | `scripts/crm-contract-check.mjs` | 16 操作 / 14 路径，自洽且与线上 676 条无撞车 |
| 导航嵌套 | `scripts/crm-nav-nesting-check.mjs` | 5 个「有父未嵌套」+ 1 个无父页面 |
| robots 合规 | `src/lib/leadgen/robots.ts` | 11 测试（含 RFC 9309 分组合并） |
| 发送身份门可观测 | `vendor/.../outbound-bridge.js` | 拒绝时写 `ownership_rejected` 日志；**行为未实测**（无 per-user channel fixture） |
| 报价契约面 | `node scripts/crm-quote-regression.mjs` | 同时充当 convert/send 的契约探针 |
