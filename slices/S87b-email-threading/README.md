# S87（中）· 邮件回复线程头：`In-Reply-To` / `References` 从未被写入，本次补上

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-10、`rev2/D6-review-package.md` §7-S87。
> 状态：**代码与测试完成**（纯请求路径改动，无迁移、无生产数据变更）。

## 1. 核查到的事实（先证伪设计假设）

设计 rev2 把“邮件线程头”当作已有能力。本轮逐层读代码后确认**它不存在**：

- `assembleRfc2822`（hub `communication_channels/lib/email-mime.ts:241-253`）**能**写 `In-Reply-To`/`References`，但值来自 `channelMetadata`；
- IMAP/Gmail 转换器（`channel-imap/lib/convert-outbound.ts:26-58`）只转发 `meta.inReplyTo` / `meta.references`；
- 投递命令 `deliver-outbound-message.ts` 会为聊天渠道解析 `replyToExternalId`，**从不写 `inReplyTo`**；它只把线程令牌拼进 `references`；
- BFF 的 `sanitizeCallerChannelMetadata` 又把调用方的 `inReplyTo`/`references` 主动剥掉（防伪造）。

结论：**回复邮件一直没有 `In-Reply-To`**，只能靠线程令牌 `References` 兜底，客户端侧会话可能分叉。

## 2. 改法

- 新增纯函数 `lib/email-reply-metadata.ts`：父消息的 provider Message-ID + `channelType === 'email'` 才产出 `{inReplyTo, references}`；空值/聊天渠道返回 `{}`。
- `send` 路由在**已校验父消息属于本会话**之后，从父行取真实 Message-ID：
  - 入站父：`MessageChannelLink.externalMessageId` → `ExternalMessage.externalMessageId`；
  - 出站父：`link.channelMetadata.messageId`（投递命令写入的传输层 id）。
- 该元数据在 `sanitizeCallerChannelMetadata` **之后**合并，只由服务端推导；调用方传 `inReplyTo` 一律无效（有测试钉住）。

## 3. 测试

| 文件 | 用例 |
| --- | --- |
| `__tests__/email-reply-metadata.test.ts`（新，4 条） | 邮件父消息→头；带/不带尖括号原样；聊天渠道→无头；无父/空白→无头 |
| `__tests__/parent-thread-mismatch.test.ts`（+1 条） | 入站父 `em-parent`/`<parent-msg@acme.test>` → 202 且 `channelMetadata.inReplyTo`/`references` 等于父值；**调用方伪造的 `inReplyTo` 被覆盖** |

## 4. 证据

- `npx jest src/modules/communications` → **44 passed / 3 skipped（realdb）/ 259 tests**（上一片 254）。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 5. 边界

- 未验证“真实 SMTP/Gmail 发出去的邮件在客户端里是否正确归并”——需要 P-3（真实邮箱账号）与 P-2（可达 IMAP 主机）才能端到端确认；本片只证明**头被正确构造并交给转换器**。
- 内嵌引用的完整 `References` 链（祖父链）未回填，仅父 id + hub 的线程令牌；要补全链需要父消息的历史头留存，属后续增强。
