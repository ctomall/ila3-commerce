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
| 重启恢复 / 超时 / 取消 / 断线重连 | ✅ stale-run sweep + 取消 + 断线兜底结算 + 提交时自愈 | ✅ 单测 43/43 + restart drill + 断线 drill + 重启后重放 | ✅ release `6b389f7` | ✅ 真实重启（healthz 12.4s）：孤儿行 `failed/server_restart`；断线 Run 落 `cancelled` 且重连回放完整；已完成 Run 重启后重放 200、17→17 事件、不新建 Run | `evidence/restart-drill-2026-11-12T12-29-22-652Z.json`、`evidence/reconnect-drill-2026-11-12T17-31-22-904Z.json`、`evidence/replay-after-restart-2026-11-12T19-48-40-097Z.json` |
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
| M4 对抗（11 pass · 1 weak · 0 fail） | ✅ harness | ✅ | ✅ | ✅ | `poc/2026-11-12-m4/matrix.json`；#4 已由“能力面不存在 spawn/browser 工具”转为 full pass；#7 二十八项全过（含抑制写入/解除、预留消费、预留绑定草稿、权限负向控制） |
| M5 审核/去重/幂等入库/额度/UI | ✅ | ✅ 34 例 + 全量 unit | ✅ 4 片迁移已应用 | ✅ 真实员工闭环 + UI 点击 | `leadgen/EVIDENCE-2026-11-12-M5.md` |
| 抑制名单运维页（M6 前置） | ✅ `/backend/leadgen/suppressions` + GET 列表 | ✅ 单测 5/5 + 点击验证 | ✅ release `6b389f7` | ✅ 真实登录：表单加入→行出现→解除→行消失（截图前后） | `leadgen/evidence/suppressions-ui-2026-11-12T19-39-09-960Z.json` |
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

### 部署产物实测（2026-11-13 02:3x，release `b861e56`）

- 变更集：只在 `initialize` 握手 ≥5 s 时打一行 warn（耗时/load1/runId/上限），只观测不失败；
  同轮补齐握手实测：非隔离 0.76–2.3 s（load 69）、隔离 0.79–1.03 s、隔离+空 HOME 0.77–0.84 s，
  三条路径都解释不了那次 10 s 超时，60 s 上限因此定位为“防瞬时停顿的护栏”而非修复；
- 发布级复验：`verify/verify-2026-11-13T02-32-51.md` — **PASS 25 · FAIL 0 · SKIP 0**（干净 worktree）；
- 正式入口真实模型探针（同一 release）：PASS，`dsh.event` 帧 + `dsh_runs` completed
  （run `08e80a10`，`dsh-integration/evidence/public-chat-path-2026-11-13T02-33-39-526Z.json`）；
- 未覆盖：那次 10 s 超时的根因仍无当时耗时数据，等价于“瞬时停顿”假设，未证明。

### 部署产物实测（2026-11-13 00:2x，release `b3013e2`）

- 变更集：DSH `initialize` 握手默认上限 10s → 60s（只对“子进程活着但不吭声”生效；崩溃/缺二进制
  会关管道并立即失败，不被上限拖慢），夹具新增 `init-slow`，launch 套件断言默认上限容忍 1.2s 冷启动；
  另有一条 `.gitignore` 让 `.build-probe/` 本地构建探针不再弄脏发布级干净树判定；
- 依据：非隔离 / 隔离 / 隔离+空 HOME 三条路径实测均 **0.77–1.03 s**（见
  `dsh-integration/EVIDENCE-2026-11-11-REAL.md`「`initialize` 握手耗时实测」），那次 10s 超时不能用稳态耗时解释；
  60s 是防瞬时停顿的护栏；握手 ≥5s 会打一行带耗时的 warn（只观测不失败），下一次同类故障有数据可判；
- 运行 release：`b3013e2`，healthz 200，`ila3-auto-deploy.timer` active；
- 导航基线重录（2026-11-13 01:03）：并行协作者按用户批准执行了 `communications.reply` 角色授权迁移
  （`audit/reply-role-migration-2026-11-13T01-03-07-217Z.json`），回收遗留
  `communication_channels.connect_user_channel`，因此员工侧 `我的通信渠道` 入口按该 feature 的正常门控消失、
  admin 侧多出 1 个 feature。基线按规程重录（employee 69 main / admin 301 features），
  这不是把回归算绿：门控由已批准的迁移造成，页面本身仍可访问；若产品要求该入口继续对员工可见，
  需要把入口改挂 `communications.reply` 而不是回收基线；
- 发布级复验：`verify/verify-2026-11-13T00-56-05.md` — **PASS 25 · FAIL 0 · SKIP 0**；
  该轮在 `git worktree add --detach b3013e2` 的干净检出里跑（共享 checkout 有另一位写入者的未提交改动），
  产物已拷回并提交；
- 共享 checkout 里的同门禁运行 `verify-2026-11-13T00-27-37.md` 25 道门同样全绿，但结论为 FAIL——
  期间另一写入者改写 `slices/` 三份文档，按 `--require-clean` 口径不算提交级证据，如实保留。

### 部署产物实测（2026-11-12 19:45，release `6b389f7`）

- 发布级复验：`verify/verify-2026-11-12T19-45-03.md` — **PASS 25 · FAIL 0 · SKIP 0**，干净工作树；
- 本 release 含抑制名单后台页（`/backend/leadgen/suppressions`）与新导航入口，真实登录点击验证通过；
- 导航基线已随新入口重录（superadmin 136/333、admin 131/300、employee 70/126）。

### 部署产物实测（2026-11-12 17:0x，release `f2403fb`）

- 运行 release：`f2403fb`，healthz 200；HEAD `19de35a` 只含文档，`build-freshness` PASS；
- 进程环境（读自运行中 pid）：`OM_AI_ENGINE=dsh`、`OM_DSH_PERSIST=orm`、`OM_DSH_AGENTIC=1`、
  `OM_DSH_WRITES=1`、`OM_DSH_OS_ISOLATION=1`；`OM_DSH_INIT_TIMEOUT_MS` 未设置（走运行时默认 60s）；
- 部署目录 `src/` 中已无 `createOpenCodeClient` / `handleOpenCodeMessageStreaming` 引用；
- 发布级复验：`verify/verify-2026-11-12T17-04-30.md` — **PASS 25 · FAIL 0 · SKIP 0**，干净工作树；
- 本 release 含失败重放可见性修复：重放失败 Run 实测 `["error","done"]`；
- 公开入口真实模型探针 PASS（`dsh.event` 帧 + `dsh_runs` completed）。

## 仍未通过/未覆盖（逐项保留）

| 项 | 状态 | 阻塞原因 |
| --- | --- | --- |
| M4 #4 子 Agent 提权 | **已满足**（不再是缺口） | 派生层交集/越权检测之外，本轮实测部署工具面（员工角色 78 个工具）**没有 spawn/delegate/browser 工具**；若将来新增 spawn 能力，该用例的两条新断言会立即变红，必须先扩展提权测试 |
| M4 #7 真实外发 | pass-weak | 一次性令牌、抑制名单、`send` 额度原子扣减、预留绑定草稿均已在模拟传输下实测（#7 共 28 项）；真实供应商投递属 M6 另批 |
| M6 真实外发 / M7 渠道副作用 | 未做 | 按原授权边界另批 |
| 在线人数 / 并行 AI Run 目标 | 未定（已补并行实测） | 定义与基线已有；跨员工并行已实测（两人各一个 Run 都 completed、同员工第二个 409，`concurrency-drill-2026-11-12T18-19-23-649Z.json`），**目标数值仍待口径** |
| 数字签收 | 待 QA | 本表供独立 QA 逐项复核，不代表已签收 |

## 签收建议（给独立 QA）

可以现在签的部分（每一项都有代码路径 + 同提交测试 + 部署 + 业务/对抗证据）：

1. **A 引擎替换**：正式入口 `POST /api/ai_assistant/chat` 实测执行 DSH（`dsh.event` 帧 + `dsh_runs` completed），
   旧 OpenCode 处理器不在业务 `src/` 调用链上；切换开关 `OM_AI_ENGINE` 有回退路径。
2. **B 一人一助手 + Run 持久化**：绑定持久化、Run/幂等/游标/结果落库、重启恢复、超时、取消、并发冲突、断线重连均有实测。
3. **C 生命周期鉴权与隔离**：逐工具鉴权 + 写入前复核、撤权 10s 内终止、两名真实员工 OS 级隔离（跨读/凭据拒绝）。
4. **D 受控工具桥**：`crm.find_companies` 复用既有授权，真实账号→助手→DSH→工具→结果闭环已走通（mock 与真实模型分别报告）。
5. **E 的 M4/M5/M8**：M4 **11 pass · 1 weak · 0 fail**（仅 #7 真实外发为弱）；M5 审核/幂等入库/额度/UI 闭环；M8 发布级 25/25（两次连续）。

不能签的部分（明确保留）：

| 项 | 为什么不能签 |
| --- | --- |
| M6 真实外发 / M7 渠道副作用 | 需要单独授权；当前代码没有任何能触发真实外发的实现或开关。最小授权清单（渠道 + 测试地址 + 会加什么 + 回滚 + 证据）见 `leadgen/M6-MINIMAL-AUTHORIZATION.md` |
| ~~M4 #4 子 Agent 提权~~ | 已满足：部署工具面无 spawn/browser 工具；用例新增能力面断言，新增能力会先红 |
| 并发目标（在线人数 / 并行 Run） | 定义与基线已有，目标数值必须由产品给，不能由我编 |
| 数字签收本身 | 本表是证据汇总，签收动作属于独立 QA |

结论：**除 M6/M7 真实外发、并发目标数值、签收动作本身外，DSH 替换链路的 A–E 与 M4/M5/M8 具备签收条件**；
M4 #4 已由能力面证据转为满足（子 Agent 能力若将来新增，需先扩展该用例）。
由于 M6/M7 未获授权、并发目标未定，整体目标仍不应标 complete。
