# S90（上）· 账号列表 + 每渠道「可收 / 可发」状态

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F1-01、F8-05；D6 §7-S90。
> 状态：**接口 + 页面 + 测试完成**；无迁移、无生产数据变更。真实收发仍等 P-2/P-3。

## 1. 解决的问题

此前本应用只有「连接渠道」页，**没有账号列表**（F1-01 缺）；且 Resend/SES 这类只出不进的邮箱在收件箱里就是一片空——用户会读成「没有客户来信」，而不是「这个号收不到信」（F8-05 要防的正是这个）。

## 2. 改动

| 文件 | 内容 |
| --- | --- |
| `lib/channel-availability.ts`（新） | 纯函数：按账号状态、平台是否有入站、WhatsApp/Messenger 是否有账号标识（webhook 钉定）、进程内是否注册了适配器，产出 `{inbound, outbound}` 与可操作提示 |
| `api/me/channels/route.ts`（新） | `GET` 列出调用方可用账号（团队共享 + 本人），带平台身份、归属、状态、`availability`，以及汇总计数 |
| `backend/communications/channels/page.{meta.ts,tsx}`、`ChannelsView.tsx`（新） | 账号列表页：加载/空/错误态；「可收/可发」用状态标签 + 不可用原因；底部汇总最近错误 |
| （复用）`hasChannelAdapter` | 判断进程内是否加载了该连接器，不猜测部署 |

判定规则（如实、不猜网络）：
- 非 `connected` → 两向都不可用，按 `requires_reauth` / `channel_error` / `paused` / `not_connected` 给出不同提示；
- 入站：仅 `whatsapp-business` / `messenger` / `gmail` / `imap` 具备入站；其余（resend/ses/discord…）明确标 `provider_has_no_inbound`；
- WhatsApp/Messenger 缺 `external_identifier` → `missing_account_identity`（webhook 无法钉定账号）；
- 出站：适配器未注册 → `adapter_missing`（部署问题，不是平台问题）。

**不编码平台出口状态**：`graph.facebook.com` 当前被拦是运维事实，不是本地状态；写死会在出口放开后立刻过期，所以代码里没有这一项，提示只给「能做什么」。

## 3. 测试

| 文件 | 用例 |
| --- | --- |
| `__tests__/channel-availability.test.ts`（8 条） | 连接正常的 WhatsApp 两向可用；Resend/SES 只发不收且提示含“只支持发送”；缺账号标识→`missing_account_identity`；邮箱入站不要求标识；四种非连接状态各自映射；适配器缺失归因部署；入站白名单是显式集合（新平台不能悄悄自称支持入站） |
| `__tests__/channels-availability-route.test.ts`（4 条） | Resend 账号：入站不可用、出站可用、汇总计数正确；`requires_reauth` 两向不可用；列表范围=团队共享+本人；匿名 401 且不开容器 |

## 4. 证据

- `npx jest src/modules/communications` → **50 passed / 3 skipped（realdb）/ 298 tests**。
- `yarn generate` exit 0（页面注册于 `backend-route-metadata.generated.ts:1003`，`pageGroup: Messages`、`pageOrder: 480`；接口注册于 `api-route-metadata.generated.ts:4731`）。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 5. 边界

- **会话页面内的「可收/可发」横幅未做**（下一片）：需要把 availability 带进会话详情响应并在 `InboxView` 里渲染；本片只覆盖账号列表。
- 最近错误/最后连接时间字段取决于 hub 实体是否真有该列；当前按可选字段读取，缺列时显示 `—`，没有伪造。
- 平台出口可达性不探测（见 §2 理由）；真实收发验收仍需 P-1/P-2/P-3。
