# 交接清单 · 全渠道工作台 P0（实施完成，待验收）

> 本页是**一页可勾选的交接单**：代码侧 P0 已交付、门禁除构建外全绿；剩下的每一项都需要你或环境负责人拍板。
> 仓库 `/home/pro/apps/mercato` main；21 个提交（S85–S101）；设计依据 `full-design/rev2/`（D-1～D-7 已决）。

## 1. 门禁现状（本机实测）

| 门禁 | 状态 | 证据 |
| --- | --- | --- |
| `yarn generate` | ✅ | preflight 步骤 PASS（~44s） |
| `yarn typecheck` | ✅ | exit 0（owned/foreign 归因已就绪） |
| 模块测试 | ✅ | 57 套件 / 334 测试（9 跳过=realdb 需环境变量） |
| 真库 5 套（隔离库） | ✅ | `yarn realdb:check` 全 PASS，自动清理 |
| `yarn build` | ⛔ **BLOCKED** | Turbopack `Cannot find module '@tailwindcss/postcss'`；webpack 在 7G 单元 OOM（S101） |
| 真实收发整链 | ⛔ **待环境** | P-1/P-2/P-3 未到位 |

一条命令复跑前四项：`yarn preflight:communications`（约 1 分 34 秒）。

## 2. 需要你拍板的四件事

### ① 生产权限落地（F5-01，会改全公司业务员授权）

```bash
ILA3_ALLOW_ROLE_MIGRATION=1 node scripts/crm-reply-role-migration.mjs \
  --apply --tenant f27fa168-796c-4532-b9a4-1491a2e8c65e --approval "<批准人>"
```

- 影响：`employee` 获得 `communications.reply`、失去 `communication_channels.connect_user_channel`（不能再自建个人渠道，改用团队共享）。
- 回退：审计记录里带 `rollbackSql`（`docs/crm-platform/audit/reply-role-migration-*.json`），执行后重启 app 单元或等缓存 5 分钟。
- 先看计划：去掉 `--apply` 即只读检查。

### ② webhook 限流的分桶深度（S88）

- 现状：默认 `RATE_LIMIT_TRUST_PROXY_DEPTH` 未设，限流键是 `global`（每 provider 1200/min 全局桶，不是每 IP）。
- 要按真实 IP：先核对 Cloudflare→本机实际 `X-Forwarded-For` 链，再设合理深度；设错等于按伪造头分桶。
- 不设也能用（全局桶），但要接受高峰被 429 的可能；平台对 429 的重试语义仍未核实。

### ③ 真实渠道环境（P-1 / P-2 / P-3）

| 前置 | 缺什么 | 解锁什么 |
| --- | --- | --- |
| P-1 | 放通 `graph.facebook.com:443`（含媒体上传） | WhatsApp/Messenger 出站与媒体真实验收 |
| P-2 | 可达的 IMAP 主机（或放通 Google） | 邮件“来信”（Resend 只出不进） |
| P-3 | WhatsApp Cloud / Messenger Page / Resend 真实账号 | 真实送达验收 |

三者到位前，主线“收→回→送达”整链**不会**记为通过；现有证据只到“入站链路”与“出站路由”分层。

### ④ 构建门禁解除（S101）

任选其一：修 Turbopack 的 postcss 插件解析；把重任务单元 `MemoryMax` 提到约 12G 再跑 `next build --webpack`；或以 CI 构建结果作为证据。

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

- `yarn build` 未绿（S101）。
- hub `sendAsUser` 真实投递、任何真实渠道收发（P-1/P-2/P-3）。
- 事件总线真实消费（索引、通知、客户时间线）——真库 runner 里总线缺失。
- 备注编辑/删除、审计导出、模板管理（属 P1/二期）。
- 邮件渠道仍是**个人范围**连接；团队共享邮箱需安装包支持租户级邮件凭据（架构决策）。

## 5. 恢复工作的入口

1. `git log --oneline -25` 看片序（S85→S102）；
2. `yarn preflight:communications` 复跑门禁；
3. 从第 2 节四个决策中任一项被批准处继续；
4. 若继续做 P1：从 `ACCEPTANCE-MATRIX.md` §2 的 P1 行开始，不要重开二期范围。
