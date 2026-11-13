# 交接清单 · 全渠道工作台 P0（实施完成，待验收）

> 本页是**一页可勾选的交接单**：代码侧 P0 已交付、门禁除构建外全绿；剩下的每一项都需要你或环境负责人拍板。
> 仓库 `/home/pro/apps/mercato` main；21 个提交（S85–S101）；设计依据 `full-design/rev2/`（D-1～D-7 已决）。

## 1. 门禁现状（本机实测）

| 门禁 | 状态 | 证据 |
| --- | --- | --- |
| `yarn generate` | ✅ | preflight 步骤 PASS（~44s） |
| `yarn typecheck` | ✅ | exit 0（owned/foreign 归因已就绪） |
| 模块测试 | ✅ | 57 套件 / 334 测试（9 跳过=realdb 需环境变量） |
| 真库 6 套（隔离库） | ✅ | `yarn realdb:check` 6/6 PASS（S104 新增权限迁移演练），自动清理 |
| `yarn lint` | ✅ | 全仓 `yarn lint` exit 0（0 errors / 29 warnings）；本任务 62 个改动文件单独 lint exit 0（零输出） |
| `yarn ds:check` | ⚠️ 本任务新增 0 | 模块内 72 → 16，剩余 16 条全部在 S85 基线文件（InboxView 13、ReplyComposer 3）；全仓仍 298 条来自他人文件（S103） |
| `yarn build` | ⛔ **BLOCKED（资源）** | 换仓库内 dist 后 postcss 报错消失；受管单元 7G 内存 OOM（S101 §6）。需内存策略批准 |
| 真实收发整链 | ⛔ **待环境** | P-1 阻塞 WA/MS；邮箱凭据缺（P-2 网络已实测可通） |

一条命令复跑前四项：`yarn preflight:communications`（约 1 分 34 秒；加 `--with-lint` 附带全仓 lint）。

## 2. 需要你拍板的四件事

### ① 生产权限落地（F5-01，会改全公司业务员授权）

```bash
ILA3_ALLOW_ROLE_MIGRATION=1 node scripts/crm-reply-role-migration.mjs \
  --apply --tenant f27fa168-796c-4532-b9a4-1491a2e8c65e --approval "<批准人>"
```

- 影响：`employee` 获得 `communications.reply`、失去 `communication_channels.connect_user_channel`（不能再自建个人渠道，改用团队共享）。
- 回退：审计记录里带 `rollbackSql`（`docs/crm-platform/audit/reply-role-migration-*.json`），执行后重启 app 单元或等缓存 5 分钟。
- **已演练**：同一脚本在一次性 PostgreSQL 上跑通 check→refuse→apply→幂等→verify 失败回滚→rollback SQL，并固化为真库套件 `reply-role-migration`（`slices/S104-reply-role-migration-drill/README.md`）。
- 先看计划：去掉 `--apply` 即只读检查。

### ② webhook 限流的分桶深度（S88）

- 现状：默认 `RATE_LIMIT_TRUST_PROXY_DEPTH` 未设，限流键是 `global`（每 provider 1200/min 全局桶，不是每 IP）。
- 链路已只读核对（2026-11-13）：`mercato.ila3.top` → `cloudflared-mercato.service` → `http://127.0.0.1:3000`，中间**无 nginx**；应用监听 `*:3000`；生产 `.env` 里该变量仍是注释态 `# RATE_LIMIT_TRUST_PROXY_DEPTH=0`。
- **建议：第一阶段保持 0**（全局桶）。Meta 事件来自固定 IP 段，按 IP 分桶≈按 Meta 整体分桶，挡不住异常源却可能误伤正常投递；若你要改按 IP，我再用真实 webhook（P-3）抓一次实际头、确认 cloudflared 是否追加跳数后给深度值。
- 平台对 429 的重试语义仍未核实（Meta 文档出口被拦），所以不建议在没数据前收紧。

### ③ 真实渠道环境（P-1 / P-2 / P-3）

| 前置 | 缺什么 | 解锁什么 |
| --- | --- | --- |
| P-1 | 放通 `graph.facebook.com:443`（含媒体上传）。2026-11-13 实测仍**不通**（DNS 返回 104.244.42.197 / 2001::1） | WhatsApp/Messenger 出站与媒体真实验收 |
| P-2 | ~~可达 IMAP 主机~~ → 网络已实测可通（见下）；现在只缺**邮箱凭据**（并入 P-3） | 邮件“来信”（Resend 只出不进） |
| P-3 | WhatsApp Cloud / Messenger Page / Resend 账号 + 邮箱地址与应用专用密码 | 真实送达与真实来信验收 |

环境探针（2026-11-13，应用机 outbound TCP，`timeout 6 /dev/tcp/<host>/<port>`）：

- `graph.facebook.com:443` **不通** → P-1 仍阻塞 WA/MS；
- `api.resend.com:443` **通** → Resend 出站网络已具备，只缺账号/已验证发件人；
- `imap.gmail.com:993`、`smtp.gmail.com:587` **通**；`accounts.google.com:443`、`oauth2.googleapis.com:443` 不通——但装好的 `channel-imap` 用 IMAP/SMTP 用户名+密码（不走 Google OAuth），所以入站邮件不再卡网络，只缺凭据。

三者到位前，主线“收→回→送达”整链**不会**记为通过；现有证据只到“入站链路”与“出站路由”分层。

### ④ 构建门禁解除（S101，已收敛为一个原因）

- 已定位：`.mercato/next` 是符号链接 → `/storage/build-cache/crm/next`；用它构建时 Turbopack 报 7 条 `Cannot find module '@tailwindcss/postcss'`。把 dist 指到仓库内（`OM_DIST_DIR=…`）后，同一 HEAD、同一 node_modules，**该错误不再出现**，构建进入编译阶段（历史工作树用本地 dist 也留有 `status:"ok"` 的构建记录）。
- 现在只差内存：受管单元 `MemoryHigh=5G / MemoryMax=7G`，构建 41 分 46 秒后被 cgroup OOM 杀死（journal `Failed with result 'oom-kill'`，5G peak / 940.3M swap）。
- 需要你批一项：把该单元 `MemoryMax` 提到约 12G 跑一次构建，或以 CI 构建结果作证据。批准后我会把 dist 指到仓库内目录复跑，不再走符号链接缓存。

## 3. 交付物索引

| 类别 | 位置 |
| --- | --- |
| 设计（已批准） | `full-design/rev2/`（D1 v0.3、D6 v0.2、decisions、原型） |
| 验收矩阵 + 真库证据 | `slices/S91b-dead-letters-and-acceptance/ACCEPTANCE-MATRIX.md` |
| 各片实现与证据 | `slices/S85-*` … `slices/S101-*` 每片一份 README |
| 迁移脚本 | `scripts/crm-reply-role-migration.mjs`（只读默认） |
| 检查脚本 | `scripts/communications-preflight.mjs`、`scripts/realdb-suite.mjs` |
| 对账页/账号页/备注面板 | `/backend/communications/{exceptions,channels,inbox}` |

## 4. 未验证清单（不得当作已通过）

- `yarn build` 未绿（S101：postcss 触发条件已定位，剩余原因为 7G 内存 OOM）。
- hub `sendAsUser` 真实投递、任何真实渠道收发（P-1 阻塞 WA/MS；邮件缺账号凭据，网络已实测可通）。
- 事件总线真实消费（索引、通知、客户时间线）——真库 runner 里总线缺失。
- 备注编辑/删除、审计导出、模板管理（属 P1/二期）。
- 邮件渠道仍是**个人范围**连接；团队共享邮箱需安装包支持租户级邮件凭据（架构决策）。

## 5. 恢复工作的入口

1. `git log --oneline -25` 看片序（S85→S102）；
2. `yarn preflight:communications` 复跑门禁；
3. 从第 2 节四个决策中任一项被批准处继续；
4. 若继续做 P1：从 `ACCEPTANCE-MATRIX.md` §2 的 P1 行开始，不要重开二期范围。
