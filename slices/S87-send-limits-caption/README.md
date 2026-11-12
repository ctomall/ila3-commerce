# S87（上半）· 发送：渠道上限前置拒绝 + 媒体配文可达

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-01/F3-02、`rev2/D6-review-package.md` §7-S87。
> 状态：**上半完成并验证**；下半（内部备注、邮件线程头）见 §5，未开工，不冒充完成。

## 1. F3-01 正文超限：从“平台报错”变成“服务端前置拒绝”

**问题**：BFF 只按传输 schema 限制正文（plain 5 万字符），WhatsApp 实际 4096、Messenger 2000。超长消息会先过台账/队列，最后被平台 4xx 拒绝，用户只看到通用失败，还白占一次发送尝试。

**改法**（`lib/outbound-body-limit.ts` + send 路由）：
- 上限**只取连接器自己的能力声明** `capabilities.maxBodyLength`，代码里不硬编码任何平台数字。
- 邮件等未声明上限的 provider 返回 `null`，保持原有宽松行为；适配器缺失或注册表异常同样不阻塞发送（不把基础设施故障变成 400）。
- 校验点在**取台账 claim 之前**：拒绝时不写 `communications_send_requests`、不调 hub、不产生平台请求。
- 响应：`422 { code: 'BODY_TOO_LONG', maxLength, actual, providerKey }`，前端可直接提示“最多 N 字符”。
- 顺带把同一处 `CommunicationChannel` 读取复用给模板/媒体形状校验，删掉重复查询。

## 2. F3-02 媒体配文：Web 终于能填 caption

**问题**：服务端 zod 早就接受 `media.caption`（≤1024）并写入 `channelMetadata.media`，WhatsApp 适配器也支持；但 Web `ReplyComposer` 的媒体模式只有类型+链接，**没有配文输入**，等于能力存在却不可达。

**改法**（`ReplyComposer.tsx`）：
- 媒体模式新增配文输入（WhatsApp 显示，`maxLength=1024`）；Messenger 显示“不支持配文”而不是给一个会被丢弃的输入框。
- 配文进入 `media.caption` 并纳入 `signature()`（发送尝试签名），成功发送后清空。
- 服务端 `media.caption` 已在 `channelMetadata.media` 中转发（路由第 516/535 行），本次补测试钉住这条链路。

## 3. 测试

| 文件 | 用例 |
| --- | --- |
| `__tests__/outbound-body-limit.test.ts`（新，10 条） | 读能力不硬编码；无声明/未知 provider/空 key/注册表抛错/非正数/Infinity → 不阻塞；等于上限允许、超 1 字符拒绝；按 plain 计数（HTML 不计）；UTF-16 长度 |
| `__tests__/routes.test.ts`（+2 条） | 超限 → 422 `BODY_TOO_LONG`、hub 未调用、台账未落；媒体配文 → 202 且 `channelMetadata.media.caption` 原样到 hub |

## 4. 证据

- `npx jest src/modules/communications` → **43 passed / 3 skipped（realdb）/ 254 tests**（上一片 243）。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。
- 无迁移、无生产数据变更、无发布。

## 5. 本片未做（S87 下半）

- **F3-06 内部备注**：需要新增存储（当前 `src/modules/communications` 无 note 类字段，全量检索为空）。新增实体/字段必须走 `yarn db:generate` 并**先给你审批 SQL** 才能落地，且要证明备注永不进入外发 payload。属下半片。
- **F3-10 邮件线程头**：BFF 目前把 `parentMessageId` 交给 hub 组装 `In-Reply-To/References`（未在本片验证到具体 header）。需要一次针对性验证（真实 hub 调用或对 `assembleRfc2822` 的用例）后再声称“邮件线程可用”，不先写结论。
