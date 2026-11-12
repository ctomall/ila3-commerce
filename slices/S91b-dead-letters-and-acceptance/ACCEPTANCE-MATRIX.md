# 一期（P0）证据矩阵与发布兼容策略

> 这是**证据清单与差距清单**，不是“一期验收通过”。真实收发链路仍未验收（前置 P-1/P-2/P-3 未到位），本文件不把分段证据拼成闭环结论。
>
> 交接单（一页可勾选、含四项待决策）：`slices/S102-handoff/HANDOFF.md`。

## 1. 提交与证据（仓库 `/home/pro/apps/mercato`，main）

| 片 | commit | 交付 | 可核对证据 |
| --- | --- | --- | --- |
| S85 | `00e2e4e` | reply 授权与 connect 收回同批迁移（脚本默认只读，单事务 + 后置校验 + 回退 SQL） | 11 条单测；`--check` 真实计划（生产租户 f27fa168…）；**生产未执行** |
| S86 | `cae22be` | threads `total` 真实计数（不含翻页游标），计数失败降级 `null` | 路由 4 条新用例；模块 243 测试 |
| S87a | `1cc89bd` | 渠道上限前置拒绝（能力声明取上限）+ 媒体配文 | 10 条上限用例 + 2 条路由；模块 254 |
| S87b | `c07a0e1` | 邮件 `In-Reply-To`/`References` 由已校验父消息推导（仅 email） | 4 条纯函数用例 + 伪造头被覆盖的路由用例 |
| S87c | `59bccae` | 内部备注（`messages.visibility=internal`、无 channel link） | 10 条；断言无发送路径 |
| S88 | `6f418fe` | webhook 验签前限流（验签前=分发器 handler 之前） | 4 + 3 条；实测 1200 放行/20 拒绝、约 17–22µs/请求 |
| S89 | `f78418e` | 会话↔客户关联（hub `contact_person_id` + customers） | 10 条 |
| S90a | `f1a3371` | 账号列表 + 每渠道可收/可发 | 8 + 4 条；页面/接口已注册 |
| S90b | `ae73e72` | 会话内可收/可发横幅；发不出时禁用回复框 | 路由 +1 条 |
| S91a | `d455199` | unknown 对账产品化（追加结论、不改状态、不重发） | 10 条 |
| S91b | 本片 | 入站死信可见（不返回 raw body） | 3 条 |

累计：`src/modules/communications` **56 套件 / 332 测试通过**（8 套件跳过=realdb 需 `P6_REALDB_URL`）。

## 1b. 真实数据库证据（隔离库；一条命令可复跑）

`yarn realdb:check`（`scripts/realdb-suite.mjs`）会临时 `initdb` 一个一次性集群、每个套件一个独立数据库、跑完自动 `pg_ctl stop` 并删除数据目录；任一失败则退出码非零。

| 套件 | 证明了什么 |
| --- | --- |
| `product-reconciliation-realdb` | 对账结论以 jsonb 追加、不改 `delivery_status`、兄弟键不丢；unknown+outbound+本组织或 NULL 组织过滤 |
| `customer-link-realdb` | 个人渠道掩码、NULL 组织可见、他组织掩码、关联持久化、重复关联 no-op（`updated_at` 不变）、解除、越界客户 404、LIKE 通配符转义 |
| `internal-notes-realdb` | 备注读取按 tenant/visibility/会话/deletedAt/组织过滤、升序；无组织会话只看租户级 |
| `internal-notes-write-realdb` | 真正执行装好的 `messages.messages.compose`（最小容器只有 `em`）：生成 internal 行、无投递标记、收件人=作者、父消息继承线程、读路径可读回 |
| `send-ledger-realdb` | 唯一键并发只留一个赢家、TTL 回收旧行、完成态 replay/conflict、release 可重用、42P01 降级 |

**仍未覆盖**：hub `sendAsUser` 的真实投递（需渠道凭据/出口）、任何真实渠道收发。该 harness 未接入 CI（需环境提供数据库或允许流水线内起 Postgres）。

## 2. P0 需求覆盖（只写实际状态）

| 需求 | 状态 | 说明 |
| --- | --- | --- |
| F1-01 账号列表 | ✅ 已实现 | S90a；平台身份来自 `external_identifier` |
| F1-02/03 添加向导、凭据连接 | ✅ 入口统一（S93） | WA/MS 应用内表单复用；邮件（Resend/IMAP/SES/Gmail）在向导里列明所需字段+入口，指向 hub「我的资料 → 连接渠道」。**邮件仍是个人范围连接**（hub 拒绝非 tenant-scope provider），要做团队共享邮箱需改安装包，属架构决策 |
| F1-05 重连/解绑 | ✅ S92 | 账号列表带「重连/重新授权」「解除绑定」；解绑走 hub 已装路由（个人=owner、团队=admin），确认文案说明影响面与历史保留。**暂停不支持**：hub 渠道模型没有 paused 状态，不发明 |
| F1-08 邮件接入 | ⚠️ 出站代码就绪，入站待环境 | Resend 出站适配器在装好的包里；入站受 P-2 阻塞（Resend 无入站）；可收/可发已在 S90a 明示 |
| F2-01/02/03 收件箱/增量/会话 | ✅ 复用现有 | D5 §3；本任务只修 total 与失败态 |
| F2-06 total 语义 | ✅ | S86 |
| F3-01/02 文本与媒体、caption | ✅ | S87a（上限取能力，不硬编码） |
| F3-06 内部备注 | ✅ | S87c |
| F3-08 幂等 | ✅ 复用现有 | D5 §9；本任务未改 |
| F3-10 邮件线程头 | ✅ 代码级 | S87b；**未在真实邮箱验证归并** |
| F4-01 客户关联 | ✅ | S89（会话内不支持新建客户） |
| F5-01 权限 | ⚠️ 代码已备，生产未生效 | S85；等你批 `--apply` |
| F8-01 发布兼容 | ⚠️ 策略已写，运行时未实现版本门 | 见 §3 |
| F8-03 人工恢复 | ✅ 出站 unknown + 入站死信可见 | S91a/S91b；死信重放仍走运维 |
| F8-04 webhook 限流 | ✅ | S88；默认全局桶（见 S88 README 已知边界） |
| F8-05 可收/可发 | ✅ | S90a/S90b |

## 3. F8-01 发布兼容策略（可执行口径，不含臆造版本号）

1. **API 兼容**：新增字段（`total` 语义修正、`channel.availability`、备注/对账接口）只增不改名；`total` 是唯一语义变更，旧值本就是错的（页大小），按“修复”处理并在本文件留痕。
2. **Android 版本窗**：最低支持版本按 OTA manifest 的实际值声明（当前 `3.71.54 / 37154`），**代码里没有版本门**；要落地需在 API 层加最低版本拒绝，属 P1，不在本片伪造。
3. **回退边界**：S85 是唯一的权限数据变更，回退 SQL 随审计记录落盘；其余各片无数据库迁移，回退=回滚部署到上一 release。
4. **发布前检查**：`yarn preflight:communications`（S100）串起 `generate → typecheck → 模块测试 → 真库 5 套`，约 1.5 分钟；**构建（`yarn build`）当前 BLOCKED**：Turbopack 报 `Cannot find module '@tailwindcss/postcss'`（安装包 CSS），webpack 在 7G 受限单元 OOM（S101），均未指向本任务文件——在此之前不得声称构建通过；typecheck 失败会按 owned/foreign 归因——本片范围内失败退出码 1，仅他人未提交代码导致则退出码 2（BLOCKED，不得当成自身回归，也不得发布）。仍须在干净工作树复跑。

## 4. 待环境（未验收，禁止当作已通过）

| 前置 | 缺什么 | 影响 |
| --- | --- | --- |
| P-1 | 放通 `graph.facebook.com:443`（含媒体上传） | WhatsApp/Messenger 出站与媒体无法真实验收 |
| P-2 | 可达的 IMAP 主机（或放通 Google） | 邮件“来信”无路径，Resend 只出不进 |
| P-3 | WhatsApp Cloud / Messenger Page / Resend 真实账号 | 只能验证代码路径，不能验证真实送达 |

**分层验收记录**（只能这样记，不能合并成闭环）：
- 入站链路：WA/MS webhook 已注册且单测覆盖签名/钉定/去重/死信；**无真实 Meta 回调**。
- 出站链路：发送路由单测覆盖上限、幂等、媒体、线程头；**无真实外发**。
- 整链（收→回→送达）：**未验收**，缺 P-1 或 P-2 + P-3。
