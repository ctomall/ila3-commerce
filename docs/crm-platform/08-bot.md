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
