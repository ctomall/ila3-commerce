# S93 · 邮件连接的统一入口（F1-02/03/F1-08）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F1-02/03、F1-08（D-2 选 Resend）。
> 状态：**完成**；无迁移、无生产数据变更。

## 1. 先查清契约，再决定做什么

- 本应用连接表单提交到 `POST /api/communication_channels/channels/connect/tenant-credentials`（`connect_tenant_channel`）。
- 该路由**故意拒绝**未声明 `channelScope: 'tenant'` 的 provider——防止管理员把“绑定到某个人邮箱”的凭据强塞进团队共享渠道。
- 邮件连接器（resend / imap / ses / gmail）都没有声明租户级 scope；它们的连接组件挂在装好的「我的资料 → 连接渠道」（`/backend/profile/communication-channels`，`connect_user_channel`）。

**结论**：在工作台复制一套邮件凭据表单会被 hub 直接拒绝；要么改安装包（越界），要么把入口与所需字段讲清楚。后者才是这里的正确解。

## 2. 改动

| 文件 | 内容 |
| --- | --- |
| `connect/connect-channel.ts` | 新增 `EXTERNAL_PROVIDERS`：Resend（一期）、IMAP+SMTP、SES、Gmail；每条含入口链接、所需字段、限制说明（Resend 无入站；Gmail 走 OAuth；IMAP 需可达主机） |
| `connect/ConnectChannelForm.tsx` | 渠道类型下拉同时列出应用内可连接的（WA/MS）与“外部连接”的邮件 provider；选到邮件时**不显示凭据输入、不提交**，只显示所需字段、入口链接与后续指引；提交守卫 `if (external) return` |

文案如实写：Resend “只发不收，客户回信不会出现在收件箱”，IMAP “连之前先确认主机可达”，两者都指向「渠道账号」页看可收/可发。

## 3. 测试（`__tests__/connect-channel.test.ts` 新增 4 条）

- Resend 字段集为 `apiKey`（敏感）+ `fromAddress`，说明含“没有入站”；
- 所有邮件 provider 的入口都是 `/backend/profile/communication-channels`；
- 邮件 provider **不在**应用内 provider 列表里（tenant 路由会拒），且 `findExternalProvider` 对 WA/未知返回 undefined；
- Gmail 的 `requiredFields` 为空（OAuth，不臆造字段）。

## 4. 证据

- `npx jest src/modules/communications` → **53 passed / 3 skipped（realdb）/ 321 tests**。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 5. 边界

- 邮件渠道仍是**个人范围**连接（hub 模型），不是团队共享；要让“客服邮箱”成为团队共享，需要安装包支持租户级邮件凭据，属架构决策，不在本片伪造。
- 未接入 SES/IMAP 实际字段校验（字段名取自各自包内 schema，连接时由连接器校验）；Gmail 受出口限制当前不可用。
