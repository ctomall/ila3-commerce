# S107 · 真实数据 UI 验收（隔离副本 + 测试渠道）· 2026-11-13

> 生产租户 **0 渠道 / 0 会话**，所以收件箱、会话、回复、内部备注一直没有“有数据”的验收。
> 本片用 **一次性数据库副本 + release 应用在 3100 端口** 搭了一个隔离验收场：数据由 hub 自己的
> test-seed API 写入，UI 由真实 employee 账号操作并截图。生产库只被只读导出，验收场用完即拆。

## 1. 方法（可复跑）

1. `initdb` 一次性集群（55432）→ `pg_dump` 生产库（只读）→ `pg_restore` 进副本；
2. 从 `/home/pro/releases/mercato/current` 启动第二个实例：
   `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/open_mercato OM_ENABLE_TEST_CHANNEL_SEEDING=1 next start -p 3100`；
3. 用 superadmin 调 hub 的 test-seed：`connect-channel`（`providerFlavor:"chat"`）→ `ingest-inbound` ×2；
   - 渠道改成 `user_id=NULL, visibility=shared`（团队共享），否则只有创建者本人可见；
   - 通道类型设为 `whatsapp`，否则 composer 不渲染（页面只对 whatsapp/messenger/email/imap/gmail 给出发送框）；
   - 会话的 `external_conversation_id` 设为发送者句柄 `user-778812`，与 composer 的收件人一致，否则 24h 窗口判定会找不到会话；
4. 真实 employee 登录，跑 `scripts/crm-communications-thread-ui-evidence.mjs`（`--mode capture`）；
5. 记一条 provider 回显（`external_messages` outbound + 关联链接，stub 不会自己回显）后跑 `--mode echo`。

## 2. 截图与断言（隔离验收场，release `6796b14`）

| 截图 | 内容 | 断言 |
| --- | --- | --- |
| `seeded-inbox-list.png` | 收件箱列表出现 1 个会话（王小雨 · 团队 WhatsApp（隔离验收场）· 团队共享） | ✅ 会话可列、列表可见 |
| `seeded-thread.png` | 会话详情：客户两条来信正文、渠道可用性横幅、回复身份、composer、备注面板 | ✅ 正文可见 |
| `seeded-internal-note.png` | 内部备注写入后立即出现在面板（作者 id + 时间） | ✅ 备注保存并渲染 |
| `seeded-reply-sent.png` | 回复提交后 “已提交投递；平台回执到达后状态会更新。” | ✅ `POST /api/communications/me/send` → **202** |
| `seeded-thread-with-echo.png` | 回显后出现 “我方发出 · 待发送” 气泡，正文与提交内容一致 | ✅ 回显气泡渲染（`--mode echo`） |

合计：capture 7 条断言 + echo 4 条断言，全部通过；页面无 pageerror / console error / 5xx。

## 3. 这一轮证明了什么 / 没证明什么

**证明**：

- 收件箱 → 会话详情 → 内部备注 → 回复提交这条主链在**有数据**时可用，且备注不出现在客户消息流；
- 回复走真实 `send` 路由：202 + `enqueuedForDelivery`，回显后在会话里显示为我方消息；
- 渠道可用性横幅在“只能发不能收”的渠道上如实提示，不是空白页。

**没证明**：

- 仍是 **stub provider**（`__test_seed_chat__`），不是真实 WhatsApp/Meta/邮件；真实送达、真实回执仍待 P-1/P-3；
- 回显是**模拟**的（stub 不回显），出站气泡停在“待发送”；真实平台回执未走通；
- 会话未关联客户（“未关联客户”），客户搜索/关联这条支线没有数据验收；
- 生产租户仍是 0 渠道 0 会话（验收场已拆，没往生产写任何数据）。

## 4. 附带修复

`inbox/[thread]/page.tsx` 之前只解析 `canReply`，不解析 `canConnect`：超管打开任意会话会丢掉“连接渠道”入口（与列表页不一致）。本片一并补上，复用同一 `resolveCanConnectTenantChannel`。

## 5. 环境清理（已执行）

- 停止 3100 实例（端口已关闭）、`pg_ctl stop` 停一次性集群（55432 已关闭）、删除 `/tmp/s107-acceptance` 与临时脚本；
- 生产只读复核：`communication_channels=0`、`external_conversations=0`；生产 release 仍健康（307）。

## 6. 门禁

- 模块测试 **58 套件 / 338 测试通过**（9 套件 / 10 测试跳过 = realdb 需环境变量）
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0

## 7. 证据索引

- `docs/crm-platform/verify/communications-thread-ui-seeded-2026-11-13/evidence.json`（capture：状态、断言、截图 sha256）
- 同目录 `evidence-echo.json`（echo 轮次）
- 截图 5 张（同上目录）
