# 追踪矩阵 · 目标条款 → 实现 → 证据

> 口径：**只有带证据的才算 done**。`partial` 表示逻辑/文档到位但未接真实数据；`blocked` 表示等批准或等前置。#D 表示依赖 `decisions.md` 的编号。

## A. 目标与范围

| # | 条款 | 实现 | 证据 | 状态 |
|---|---|---|---|---|
| A1 | 入口收敛 | `01-entry-map.md`；改名去重（2 组 → 0）；`nav-groups` 分组；C5 复核 | `crm-nav-baseline`（152/150/74，重名 0）；`entries.md`；`01` §6.1 | done（C5 定位为上游元数据问题，不加补丁） |
| A2 | 中文业务流程与视觉 | 六页原型（含 8 类状态）；i18n 补键；英文残留扫描 | `proto-*.png`（含 `proto-tasks-cancelled.png`）；`crm-i18n-sweep`；`appendix/i18n-residual.md` | done（原型层） |
| A3 | 员工专属助手 | 绑定模型（员工/助手/策略版本/状态） | `03-dsh-contract.md` §1；`leadgen_employee_bindings` 设计（未建表） | partial |
| A4 | CRM 权限控制 DSH 工具与插件 | 五因子交集；工具集取交集；插件三类；发送身份门拒绝时写结构化日志 | `02` §2；`03` §3.5；`outbound-bridge` 修复（`ownership_rejected` 日志 + `action_logs` 审计行，23 目标） | partial（M4 未执行） |
| A5 | 数据与执行隔离 | 7 维隔离要求；DSH profile/凭据/记忆分区 | `03` §5；`05-security-poc.md` §3 | blocked（无每员工 DSH 运行时） |
| A6 | 获客审核入库 | 候选/证据/验证表设计 + 确定性验证实现 | `03a`；`src/lib/leadgen/verification.ts`（19 测） | partial（无存储） |
| A7 | 受控触达 | 审批门 + 状态机 + 回复分类 | `src/lib/leadgen/outreach.ts`（22 测）；`07-outreach.md` | partial（无 provider） |
| A8 | Bot 绑定 | 守卫：签名/时效/重放/群聊只读/脱敏 | `src/lib/bot/guard.ts`（14 测）；`08-bot.md` | partial（无渠道） |
| A9 | 试用验收 | 四层完成口径、两种压测口径、备份/回滚 | `09-trial.md` | blocked（等 M4） |
| A10 | 单公司内部，不做 SaaS | 全部查询按 tenant+org 派生；无多租户开通面 | `02` §1；`crm-security-probe.mjs` | done |
| A11 | 不重写 Agent 内核 | 复用 ai-assistant 注册表与授权；无 fork | `02` §3；`audit/e` 拦截缝结论 | done |
| A12 | CRM 权威、DSH 执行 | 桥接契约：事件单向、身份由后端注入 | `03` §1 §3 §4 | partial（DSH 侧未接） |
| A13 | **助手权限 ≤ 员工当前权限** | 选 A：员工身份 + 逐次重鉴权；G2 是硬阻塞 | `02` §2 §4；`audit/e` §3 | blocked（G2 + 路线） |

## B. 阶段门禁

| 阶段 | 要求 | 证据 | 状态 |
|---|---|---|---|
| M0 | 运行入口/分支/服务/DB/模块/权限/他人改动 + 能力矩阵与风险 | `00-m0-baseline.md` §1–§4（R1–R8） | done |
| M0 | 保护既有报价订单修复 | `scripts/crm-quote-regression.mjs`（4 pass + 1 已知） | done |
| M0 | 报价 convert 语义不擅改 | 未改动；D1 待决 | done |
| M1 | 全量入口清单（名称/路由/模块/角色/用途/重复） | `01-entry-map.md` + `appendix/nav-*.json` | done |
| M1 | 骨架五区与现行声明核对 | 同上 §8（只有「客户开发」新建） | done |
| M1 | 候选入库/去重/归属/外发/导出/转交/离职规则 | `decisions.md` D1–D14 | partial（14 条待拍板） |
| M1 | 不以模块数决定菜单数 | 五区由承载条目决定；空区不建 | done |
| M2 | 复用 auth/directory/staff/ACL/rbacService | `02` §1 §3（带行号） | done |
| M2 | 执行权限五因子交集 | `02` §2；`03` §4 | done（契约层） |
| M2 | 默认拒绝 / 后端注入身份 / 模型不能选操作者 | `02` §2 四条规则；Bot 守卫 `canAct` | partial（G1/G2 未闭） |
| M2 | 绑定 / 策略版本 / Run·事件·产物 / 候选·证据·验证 / 配额 / 审批发送 / Bot 设计 | `03`、`03a`、`03b` | done（设计） |
| M2 | DSH 适配：幂等/取消/游标/预算/继承/撤权 | `03` §3.2–§3.4 §6 | done（契约层） |
| M2 | 迁移先审阅后申请 | `03b-migration-draft.md` §3.2：隔离库上真实 CLI 应用 2 条、16 表、漂移零差异、`down()` 干净回滚、再 `up()` 一致；分支 `feat/leadgen-schema-final`，生产库未写入 | done（演练完成，待批应用） |
| M3 | 六页连贯原型 + 中文 + 表格优先 + 抽屉 + tokens | `src/modules/crm_prototype/**`；`04-prototype.md` | done |
| M3 | 状态覆盖（无权限/空/错误/预算/重复/冲突/发送未知/断线取消） | 每页状态切换器；任务页新增「已取消」；`proto-tasks-cancelled.png`、`proto-candidates-duplicate.png` | done |
| M3 | AI 随业务动作出现，不新增平行工作台 | 首页「让助手继续调研」；详情「AI 建议 · 需人工确认」 | done |
| M4 | 两个测试员工 / 两个助手 / 一个 CRM 只读工具 | `05` §2（计划） | blocked（路线 + 测试组织） |
| M4 | 猜 ID / 直连 API / 伪造身份拒绝 | `scripts/crm-m4-harness.mjs`：#1 #2 #3 pass | partial（3/7 可跑） |
| M4 | 子 Agent 不扩权 / 撤权影响旧任务 / 7 维隔离 | `05` §3 §4 用例已定义 | blocked（DSH 侧） |
| M4 | 插件三类（每用户/实例全局/高权限） | `05` §3 第 7 条 | blocked |
| M5 | 一产品一市场 + 公开来源 | 未开始 | todo（等 D8/路线） |
| M5 | 任务→额度→调研→候选→验证→去重→审核→幂等入库 | 验证/配额/去重规则已实现；Run 与存储未建 | partial |
| M5 | 公司有效 ≠ 可触达；MX 弱信号；不猜造联系人 | `src/lib/leadgen/verification.ts`（3 条专项测试） | done（规则层） |
| M5 | 候选/任务/审核/验证/阶段分开建模 | `03a` 五组表 | done（设计） |
| M5 | 重复不泄漏他人客户信息 | 原型重复态文案 + `01` §4 | done（原型层） |
| M6 | 草稿→审批→幂等发送→回执→回复分类 | `outreach.ts`（22 测） | partial（无 provider/回执表） |
| M6 | 额度/抑制/退信投诉/重复防护 | `quota.ts`；`outreach.ts` 抑制与分类 | partial（无存储） |
| M6 | 真实渠道验收 + 域名认证 | 未开始 | blocked（D8） |
| M7 | 单渠道绑定、验签、防重放、群聊限制 | `src/lib/bot/guard.ts`（14 测） | partial（无渠道适配器） |
| M7 | 离职解绑 + 发送时重新鉴权 | `canAct` 判定 + `03` §6 | partial（无存储） |
| M8 | 试用 + 两种压测口径 + 备份恢复 + 灰度回滚 | `09-trial.md` | blocked（等 M4） |

## C. 工程与授权边界

| # | 约束 | 遵守情况 | 证据 |
|---|---|---|---|
| C1 | 不直接改 node_modules | 遵守：mirror 源码 + `vendor/open-mercato/prebuilt` + 受管补丁 | `scripts/patches/apply-vendor-source-build.mjs`（12 文件） |
| C2 | 不手改生成物 | 遵守：只跑 `yarn generate` | 本轮无 `.mercato/generated` 手改 |
| C3 | 迁移先审阅、应用需批准 | 遵守：迁移只在分支，生产库 0 张 leadgen 表（迁移前后指纹 `314\|0\|0\|46`） | `03b` §3.2；`scripts/crm-migration-drill.mjs` |
| C4 | 生产发布/真实外发需批准 | 遵守：未发布、未建 provider、未发信 | 本轮 commit 无部署动作 |
| C5 | 不为测试触达真实客户 | 遵守：无任何真实外发 | `07` §6；`poc` 探针零写入 |
| C6 | 不泄漏密钥/会话 | 遵守：脚本只读凭证文件、不打印 | `scripts/lib/session.mjs` |
| C7 | 主 Agent 亲自复核子 Agent 结论 | 已执行：两处子审计结论被推翻并留勘误 | `audit/a` 勘误、`audit/b` 勘误 |
| C8 | 每项有输入/产物/证据/完成标准/阻塞 | 见 `backlog.md` | 逐项列 |

## D. 当前唯一的"完成"总账

| 结论 | 支撑 |
|---|---|
| 代码门禁全绿 | `node scripts/crm-verify-all.mjs --full` → 20/20，0 SKIP（`verify/` 下最新一份） |
| 既有报价修复未回归 | `crm-quote-regression` 4 pass + 1 已知 |
| 授权基线未退化 | `crm-security-probe` 14 例 |
| M4 尚不能通过 | 7 条对抗只有 3 条可跑，4 条缺 fixture |

**不成立的声明（不得对外说）**：M4 已通过、DSH 隔离已验证、真实外发已验证、试用已开始。
