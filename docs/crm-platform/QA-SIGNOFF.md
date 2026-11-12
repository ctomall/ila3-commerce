# ILA3 Commerce × DSH 链路 · 验收对照与 QA 签收表

生成：2026-11-12 · 运行 release：`5a18456`（本轮发布级复验同源）· 基准报告：`verify/verify-2026-11-12T16-17-36.md`（PASS 25/25，0 skip，干净工作树）

状态口径：**代码已写** → **测试通过** → **已部署** → **业务验收**。任一列不是 ✅ 就不能当已签收。
本表只汇总已有证据，不产生新结论；证据链接均在仓库内。

## A. DSH 正式执行适配器

| 验收点 | 代码 | 测试 | 部署 | 业务验收 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 正式聊天入口走 DSH 而非 OpenCode | ✅ `src/app/api/internal/ai-assistant-dsh-chat/**`、proxy 重写 | ✅ 单测 + 代理测试 | ✅ `OM_AI_ENGINE=dsh`（实测见下） | ✅ 公开入口实测：`POST /api/ai_assistant/chat` → 11 个 `dsh.event` 帧 + `dsh_runs` completed | `docs/crm-platform/dsh-integration/EVIDENCE-2026-11-11-REAL.md` §公开入口；脚本 `scripts/crm-public-chat-dsh-probe.mjs` |
| 受控切换与回退 | ✅ `OM_AI_ENGINE` 开关 | ✅ 代理测试覆盖两分支 | ✅ | ✅ 切换记录 | 同上 + `DESIGN.md` |

## B. 一人一助手绑定与 Run 持久化

| 验收点 | 代码 | 测试 | 部署 | 业务验收 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 员工创建/启用即绑定 | ✅ `dsh_assistant_bindings` + 生命周期 | ✅ | ✅ | ✅ 第 3 名员工创建→运行→撤权→停用 | `EVIDENCE-2026-11-12-THIRD-EMPLOYEE.md` |
| Run/幂等/游标/结果落库 | ✅ ORM 仓储（非内存 Map） | ✅ 单测 + 并发/重放 | ✅ | ✅ 重放 409/同一 run | `EVIDENCE-2026-11-11-REAL.md` |
| 重启恢复 / 超时 / 取消 / 断线重连 | ✅ stale-run sweep + 取消 | ✅ 单测 + restart drill | ✅ | ✅ 真实重启：孤儿行 `failed/server_restart`、在飞流终止、新 Run 正常、零 CRM 写入 | `dsh-integration/evidence/restart-drill-2026-11-12T12-29-22-652Z.json` |
| 失败对客户端可见（重放不装成功） | ✅ `replayResponse` 对 `failed` 追加 `error` 帧；`OM_DSH_INIT_TIMEOUT_MS` 可放宽 initialize 上限 | ✅ 路由 39/39 | ✅ release `f2403fb` | ✅ 重放失败 Run 实测 `["error","done"]` | `dsh-integration/evidence/replay-failed-run-2026-11-12T16-53-00Z.json` |

## C. profile / 工具策略 / 撤权 / 隔离

| 验收点 | 代码 | 测试 | 部署 | 业务验收 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 工具集=运行时、子集不变宽 | ✅ `src/lib/dsh/profile.ts` | ✅ `crm-dsh-profile-check` | ✅ | ✅ 派生+落盘 | `verify-*` dsh-profile 门 |
| 逐调用/写入前重新鉴权 | ✅ 工具桥 + 审批闸 | ✅ | ✅ | ✅ 写审批 propose→approve→execute→consume/重放 409 | `EVIDENCE-2026-11-12-WRITE-APPROVAL.md` |
| 两名员工 OS 隔离（非 0700 冒充） | ✅ 每员工 Unix 用户 | ✅ M4 #6 | ✅ | ✅ 双向跨读拒绝、凭据拒绝 | `poc/2026-11-12-m4/matrix.json` |
| 撤权 ≤10s 终止且不再写 | ✅ | ✅ 单测 | ✅ | ✅ M4 #5 实测 | 同上 |

## D. 受控工具桥与真实闭环

| 验收点 | 代码 | 测试 | 部署 | 业务验收 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 复用 `crm.find_companies` 与业务授权 | ✅ `src/lib/dsh/tool-bridge/**` | ✅ | ✅ | ✅ 真实账号查询 | `EVIDENCE-2026-11-11-*.md` |
| 本人/团队/组织范围，不拿组织冒充员工 | ✅ `customer_access` + scope | ✅ | ✅ | ✅ own=0→grant=1→revoke=0 | `EVIDENCE-2026-11-12-CUSTOMER-ACCESS.md` |
| 账号→助手→DSH→工具→结果展示闭环 | ✅ | ✅ mock 与真实模型分报 | ✅ | ✅ | `EVIDENCE-2026-11-11-REAL.md` |

## E. M4 / M5 / M8

| 项 | 代码 | 测试 | 部署 | 业务验收 | 证据 |
| --- | --- | --- | --- | --- | --- |
| M4 对抗（10 pass · 2 weak · 0 fail） | ✅ harness | ✅ | ✅ | ✅ | `poc/2026-11-12-m4/matrix.json`；#7 十九项全过（含抑制、预留消费），见 `leadgen/EVIDENCE-2026-11-12-M6-DISPATCH.md` |
| M5 审核/去重/幂等入库/额度/UI | ✅ | ✅ 34 例 + 全量 unit | ✅ 4 片迁移已应用 | ✅ 真实员工闭环 + UI 点击 | `leadgen/EVIDENCE-2026-11-12-M5.md` |
| M8 试用验收 | — | ✅ 25/25 | ✅ | ✅ | `verify/verify-2026-11-12T11-58-03.md` |

## 原复验 T 项

T4/T11/T14（①）、T7（②）、T11 错误态（③）、T13 暗色基线 + 全量复验（④）均已在 `dsh-integration/reverify-2026-11-11/REVERIFY.md` §9 记录决策与证据；T2/T8/T9/T16 按原口径未擅改。

### 部署产物实测（2026-11-12，release `ee4a845`）

- running release：`/home/pro/releases/mercato/ee4a845…`，`release.json` sha=`ee4a845`，version 0.2.2；
- 进程环境：`OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、`OM_DSH_AGENTIC=1`（读自服务进程 environ）；
- `src/proxy.ts`：仅当 `OM_AI_ENGINE=dsh` 时把 `/api/ai_assistant/chat` 重写到 `/api/internal/ai-assistant-dsh-chat`（以及 health/agents/agentic/conversations）；
- 旧 OpenCode 处理器只存在于 `node_modules/@open-mercato/ai-assistant` 包里，业务 `src/` 不再调用；
- 真实模型调用证据：`restart-drill-…json` 的 fresh run、`concurrency-baseline-…json` 的顺序/并发 Run（`dsh_runs` 落库 + SSE 结束）。

### 部署产物实测（2026-11-12 15:3x，release `d34c51c`）

- 运行 release：`release.json` sha=`d34c51c`，CI run 43246620467，healthz 200；
- 本 release 在发送边界上多两道强制：抑制名单命中 409、无 `send` 预留 400；预留 CAS 消费后桶为 `0:1`，
  重放不重复扣；传输仍是模拟实现（`externalEffect: false`），无真实外发；
- 同一提交门禁：`build-freshness` PASS（部署后无源码提交）、`contract` PASS、`security-probe` PASS、
  M4 `pass 10 · pass-weak 2 · fail 0`（#7 十九项全过）。

### 部署产物实测（2026-11-12 15:0x，release `f7a2b26`）

- 运行 release：`/home/pro/releases/mercato/f7a2b262…`，`release.json` sha=`f7a2b26`，CI run 43241743534；
- 进程环境（读自运行中 pid 的 environ）：`OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、`OM_DSH_AGENTIC=1`、
  `OM_DSH_WRITES=1`、`OM_DSH_OS_ISOLATION=1`、`OM_DSH_CUSTOMER_SCOPE=organization`；
- 本 release 含 M6 发送边界（`81dd82a`）与其顺序修正（`5c5ae7d`）：M4 #7 十四项检查全过，
  传输为模拟实现（`externalEffect: false`），无真实外发；证据 `leadgen/EVIDENCE-2026-11-12-M6-DISPATCH.md`；
- `build-freshness` 在本轮为红：并行协作者在部署后继续提交，HEAD 领先运行 release；
  实测 `release.json` sha 与部署时 `origin/main` 一致、服务启动晚于构建（详见同一证据文档 §5）。

## 仍未通过/未覆盖（逐项保留）

| 项 | 状态 | 阻塞原因 |
| --- | --- | --- |
| M4 #4 子 Agent 提权 | pass-weak | 部署内没有真实子 Agent spawn，只验派生层 |
| M4 #7 真实外发 / send 额度扣减 | pass-weak | 一次性令牌已在模拟传输下实测（`externalEffect: false`）；真实供应商投递与 dispatch 时原子扣减 `send` 额度属 M6 另批 |
| M6 真实外发 / M7 渠道副作用 | 未做 | 按原授权边界另批 |
| 在线人数 / 并行 AI Run 目标 | 未定 | 定义与基线已有（`dsh-integration/CONCURRENCY.md`），目标数值待口径 |
| 数字签收 | 待 QA | 本表供独立 QA 逐项复核，不代表已签收 |
