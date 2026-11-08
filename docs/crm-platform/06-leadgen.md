# M5 获客 · 确定性验证规则（已实现部分）

## 1. 定位

候选从 DSH 提交进来后，**验证必须是确定性的**：同样的输入永远得到同样的结论，可回放、可审计。所以这一步是纯函数，不查库、不联网、不读时钟。

实现：`src/lib/leadgen/verification.ts` · 测试：`src/lib/leadgen/__tests__/verification.test.ts`（19 例）

## 2. 判决规则

| 判决 | 条件 | 含义 |
|---|---|---|
| `fail` | 无公司名，**或**证据为空 | 不允许入库；**不允许补造联系人** |
| `needs_review` | 有至少一条 reason（邮箱不在证据里 / 角色邮箱 / 域名与来源页冲突 / 无域名） | 人工判断，不能自动通过 |
| `pass` | 有公司名 + 有证据 + 无 reason | 可以进入审核队列（仍需人工点通过） |

`deliverability` 字段**恒为 `unknown`**：MX 只作弱信号，永远不能让一个地址变成「可送达」。测试里专门有一条「MX 不能拯救无证据的候选」。

## 3. 去重键

优先级：**注册域名 → 税号 → 名称+国家**。

| 输入 | 键 | 说明 |
|---|---|---|
| `https://www.nordwind-energie.de/impressum` | `d:nordwind-energie.de` | 先去协议/www/路径/端口 |
| `DE 811 907 980` | `t:DE:de811907980` | 去非字母数字，国家在前 |
| `Acme GmbH` + `de` | `n:acme gmbh\|DE` | 名称小写压空白 + 国家大写 |
| 只有空名 | `null` | **拒绝编造键**，调用方必须转人工 |

**已知局限（写清楚，不假装完整）**：未接公共后缀表（PSL），只用内置的 25 个常见双段后缀（`co.uk`、`com.cn`、`com.au` 等）。新后缀出现时会退化为「取最后两段」，可能把 `example.co.zz` 误判。补 PSL 需要引入依赖，属另行评审。

## 4. 「有效」与「可触达」分开

`canEmail()` 单独判定，与 `verifyCandidate()` 正交：

- 没有邮箱 → 公司**保留**，`reachable: false`（"没有邮箱：公司可保留，但不可触达"）。
- 抑制 / 投诉 / 硬退信 → 一律 `reachable: false`，且**优先于有效邮箱**。
- 有邮箱且未抑制 → `reachable: true`，但文案写明「送达仍以实际回执为准」。

## 5. 测试映射（rule → test）

| 规则 | 测试 |
|---|---|
| 不补造联系人 | `fails hard when there is no evidence` |
| 完整候选通过 | `passes a fully evidenced candidate` |
| MX 不改变可送达结论 | `never claims deliverability, even with MX` |
| MX 不能救无证据候选 | `does not let MX rescue a candidate without evidence` |
| 邮箱不在证据里 → 需复核 | `marks an email that is absent from the evidence…` |
| 角色邮箱 → 需复核 | `treats a role address as needs-review` |
| 域名与来源冲突 | `flags a source page on a different domain…` |
| 确定性 | `is deterministic: identical input yields identical output` |
| 去重优先级与拒绝编造 | `companyDedupeKey` 三条 |
| 有效 ≠ 可触达 | `canEmail` 两条 |

## 6. 负向对照（证明测试不是空转）

把 `fail` 改成 `pass`、把 `needs_review` 改成 `pass` 后重跑：**5 条测试变红**（无证据、MX 无证据、邮箱无证据、角色邮箱、域名冲突），恢复后 19 条全绿。

## 7. 尚未实现（不要误读成本文件已完成）

| 项 | 缺什么 | 阻塞 |
|---|---|---|
| 去重**存储** | `leadgen_company_claims` 表未建（迁移待批） | M2-9 |
| 配额 | 账本表未建 | M2-9 / D4 |
| 候选提交 | DSH 桥接未实现 | M4 路线 |
| CRM 入库写入 | 需组织上下文（已实测：缺 org 直接 400） | M5 |
| 邮箱校验 | 只有 MX 弱信号，没有 SMTP 探测（也不打算做） | 设计如此 |
| 联系人抽取 | 依赖 DSH 侧抽取器；本层只校验，不抽取 | M4/M5 |

## 8. 与契约的一致性

- `03a-data-model.md` 的 `leadgen_verifications`（`verifier_version` + `ruleset_hash` + `input_digest`）对应本文件的纯函数：同一 `input_digest` 与 `verifier_version` 不重算。
- 本文件即 `ruleset` 的第一版；任何规则改动都要改版本号，并在 `docs` 记录变更原因。

## 9. 配额算术（已实现，2026-11-08）

`src/lib/leadgen/quota.ts` · 测试 10 例（配额）；触达门另在 `outreach.test.ts`（19 例），两个文件合计 29 例——早前写「22 例」是把两个文件混算了

| 规则 | 函数 | 测试要点 |
|---|---|---|
| 余量 = 上限 − 已消费 − 已预留 | `headroom` | 不为负 |
| 四层取最小值 | `effectiveHeadroom` | tenant 70 / employee 3 → 3 |
| 预留必须每层都够，并指出堵在哪层 | `reserve` | 拒绝时带 `employee 剩余 3` |
| 消费/退还必须 lease 匹配且未过期 | `consume` / `refund` | lease 不符、状态不符、过期都拒 |
| 过期预留由清扫回收 | `expiredReservations` | 只挑 `reserved` 且已过期 |
| 落库换算不丢不重 | `applyReservation` | 预留→消费/退还，且重复应用不会变负 |

这一层是纯函数，真正的一致性仍由数据库保证（`CHECK limit >= consumed + reserved` + 行锁 + `lease_token` 唯一）——纯函数只负责“算得对”，不负责“并发安全”。

## 10. 四层规则串起来的判决链（2026-11-08 新增）

前面几节各自证明了一件事：验证判得对、配额算得对、发送门拦得住。但**没有任何东西证明它们能按正确顺序串起来**——顺序错（先花配额再验证）、词汇不通（把 `needs_review` 当通过）、人工门被绕过，单测一个都发现不了，因为每一层单独看都正确。

实现：`src/lib/leadgen/pipeline.ts` · 测试：`src/lib/leadgen/__tests__/pipeline.test.ts`（20 例）

输入一个候选 + 配额桶 + 草稿/审批 + `now`，输出**一条阶段轨迹和一个终局判决**，让复核者看到它停在哪、为什么停。

| 阶段 | 结果 | 语义 |
|---|---|---|
| `verify` | `stop` | 判决 `fail`：拒绝，**不花配额、不要求草稿** |
| `review` | `handoff` / `stop` | 判决 `needs_review`：等人工，除非显式 `reviewDecision: 'approve'` |
| `reachability` | `stop` | 无邮箱或被抑制：**仅入库**（公司保留，不丢，也不补造地址） |
| `quota` | `stop` | 各层取最小余量做**预算检查**，不够就指出堵在哪层（不占用额度） |
| `draft` | `handoff` | 没有草稿：等**人**写正文，流程不猜内容 |
| `approval` | `stop` | 发送门的**全部**理由一次列全（过期/撤销/正文变了/**收件人变了**/**渠道变了**/审批未绑定收件人/已有发送记录） |
| `send` | `continue` | 只产出幂等键，**不发送** |

### 四个刻意的决定

1. **`needs_review` 只能被显式批准越过。** `reviewDecision` 缺省 = 还没人看 = handoff，绝不是隐式通过。
2. **配额在草稿之前做检查，但这里不占额度。** `reserve()` 是纯函数：它返回判断和余量，不改桶、不发 lease、不落库，`applyReservation` 从未在这一层被调用。所以"到 `awaiting_draft` 就占掉 1 单位"是**假话**，已删除——有一条测试断言传给它的桶对象在调用后一字节未变。真正占额度属于账本层（需要还没获批的配额表），那一层才负责 lease、行锁与退款。
3. **被抑制的收件人在 `reachability` 就短路，根本走不到发送门。** 这条单独有测试钉住，避免有人把抑制检查挪到后面；`bounced`/`complained` 同样在这一层拦。
4. **草稿收件人必须等于被验证的邮箱。** 验证器证明的是 `candidate.email`，发送门放行的是 `draft.recipientEmail`；两者不等时直接 `blocked`。没有这条，`email_evidence` 规则保护的只是一个永远不会被用来发送的字符串。

### 负向对照（两条，都实测过）

| 变异 | 期望 | 实测 |
|---|---|---|
| 人工门改成恒假（`reviewDecision !== 'approve'` → `false`） | 人审不再拦截 | `hands a needs-review candidate to a human and spends no quota` 失败、exit 1；还原后全绿 |
| 删掉"审批绑定收件人"的比较 | 换收件人仍放行 | `invalidates the approval when the recipient changes after it was granted` 失败、exit 1；还原后全绿 |

**独立 QA 的补充（第 29 轮）**：它用 14 个变异测过这套件，7 个存活——说明"改坏了会红"当时只对**这两个**变异成立。已按它的建议补断言：approve 分支必须走到 `sendable`、配额用两个不同余量的桶、`ready` 状态、正文变更链路、收件人绑定。

### 变异门（第 30 轮，`scripts/crm-mutation-check.mjs`）

"测试会咬人"不再靠人跑一次然后在对话里声明。`crm-verify-all --full` 的第 17 道门对规则层施加 7 个变异，每个都必须让对应测试文件变红：

| 变异 | 抹掉的行为 |
|---|---|
| `approval-recipient-binding` | 审批绑定收件人 |
| `approval-body-binding` | 正文变化使审批失效 |
| `unsendable-draft-state` | `editing`/`ready` 草稿不得发送 |
| `pipeline-verified-email-binding` | 草稿收件人 = 已验证邮箱 |
| `pipeline-human-review-gate` | `needs_review` 必须人工批准 |
| `pipeline-reachability-short-circuit` | 不可达收件人不得进发送门 |
| `verification-email-evidence` | 邮箱必须出现在证据里 |

**变异存活即门失败**，锚点消失也失败（防止门在空转）。三个方向都实测过：7/7 被杀 → PASS；人为加一个只改文案、没有测试断言的变异 → `SURVIVED` + exit 1；把锚点改成不存在的字符串 → `INVALID` + exit 1。改源文件在 `finally` 里按 SHA-256 还原，并注册 `process.on('exit')` 兜底。仍然没有做到的：配额预留的持久化语义（需要账本表）。**变异测试已做成常设门**（见下）。

### 这一层仍然不做的事

无 IO、无时钟（`now` 是入参）、不发送、不入库、不推进商机阶段；`deliverability` 恒为 `unknown`，即使 `mxChecked` 为真也不改——送达只能由回执证明。
