# M6 发送边界 · 本轮证据（2026-11-12）

目标：把“发送侧审批令牌复用无法验证”从缺口变成实测项，同时**不产生任何外部副作用**。
范围：`81dd82a`（新增发送边界）+ `5c5ae7d`（审批重放顺序修正）+ `d34c51c`（抑制名单与 send 额度强制）；部署到 `d34c51c`。
不含：真实供应商投递、`send` 额度原子扣减、抑制名单前置检查、外发开关——均属 M6 另批（见 §6）。

## 1. 变更集与推送链

| 提交 | 内容 | CI run | 结论 |
| --- | --- | --- | --- |
| `81dd82a` | feat(leadgen): 发送边界 + 一次性审批令牌（模拟传输） | 随 `ac90c9e` → 43232855286 | success |
| `5c5ae7d` | fix(leadgen): 草稿已投递后连审批重放也拒绝 | 43236298562 | success |
| `fd3bc7a` | docs(m4): 保留本轮矩阵与两份门禁报告 | 43239470832 | success |
| `f7a2b26` | （并行协作者 S96–S99 修复）随本次发布进入产物 | 43241743534 | success |
| `d34c51c` | feat(leadgen): dispatch 强制抑制名单 + 一次性消费 `send` 额度 | 43246620467 | success |

部署序列（每步都切换成功、healthz 200）：
`ac90c9e` → `5c5ae7d` → `fd3bc7a` → `f7a2b26` → `d34c51c`；当前 `current/release.json` = `d34c51c5e238…`。

## 2. 正式路由实测（不是单测替身）

- 路由：`POST /api/leadgen/drafts/<draftId>/sends`，body `{ approvalId }`，feature `leadgen.sends.approve`；
- 真实员工会话（`cookies.employee`）走完整链路：额度预留 → 草稿 → 审批 → **发送**；
- 响应含 `send.state = "simulated"`、`send.providerMessageId = null`、`transport.externalEffect = false`；
- 落库 `leadgen_sends` 仅 1 行（`single-send-row`），第二次提交同审批 = 200 重放同一行，不发生第二次投递。

M4 #7 现为 **19 项检查全过**（`docs/crm-platform/poc/2026-11-12-m4/matrix.json`，生成 15:33:03Z）：
超额度 429、首次预留 201、同键重放、额度耗尽 429、headroom 非负、
草稿创建、审批绑定正文、审批重放、改正文 409、
`one-approval-one-dispatch`、`dispatch-replayed-not-duplicated`、`single-send-row`、
`approval-not-reusable-on-other-draft`、`approve-after-dispatch-refused`；
以及本轮新增的 `send-lease-reserved`、`suppressed-recipient-refused`、
`dispatch-without-lease-refused`、`send-quota-consumed`（桶 `0:1`）、`send-quota-not-double-charged`。

## 3. 本轮发现并修掉的真问题

`5c5ae7d` 之前，`approveDraft` 先按幂等键查重放、后判草稿状态：
草稿已投递时，**同一审批人的重试仍返回 200 + 旧审批**，客户端会把 200 读成“令牌还有效”。
发送边界本身仍然拒绝第二次投递（`already_sent`），所以不是投递漏洞，但是**误导性 200**。
现在先判 `draft.status === 'sent'` 再查重放，同一审批人与另一审批人都得到 409 `already_sent`。
回归测试：`outreach-service` 新增 2 条断言，leadgen 全模块 46/46。

## 4. 门禁结果（同一候选提交）

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| CI typecheck / unit / build | 全绿 | run 43241743534 |
| `unit`（本机复跑） | 1093 passed / 9 skipped，0 fail | 15:0x 复跑；此前 14:13 的 4 个失败是部署与 jest 争抢导致的超时，非代码问题 |
| `contract` | PASS | `[contract] OK: draft satisfies its own rules … no collision`（15:33:28Z 复跑） |
| `security-probe` | PASS | `[probe] 14/14 as expected, 0 needs review`，零写入 |
| `m4-harness` | **pass 10 · pass-weak 2 · fail 0** | matrix 15:03:28Z |
| `build-freshness` | **PASS**（release `d34c51c`，部署后无源码提交） | `[freshness] RESULT: PASS — 运行中的发布槽位就是 HEAD` |
| `healthz` | 200 | 切换后实测 |

## 5. `build-freshness` 为什么红（保留，不掩盖）

该门禁比较“运行中的 release”与“**共享工作树 HEAD**”。本轮并行协作者在部署完成后继续往同一
checkout 提交，HEAD 前进，门禁即红：

- 部署 `fd3bc7a` 后：HEAD `f7a2b262`，报 23 个未部署文件（含 `fix(communications) NULL-inclusive org scope` 等）；
- 部署 `f7a2b262` 后：HEAD `eac0e10a`，报 2 个未部署文件（`package.json` + 一个测试文件）。

两次都不是“服务跑的不是 CI 产物”：`release.json` 的 sha 与部署时 `origin/main` 完全一致，
且服务启动时间晚于构建时间（门禁自身输出 `服务启动 … 晚于构建 ✓`）。
要得到绿的 `build-freshness`，需要在协作者停止提交的窗口内完成“部署→立即跑门禁”；
本轮未获得该窗口，故如实保留红色。

## 6. 仍然没做（真实外发另批）

`d34c51c` 把上一轮列在这里的两项做完并实测：`send` 预留原子消费（桶 `0:1`）与抑制名单前置检查（命中 409）。
剩下三项：

1. 供应商适配器（SMTP/API、bounce/complaint 回执写入 `leadgen_message_receipts`）；
2. 默认关闭的外发开关（现在没有任何配置能打开真实发送）；
3. 预留与员工/草稿的绑定校验（当前只校验 `quota_kind='send'`，四层桶满足即可）。

## 7. 零副作用声明

本步未新增迁移（`leadgen_sends` 早已在生产，`state` 列无 check 约束）；
未发送任何邮件/消息；M4 自检 `zero-write: confirmed`；
测试产生的 `leadgen_sends/approvals/drafts` 行由 harness 在 finally 中删除。
