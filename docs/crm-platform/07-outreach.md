# M6 触达 · 审批门与发送状态机（已实现部分）

## 1. 定位

先草稿、后审批、再发送。**审批绑定正文哈希**：正文/收件人/附件任一变化，审批立即失效。状态未知时**先查再定，绝不重发**。

实现：`src/lib/leadgen/outreach.ts` · 测试：`src/lib/leadgen/__tests__/outreach.test.ts`（22 例，含状态机与回复分类）

## 2. 发送门（`canSend`）

全部通过才放行，否则**把所有原因一起返回**（界面要给“怎么改”，不是一句“不能发”）：

| 条件 | 不满足时的原因 |
|---|---|
| 草稿状态不是 superseded/blocked/sent | 草稿已失效 / 被阻止 / 已发送 |
| 收件人有效 | 没有有效收件人 |
| 不在抑制名单 | 收件人在抑制名单（退订/投诉/退信） |
| 有审批记录 | 没有审批记录 |
| 审批结论 = approved | 审批结论不是「批准」 |
| 审批绑定本草稿 | 审批绑定的不是这份草稿 |
| **审批哈希 = 正文哈希** | 正文已变化：审批失效，必须重批 |
| 未被撤销 | 审批已被撤销 |
| 未过期 | 审批已过期 |
| 无既有发送记录 | 幂等拦截，不重发 |

放行时返回**一把跨 approve→enqueue→provider 的同一个 `sendKey`**：
`send:<draftId>:<draftHash>:<approvalId>:<recipientHash>:<channel>`。重试带同一个键，provider 侧也只认一次。

## 3. 发送状态机

```
queued → dispatching → accepted → delivered → replied
                              ↘ bounced / complained
        dispatching → unknown → (lookup) → accepted | delivered | bounced | failed
```

- 只允许表里声明的迁移（`canTransition`），其余一律非法。
- **`unknown` 不是休息状态**：`nextActionFor('unknown') = 'lookup'`，永远不返回“重发”。
- `delivered` 之后只能 `replied` 或 `complained`；已终态（bounced/complained/failed/suppressed）不再迁移。

## 4. 回复分类

| 类别 | 判定 | 副作用 |
|---|---|---|
| `unsubscribe` | 含退订/停止发送/remove me | **写入抑制名单** |
| `negative` | 不感兴趣/不要联系 | 写 `complaint` 抑制 |
| `ooo` | 自动回复/休假 | 不改状态 |
| `auto_reply` | 退信/投递状态/DAEMON | 按投递事件处理 |
| `human_reply` | 发件人 = 收件人且无上述特征 | 交人工判断 |

**回复 ≠ 有意向**：这一层只给标签，不动商机阶段。分类结果只落回执表，由人工决定下一步。

## 5. 测试映射

| 规则 | 测试 |
|---|---|
| 审批哈希绑定正文 | `invalidates the approval when the body changed` |
| 过期/撤销/驳回/错绑 | 各一条 |
| 抑制优先于有效审批 | `refuses a suppressed recipient even with a valid approval` |
| 幂等（已有发送记录） | `is idempotent: an existing send blocks a second one` |
| 状态机白名单 | `allows only the declared transitions` |
| unknown 不重发 | `never retries on unknown: it looks up first` |
| 退订/负面必须抑制 | `detects unsubscribe and negative replies…` |

**负向对照**：把“有原因就拒绝”改成“永不拒绝”，并让配额忽略上限 → **9 条变红**；恢复后 41 条全绿。

## 6. 尚未实现

| 项 | 缺什么 | 阻塞 |
|---|---|---|
| 真实发送 | provider 通道未接（`channel_resend` 等） | D8 + 外发批准 |
| 审批 UI | 原型已有页面，生产页待 M6 实现 | 迁移 |
| 回执入库 | `leadgen_message_receipts` 表 | M2-9 |
| 抑制存储 | `leadgen_suppressions` 表 | M2-9 |
| 域名认证 / 退信回灌 | provider webhook + 验签 | D8 |
