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
| `quota` | `stop` | 各层取最小余量，不够就指出堵在哪层 |
| `draft` | `handoff` | 没有草稿：等**人**写正文，流程不猜内容 |
| `approval` | `stop` | 发送门的**全部**理由一次列全（过期/撤销/正文变了/已有发送记录） |
| `send` | `continue` | 只产出幂等键，**不发送** |

### 三个刻意的决定

1. **`needs_review` 只能被显式批准越过。** `reviewDecision` 缺省 = 还没人看 = handoff，绝不是隐式通过。
2. **配额在草稿之前预留。** 代价写在测试里：到达 `awaiting_draft` 时已经占掉 1 单位。宁可让人看到这个成本，也不要为了省额度把顺序倒过来（先写草稿再发现没额度，才是真的浪费）。
3. **被抑制的收件人在 `reachability` 就短路，根本走不到发送门。** 这条单独有测试钉住，避免有人把抑制检查挪到后面。

### 负向对照

把人工门改坏（`if (input.reviewDecision !== 'approve')` → 恒假），测试立刻红：`hands a needs-review candidate to a human and spends no quota` 失败、退出码 1；还原后 20/20 通过。这不是"跑绿了"，是"改坏了会红"。

### 这一层仍然不做的事

无 IO、无时钟（`now` 是入参）、不发送、不入库、不推进商机阶段；`deliverability` 恒为 `unknown`，即使 `mxChecked` 为真也不改——送达只能由回执证明。
