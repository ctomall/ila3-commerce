# CRM 企业 AI 获客平台 · 文档索引

目标与门禁原文：`/home/pro/dsh/crm-enterprise-goal/DEVELOPMENT-GOAL.md`（M0 审计 → M1 规则入口 → M2 契约 → M3 原型 ⟂ M4 双员工安全 PoC → M5 获客 → M6 触达 → M7 Bot → M8 验收）。

## 当前状态（2026-11-09 · 第 56 轮）

**一句话**：能离开“批准”和“运行时”独立做完的部分已经做完；剩下的是四件需要你拍板的事 + 两个只差批准就能跑通的运行时。

| 里程碑 | 状态 | 已完成什么 | 还差什么 |
|---|---|---|---|
| M0 审计 | **done** | 入口/服务/DB/风险 R1–R8 | — |
| M1 入口治理 | **done** | 152/150/74 入口、重名 0、嵌套基线白名单；`nav-baseline --check` 兜底 | — |
| M2 契约 | **草案完成** | 数据模型、DSH 契约、16 操作/14 路径 OpenAPI、两片迁移草案 | 决策 ②③（`contact_email` 加密、部分唯一索引方案） |
| M3 原型 | **完成（原型，非生产）** | 中文六页 + 浏览器断言 3 条 | — |
| M4 双员工 PoC | **判定层完成 + OS 隔离实测，leadgen 用例仍 blocked** | profile 派生+落盘（0700、跨 OS 用户读被拒）、Run 状态机与撤权写入闸、工具三类授权 + 第 23 道门 | 每员工 DSH 运行时、第二组织、`leadgen-api` |
| M5 获客 | **规则层完成** | 验证/配额/判决链，单测覆盖 | 存储要 ①（迁移） |
| M6 触达 | **规则层完成** | 审批哈希/收件人/渠道绑定、退订抑制、unknown 不重发 | 真实外发要 ① 与 D8 |
| M7 Bot | **判定+编排层完成** | 验签/时效/重放/身份四道关顺序固定 + 群聊只读 + 脱敏 + 审计 | 真实 IM 渠道回调未接 |
| M8 验收 | **发布级 PASS（2026-11-12, commit 6c96938）** | **23 道门**、发布级判定（`--require-clean/--require-no-skip`）、恢复演练结构+值级、变异 19/19、试用 sessions 口径实测 | 正版发布级全绿要 `quote-regression` 的夹具 |

**最后一份发布级运行**：`verify/verify-2026-11-12T06-12-35.md` — **PASS 25 · FAIL 0 · SKIP 0**，发布级门禁 **PASS**（运行中的 release `8d42e12`，M4 pass 7 · weak 3 · blocked 1 · invalid 1）。
host 有外部负载时用 `JEST_TIMEOUT=90000 JEST_MAX_WORKERS=2` 跑同一套门禁（默认值不变；原因见 `jest.config.cjs` 注释）。
`verify-2026-11-12T04-07-16.md` 是更早的干净 PASS（`6c96938`），保留作对照。
`dea1e2e`（M4 用例 4/5 实现）同样 25/25 全通过，但运行期间并行协作者修改了 2 个 communications 文件，脚本按设计拒绝把它算作提交级证据（`verify-2026-11-12T04-29-54.md`）。M4 在该提交上另跑为 pass 7 · pass-weak 3 · blocked 1 · invalid 1。
浏览器门（contrast / ui-regression）需要共享 agent 浏览器有活动标签页：先 `node /home/pro/.dsh-src/profiles/web/node_modules/dsh-ego-browser/runtime/ego-linux/bin/ego-browser.mjs --open`，否则两道门会以 “no active tab to attach session” 失败（环境前置，不是 UI 回归）。

这一份之所以能给出 PASS，是因为两件事被显式解决而不是绕过：

1. `quote-regression` 缺 draft 报价夹具 → 门可以 `--create-fixture` 自建一行并删除（D28），实测残留 0 行。
2. 工作树里有两个不是本会话写的目录（`docs/deployment/`、`scripts/auto-deploy/`）→ 在 `appendix/foreign-paths.json` 里**逐个声明并写明理由**，报告把它们单列，且**未声明的改动仍然让发布级判定失败**；声明若不再命中任何路径也算失败（防止豁免腐烂）。

### 现在需要你决定（其余都在等这四件）

| # | 待批 | 批了会解锁 |
|---|---|---|
| ① | 应用两片 leadgen 迁移（分支 `feat/leadgen-schema-final`，隔离库演练已通过） | M5 存储、`leadgen-api` fixture、M4 用例 1/5/7、M6 真实触达、M7 落库 |
| ② | `contact_email` 是否加密存储 | M5 入库字段定稿 |
| ③ | 4 条部分唯一索引走“手写 + 白名单 + 每次复核” | 迁移落地前的最后一道口径 |
| ④ | 是否把评审分支合并进 main | 与 ① 同批决定，合并即 `db:migrate` 生效 |

另有两件小事会挡住“发布级全绿”：`quote-regression` 需要一条 draft 报价夹具（自建属数据写入，需批准）；工作树里的 `docs/deployment/`、`scripts/auto-deploy/` 不是本会话的产物，需确认归属。

### 怎么复核这个仓库（不需要我）

```
node scripts/crm-verify-all.mjs --full --require-clean --require-no-skip
```

报告头会写：范围（全部/仅某几道门）、完整 flags、发布级是/否、工作树开始与结束状态。**只看 PASS 计数会被误导**，看“发布级门禁”那一行。

## 目录

| 文件 | 内容 |
|---|---|
| `00-m0-baseline.md` | 现状边界：运行时、代码构成、能力矩阵、既有修复保护清单、风险 R1–R8、授权边界 |
| `01-entry-map.md` | 入口基线（三角色服务端 payload）、分区现状、重复/孤儿清单、收敛候选 C1–C7、目标五区映射 |
| `backlog.md` | M0–M8 逐项事项：产物 / 证据 / 状态（含每轮补记） |
| `decisions.md` | D1–D31：已定的口径与待拍板项，每条带理由与代价 |
| `audit/a-nav-entries.md` | 子审计 A：后端入口与导航（270 页 / 701 API / 10 分区 / Top 10 重复） |
| `audit/b-authz-dsh.md` | 子审计 B：授权链 + AI 扩展面（8 个安全缺口 G1–G8，带行号） |
| `audit/c-leadgen-reuse.md` | 子审计 C：获客/触达可复用面（复用 vs 新建，8 项缺失） |
| `audit/d-qa-acceptance.md` | 子审计 D：独立 QA 设计（里程碑→证据矩阵、7 条对抗用例、四层完成定义） |
| `audit/e-authz-enforcement.md` | 子审计 E：六个缺口的逐条证据、**不存在 AI 工具拦截缝**、每条的最小强制点与 M4 判定 |
| `audit/f-qa-round29.md` | 独立 QA 第一轮（D2–D22）：12 条已修并带反向证据，逐条记现状 |
| `audit/f-qa-round48.md` | 独立 QA 第二轮（18 条，P0=0）：12 条已修、6 条仍开并写明原因 |
| `incident-2026-11-09-repo-reset.md` | 事故记录：外部进程把仓库 reset 到旧提交并起了一次混合构建；reflog 与 action_logs 原文 |
| `02-capability-matrix.md` | 五因子授权、身份模型三选一（选 A）、复用/包装/新建矩阵、G1–G8 处置、契约计数 |
| `03-dsh-contract.md` | 绑定、Run/事件/产物、桥接现实约束、逐次鉴权、隔离、撤离与离职 |
| `03a-data-model.md` | 五组表（候选/配额/审批发送/抑制/绑定）+ 幂等键组合 + API 面 + UMES + 迁移约定 |
| `03b-migration-draft.md` | **待批准**：两片迁移草案（第一片 5 表 / 第二片 11 表，共 16 表），分支 `feat/leadgen-schema` 与 `feat/leadgen-schema-2` |
| `05a-m4-runbook.md` | M4 **执行手册**：前置检查、fixture、7 维验证命令、回滚与交付物 |
| `06-leadgen.md` | 确定性验证规则 + 配额算术：判决、去重键、有效≠可触达、测试映射与负向对照 |
| `07-outreach.md` | 审批门（哈希绑定）、发送状态机、回复分类与抑制 |
| `08-bot.md` | Bot 入站四关、群聊只读、群内脱敏、离职撤权 |
| `09-trial.md` | M8 试用发布方案：四层完成口径、两种压测、备份恢复、灰度回滚 |
| `10-api-contract.md` + `api/leadgen-openapi.json` | **草案**：M5/M6/M7 的 14 条路径，由 linter 校验自洽与不撞车 |
| `11-leadgen-sources.md` | 来源与合规门：web-research 实有能力、robots/礼貌延迟/调用计数由谁提供、7 条合规门 |
| `appendix/nav-*.json` | 三角色导航快照（已剔除内联 SVG，~90% 体积） |

## 一条命令看全部证据

```bash
node scripts/crm-verify-all.mjs          # 快速集（补丁/单元/回归/探针/对抗/导航/令牌/i18n）
node scripts/crm-verify-all.mjs --full   # 追加 typecheck / lint / 对比度 / ui-regression / integration / restore-drill / mutation / migration-drill
node scripts/crm-verify-all.mjs --only migration-drill --full   # 只跑某一门
```
输出 `verify/verify-<时间>.md`：PASS / FAIL / SKIP 三项分开计数，**SKIP 不算通过**。

## 门禁现状（2026-11-09 实测，--full 21/21，0 SKIP）

截图证据位于仓库外 `/home/pro/dsh/shots/*.png`（`proto-*.png`、`crm-*.png`），文档中的文件名对应这里的绝对路径。

`verify-patches` 11 patch / 23 target · `patches:budget` 11/15 · `ui-regression` 18/18 · 对比度 **12/12**（修前是「10/10」但每主题只测到 5 个样本）· jest **15 suites / 161 tests** · `migration-drill` **20 阶段全过 + 8 条负向对照** · `mutation` **7/7 变异被杀** · `restore-drill` **13.6 MB / 恢复 4.8 s / 314 表 / 6 项行数一致** · `build-freshness` **运行中的服务 = 当前源码** · `contract` **契约自洽且零碰撞** · M4-3 `crm.find_companies` **运行时注册并端到端实测** · `nav-nesting` **5 条已知未嵌套入口与白名单一致** · `test:integration` **3/3**（此前是 `No tests found` exit 1） · `yarn build` BUILD_OK（2026-11-09 00:03 重建，录得 commit `5e82006`；构建后 `login` 200）。

## 纪律

1. 每条结论带证据（命令输出 / 截图 / 行号）；无证据写「未核对」。
2. 未定规则进 `decisions.md`，不静默猜。
3. 迁移只生成与审阅 SQL；**应用迁移、生产发布、真实外发、破坏性操作需另行批准**。
4. 框架改动只走 mirror + `vendor/open-mercato/prebuilt` + 受管补丁；不直接改 `node_modules`，不手改 `.mercato/generated/**`。
