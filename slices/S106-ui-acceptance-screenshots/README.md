# S106 · 生产 UI 验收（真实登录 + 截图）· 2026-11-13

> 用真实 superadmin / employee 账号在生产 release 上跑一遍四个自建页面，留下 **8 张截图 + 12 条断言**；
> 结果同时验证了 S85 权限迁移的**运行时效果**，并抓到一个真实 UI 缺陷（员工可见「连接渠道」入口却必然 403），
> 该缺陷已在本片修掉（`9377485`），视觉复验要等下一次发布。

## 1. 方法（可复跑）

```bash
node scripts/crm-communications-ui-evidence.mjs \
  --base http://127.0.0.1:3000 --label prod \
  --out docs/crm-platform/verify/communications-ui-prod-2026-11-13
```

- 目标：生产 `http://127.0.0.1:3000`（`mercato.ila3.top` 隧道后端）；本次实测 release `be8b034e`（`/home/pro/releases/mercato/current/release.json`）。
- 账号：`~/.ila3-admin-credentials`（0600）里的 **superadmin** 与 **employee**；只用于 `/api/auth/login`，不打印、不落盘。
- 只读：只做 GET 页面与 GET API；没有创建、修改、发送、解绑。截图前等页面自身内容渲染完（不拍骨架屏）。
- 证据：每页记录 heading、正文前 600 字、可点击控件清单、行数、页面级报错/5xx；每张 PNG 记 sha256。

## 2. 结果：12/12 断言通过

| 页面 | superadmin | employee |
| --- | --- | --- |
| `/backend/communications/channels` | ✅ 渲染（空态，带「连接渠道」） | ✅ 渲染（空态，**也带「连接渠道」← 缺陷**） |
| `/backend/communications/channels/connect` | ✅ 向导渲染（WA/Messenger/Resend/IMAP 选项） | ⛔ **Access Denied**（`connect_tenant_channel`） |
| `/backend/communications/inbox` | ✅ 渲染（「没有可访问的会话」） | ✅ 渲染（同左） |
| `/backend/communications/exceptions` | ✅ 对账 0 条 + 死信空态 | ⛔ **Access Denied**（`manage`） |

服务端功能门（同一会话直接打 API）：

| API | superadmin | employee |
| --- | --- | --- |
| `GET /api/communications/me/channels` | 200 | 200（`view`） |
| `GET /api/communications/me/threads` | 200 | 200（`view`） |
| `GET /api/communications/me/reconciliation` | 200 | **403**（`manage`） |
| `GET /api/communications/me/dead-letters` | 200 | **403**（`manage`） |

页面级诊断（pageerror / console error / 5xx / 失败请求）两角色**全为空**。

## 3. 这次抓到什么

### 3.1 S85 的运行时效果被眼见为实

S105 只证明了权限行写入（`changed:3`、`pendingTenants:0`）。本片进一步证明**权限真的在请求上生效**：
employee 的只读门（threads/channels 200）与管理员门（reconciliation/dead-letters 403、两个受限页面 Access Denied）在同一次会话里同时成立，superadmin 对照全通。

### 3.2 缺陷：员工能看到「连接渠道」，点了必然 403

`ChannelsView` 与 `InboxView` 无条件渲染「连接渠道」链接，而向导页的门是 `communication_channels.connect_tenant_channel`；
S85 收回 employee 的 legacy connect 后，这个入口对员工就是死链（截图 `prod-employee-channels.png` 与 `prod-superadmin-channels.png` 字节相同，都是 73,226 B —— 两个角色看到的是同一页）。

修复（`9377485`）：

- 新增 `lib/channel-connect-grant.ts` / `channel-connect-grant-server.ts`：用**向导页自己的 feature**服务端解析，异常一律关闭入口；
- `channels/page.tsx`、`inbox/page.tsx` 变成 async 服务端页，把 `canConnect` 传给视图；
- 两个视图只在 `canConnect` 为真时渲染链接；
- 测试 `__tests__/connect-grant.test.ts`（4 条）：feature 名必须等于向导页 `page.meta.ts` 的 `requireFeatures`（防漂移）、有权限显示、无权限关闭、解析抛错关闭。

**尚未视觉验证**：当前生产 release `be8b034e` 不含 `9377485`（提交只在本机 main），所以截图仍是修复前状态；修复的页面级截图随下一次发布补，不能提前说“生产已改好”。

### 3.3 数据态：所有页面都是空态，不是“验收通过”

生产仍是 `communication_channels 0 / external_conversations 0`，所以收件箱、会话详情、回复框、内部备注、客户关联**没有内容可看**——
这些截图的结论只到“页面能真实渲染 + 权限门正确”，**不等于**收发验收。真实收发仍按 P-1/P-3 记「待环境」。

## 4. 门禁（修复提交 `9377485` 之后）

- `yarn preflight:communications`：**PASS**（generate 112s / typecheck 27s / module-tests 15s / realdb 16s）
- 模块测试：**58 套件 / 338 测试通过**（9 套件 / 10 测试跳过 = realdb 需环境变量；本次新增 4 条）
- `yarn typecheck`：exit 0

## 5. 证据索引

| 文件 | 说明 |
| --- | --- |
| `docs/crm-platform/verify/communications-ui-prod-2026-11-13/evidence.json` | 页面/API 观测、断言、截图 sha256、release 身份 |
| `.../SUMMARY.md` | 同内容表格版 |
| `prod-superadmin-{channels,channels-connect,inbox,exceptions}.png` | 管理员视角（4 张） |
| `prod-employee-{channels,channels-connect,inbox,exceptions}.png` | 员工视角（4 张，含两张 Access Denied） |

复跑命令见 §1；换 `--label`/`--out` 即可给下一次 release 出对照图。

## 6. 修复已上线 + 修复后复验（2026-11-13 04:25 UTC）

| 步骤 | 结果 |
| --- | --- |
| 推送 | `e703cbd`（截图/文档）→ `6796b14`（证据脚本断言） |
| CI `build-artifact` | run `43363564258`：typecheck / unit / build / package / verify / upload **全绿** |
| 自动部署 | `ila3-auto-deploy` 于 04:25:56 切到 release `6796b149…`，3000 端口健康（307），页面右下角 `v0.2.2 (6796b14)` |
| 修复后复验 | `--label postfix --expect-connect-cta hidden`：**8 截图 / 15 断言全过** |

修复前后对照（截图取自生产同一条命令）：

| 观察点 | 修复前 `be8b034e` | 修复后 `6796b14` |
| --- | --- | --- |
| 员工渠道页「连接渠道」 | 有（与超管截图字节相同） | **无**（`connectCta=false`） |
| 员工收件箱「连接渠道」 | 有 | **无** |
| 超管渠道页「连接渠道」 | 有 | 有（`connectCta=true`） |
| 员工 channels API / threads | 200 / 200 | 200 / 200 |
| 员工 reconciliation / dead-letters | 403 / 403 | 403 / 403 |
| 员工 connect 向导 / exceptions 页 | Access Denied | Access Denied |

- 修复后证据：`docs/crm-platform/verify/communications-ui-postfix-2026-11-13/`（`evidence.json` 含 9 条断言 + 8 张 sha256）
- 员工渠道页截图 sha `1d83523f…`，超管同页 `836ed026…` —— 两个角色不再是同一张图。

仍然成立的口径：页面依然全是空态（0 渠道 / 0 会话），真实收发仍按 P-1/P-3 记「待环境」；本片只证明 UI 与权限门，不证明送达。
