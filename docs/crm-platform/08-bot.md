# M7 Bot · 受控渠道绑定（已实现守卫层）

## 1. 定位

Bot 是**共享表面**：群里可能有不属于本公司的成员。所以默认只读、默认脱敏、默认不复用会话权限——每条消息重新判定。

实现：`src/lib/bot/guard.ts` · 测试 14 例

## 2. 入站四道关

| 关 | 规则 | 拒绝原因 |
|---|---|---|
| 签名 | HMAC-SHA256 over `timestamp.nonce.body`，常量时间比较 | `bad_signature` |
| 时效 | 时间戳必须在 ±5 分钟内 | `stale_timestamp` |
| 重放 | 同一 `nonce` 只允许一次 | `replay` |
| 身份 | 绑定 `state=active`、`employeeUserId` 非空、员工在职 | `binding_revoked` / `identity_unbound` / `employee_inactive` |

**时间戳参与签名**：截获的签名换时间戳就失效（有测试证明），这才是防重放的前提，而不只是校验“时间新不新”。

### 2.1 四道关已串成一条有序判定（第 53 轮）

`src/lib/bot/inbound.ts` 的 `handleInbound()` 把四道关按固定顺序执行，并返回一条审计记录。**顺序本身就是安全属性**：

| 顺序 | 为什么不能换 |
|---|---|
| ① 验签 + 时效 → ② 重放/原子领取 nonce → ③ 身份 → ④ 群聊/脱敏 | 若先验签前就记 nonce，任何人发一个未签名的请求就能烧掉一个 nonce；若把重放检查放在身份之后，被撤销的绑定会掩盖重放，且拒绝原因会泄露"这个身份已撤销"。nonce 用**一次原子领取**（`claimNonce` 返回 boolean）而不是"先查快照再记"——后者在并发投递下两边都看到"没记过" |
| 认证通过但后续被拒（如员工离职） | nonce **照样记掉**：这条消息已经被认证过，允许它无限重试才是漏洞 |

审计记录字段：`at / nonce / chat / action / bindingId / employeeUserId / outcome / reason`，无论放行还是拒绝都产生一条。

群聊只允许 `read`，且文本离开 CRM 前必须过 `redactForGroup()`（邮箱/电话/金额，可用 `allowInGroup` 逐项放行）。单聊不脱敏。

## 3. 群聊限制

| 动作 | 私聊 | 群聊 |
|---|---|---|
| 读（查客户/查任务） | 允许 | 允许（脱敏） |
| 写（建任务/改阶段） | 允许 | **拒绝** `group_unsafe_action` |
| 审批 | 允许 | **拒绝** |
| 发送邮件 | 允许 | **拒绝** |

理由：群聊里任何“以员工名义写数据/发信”的操作都无法确认在场者身份，不能靠隐藏按钮来假装安全。

## 4. 群聊脱敏

`redactForGroup` 默认隐藏邮箱、电话、金额，替换为 `〔email 已隐藏〕` 这类标记；需要展示时必须**显式放行字段**。原始内容只留在 CRM 私有视图里。

**先归一化再匹配（第 56 轮）**：一个值写到全角 `ｏｐｓ＠ａｃｍｅ．ｔｅｓｔ`、或被换行切成两截，对人眼还是同一个值。因此 `redactForGroup` 先做 NFKC 折叠宽度、把连续空白折成单个空格，再跑模式；返回的也是归一化后的文本——**保留原格式的脱敏器就是可以绕过的脱敏器**。邮箱模式在 `@` 与点号两侧容忍空白，所以"换行切成两截"会被重新拼起来匹配。

已知**不**覆盖、也不假装覆盖的：

- **无货币符号的裸数字**（`12000 元`）：没有符号就分不清金额与编号，宁可不猜。
- 图片、二维码、附件里的文字：脱敏只处理文本。
- 真正的防线是"群聊只允许 `read` 且不返回记录原文"；脱敏是第二层，不能当成唯一屏障。

## 5. 离职与撤权

- 绑定 `revoked` / `offboarded` → 下一条消息立即拒绝（**按消息判定，不是按会话**）。
- 员工离职流程：绑定 revoke → Bot 置 `offboarded` → 在途任务取消 → 草稿转交（见 `03-dsh-contract.md` §6）。
- 发送时**重新鉴权**：即使会话还在，发送动作也要再查一次绑定与员工状态。

## 6. 测试映射

| 规则 | 测试 |
|---|---|
| 正确签名放行 | `accepts a correctly signed, fresh event` |
| 篡改正文 / 错密钥 / 缺字段 | 各一条 |
| 时间戳进签名 | `treats the timestamp as part of the signed payload` |
| 过期签名拒绝 | `rejects a signature that is valid but outside the replay window` |
| nonce 重放 | `drops a nonce it has already seen` |
| 绑定 revoke/offboard/解绑/离职 | 四条 |
| 群聊只读 | `lets a group chat read but never write, approve or send` |
| 脱敏 | 三条（默认隐藏 / 显式放行 / 干净文本不动） |

**负向对照**：跳过 HMAC 比较、并让群聊写放行 → **4 条变红**；恢复后 14 条全绿。

## 7. 尚未实现

| 项 | 缺什么 | 阻塞 |
|---|---|---|
| 渠道适配器 | 本安装没有 telegram/whatsapp；只有 discord/gmail/imap/resend/ses | D8 / 渠道选择 |
| nonce 存储 | 需要持久化（`leadgen_bot_bindings` + 一个 short-TTL 去重表） | M2-9 |
| 绑定 UI | 管理后台页面 | 迁移 |
| 群聊白名单 | 哪些群允许读、谁是群管理员 | 业务决策 |

## 8. 明确不做

- 不开放无人值守群发、不自动私信陌生人。
- 不在群聊里默认输出客户联系方式或金额。
- 不把 Bot 会话当成“已授权会话”复用权限。
