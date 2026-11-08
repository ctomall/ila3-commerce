# CRM 企业 AI 获客平台 · 文档索引

目标与门禁原文：`/home/pro/dsh/crm-enterprise-goal/DEVELOPMENT-GOAL.md`（M0 审计 → M1 规则入口 → M2 契约 → M3 原型 ⟂ M4 双员工安全 PoC → M5 获客 → M6 触达 → M7 Bot → M8 验收）。

## 当前状态

| 里程碑 | 状态 | 本目录产物 | 证据锚点 |
|---|---|---|---|
| M0 现状审计 | **done** | `00-m0-baseline.md` | 运行入口/分支/服务/DB/贡献者/能力矩阵/风险 R1–R8 |
| M1 入口治理 | **基线完成** | `01-entry-map.md`、`appendix/nav-*.json`、`decisions.md` | `node scripts/crm-nav-baseline.mjs` |
| M2 契约 | **草案完成（待 2 项决策）** | `02-capability-matrix.md`、`03-dsh-contract.md`、`03a-data-model.md` | 授权链行号证据、676/1149 契约计数、五组表设计 |
| M3 原型 | **完成（原型，非生产）** | `04-prototype.md` + `src/modules/crm_prototype/**` | 六页截图 `proto-*.png`；navHidden 使入口数不变 152/150/74 |
| M4 安全 PoC | **计划完成，待路线确认** | `05-security-poc.md` | 7 维隔离 + 7 条对抗用例 + 撤权时序 |
| M5 获客 | **规则层完成** | `06-leadgen.md` + `src/lib/leadgen/verification.ts` | 19 例单测 + 负向对照（5 红）；存储/抽取待 M2-9 与 M4 |
| M6 触达 | **逻辑层完成** | `07-outreach.md` + `src/lib/leadgen/outreach.ts` | 22 例：审批哈希绑定/状态机/unknown 不重发/退订抑制 |
| M7 Bot | 未开始 | （规划：`08-bot.md`） | — |
| M8 试用 | 未开始 | （规划：`09-trial.md`） | — |

## 目录

| 文件 | 内容 |
|---|---|
| `00-m0-baseline.md` | 现状边界：运行时、代码构成、能力矩阵、既有修复保护清单、风险 R1–R8、授权边界 |
| `01-entry-map.md` | 入口基线（三角色服务端 payload）、分区现状、重复/孤儿清单、收敛候选 C1–C7、目标五区映射 |
| `backlog.md` | M0–M8 逐项事项：产物 / 证据 / 状态 |
| `decisions.md` | D1–D14 待用户拍板的业务与安全规则，每条带建议默认 |
| `audit/a-nav-entries.md` | 子审计 A：后端入口与导航（270 页 / 701 API / 10 分区 / Top 10 重复） |
| `audit/b-authz-dsh.md` | 子审计 B：授权链 + AI 扩展面（8 个安全缺口 G1–G8，带行号） |
| `audit/c-leadgen-reuse.md` | 子审计 C：获客/触达可复用面（复用 vs 新建，8 项缺失） |
| `audit/d-qa-acceptance.md` | 子审计 D：独立 QA 设计（里程碑→证据矩阵、7 条对抗用例、四层完成定义） |
| `audit/e-authz-enforcement.md` | 子审计 E：六个缺口的逐条证据、**不存在 AI 工具拦截缝**、每条的最小强制点与 M4 判定 |
| `02-capability-matrix.md` | 五因子授权、身份模型三选一（选 A）、复用/包装/新建矩阵、G1–G8 处置、契约计数 |
| `03-dsh-contract.md` | 绑定、Run/事件/产物、桥接现实约束、逐次鉴权、隔离、撤离与离职 |
| `03a-data-model.md` | 五组表（候选/配额/审批发送/抑制/绑定）+ 幂等键组合 + API 面 + UMES + 迁移约定 |
| `06-leadgen.md` | 确定性验证规则 + 配额算术：判决、去重键、有效≠可触达、测试映射与负向对照 |
| `07-outreach.md` | 审批门（哈希绑定）、发送状态机、回复分类与抑制 |
| `appendix/nav-*.json` | 三角色导航快照（已剔除内联 SVG，~90% 体积） |

## 门禁现状（2026-11-08 实测）

`verify-patches` 11 patch / 22 target · `patches:budget` 11/15 · `ui-regression` 18/18 · 对比度 **12/12**（修前是「10/10」但每主题只测到 5 个样本）· jest 40 tests · `yarn build` BUILD_OK。

## 纪律

1. 每条结论带证据（命令输出 / 截图 / 行号）；无证据写「未核对」。
2. 未定规则进 `decisions.md`，不静默猜。
3. 迁移只生成与审阅 SQL；**应用迁移、生产发布、真实外发、破坏性操作需另行批准**。
4. 框架改动只走 mirror + `vendor/open-mercato/prebuilt` + 受管补丁；不直接改 `node_modules`，不手改 `.mercato/generated/**`。
