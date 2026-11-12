# S87（下）· 内部备注：不新增表、不进任何外发通道

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-06、`rev2/D6-review-package.md` §7-S87。
> 状态：**后端 + 面板 + 测试完成**；无迁移、无生产数据变更。

## 1. 复用装好的能力（因此不需要迁移审批）

- `messages.message` 已有 `visibility: 'public' | 'internal'`；
- hub 投递命令对“threadId 没有 `ChannelThreadMapping` 的内部消息”直接返回 `no_channel_link` 停止（`deliver-outbound-message.ts:30-34`），即**内部消息不会被投递**；
- `sourceEntityType`/`sourceEntityId` 已存在，可把备注钉到会话上，不必依赖 hub 线程是否已建立。

## 2. 改动

| 文件 | 作用 |
| --- | --- |
| `api/me/threads/[id]/notes/route.ts`（新） | `GET` 列出该会话的内部备注；`POST` 用 `messages.messages.compose` 建 `visibility=internal` 消息。写需 `canActorReply`（回复授权），读需 `communication_channels.view`；会话/渠道归属与个人渠道掩码沿用消息路由的同一套校验（越权=404，不泄露存在性） |
| `backend/.../inbox/InternalNotes.tsx`（新） | 会话底部独立面板：加载/空/错误/保存中状态齐；文案明确“仅内部可见，客户与平台都收不到” |
| `backend/.../inbox/InboxView.tsx` | 在 `canReply` 时挂载面板（`selectedId` 空值有守卫） |

设计取舍：
- **不把备注并入回复模式选择器**。备注不是“发送”，混进「文本/媒体/模板」会诱导误发；独立面板更安全。
- **不与客户消息按时间交错渲染**。独立区块 + 琥珀底色，避免把备注误读成客户可见消息（F3-06 要求“区分展示”）。
- 有既有消息时传 `parentMessageId` 让备注继承 hub 线程；新会话没有父消息时仅靠 `sourceEntityId` 关联，仍可检索。

## 3. 证明“备注绝不外发”

1. compose 输入**不含** `senderChannelId`、不含 `channelMetadata`（测试断言），平台 sender 路径下 `sendViaEmail: false`；
2. hub 对无 channel link 的内部消息直接 no-op（代码依据见 §1）；
3. 测试 `creates an internal message with no channel/sender path` 显式断言这两条。

## 4. 测试（`__tests__/internal-notes.test.ts`，10 条）

POST：内部消息 + 无发送路径；新会话无父消息也能建；无回复授权 403 且不写；空/超长 422 且不开容器；他人个人渠道 404；匿名 401。
GET：只返回本会话备注（断言 where 含 `visibility=internal`/`sourceEntityId`）；无备注空列表；会话缺失 404；匿名 401。

## 5. 证据

- `npx jest src/modules/communications` → **45 passed / 3 skipped（realdb）/ 269 tests**（上一片 259）。
- `yarn generate` exit 0（新路由已注册：`api-route-metadata.generated.ts:4787`）。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 6. 边界

- 备注作者显示为 `senderUserId` 前 8 位；未做“作者姓名/头像”补全（需目录服务，属 UI 增强）。
- 备注未接入审计导出（F5-02 二期）与搜索（F2-01 未含备注正文）。
- 未做备注编辑/删除：`messages.messages.update_draft`/`delete_for_actor` 可用，但属 P1。
