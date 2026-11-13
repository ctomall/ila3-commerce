# S105 · 生产权限落地 + 构建门禁转绿（2026-11-13，用户批准「批准所有」）

> 本轮把两个此前 BLOCKED 的事项做掉：① S85 权限迁移在生产执行（带审计与回退）；② `yarn build` 拿到绿色构建（条件：仓库内 dist + 12G/TasksMax≥8192 的一次性单元）。
> 仍然没做的：真实渠道收发——生产库里 **0 个渠道账号、0 个外部会话**，P-1 网络仍不通，按目标边界继续记「待环境」。

## 1. S85 生产权限：已执行并复核

批准：用户对话「批准所有」（2026-11-13，Asia/Shanghai）。

执行前只读计划（`--check`）：三个角色都要变——`superadmin`/`admin` 补 `communications.reply`；`employee` 补 reply 并**收回** `communication_channels.connect_user_channel`。

```bash
ILA3_ALLOW_ROLE_MIGRATION=1 node scripts/crm-reply-role-migration.mjs --apply \
  --tenant f27fa168-796c-4532-b9a4-1491a2e8c65e --approval '用户对话批准「批准所有」2026-11-13'
```

结果：`{"mode":"apply","changed":3,...}`（exit 0）。审计记录（含 3 条 `rollbackSql`）：

- `docs/crm-platform/audit/reply-role-migration-2026-11-13T01-03-07-217Z.json`（已被 `3c25c2d` 一并提交）

复核（同一脚本只读 `--check`）：`"changing":[]`、`"pendingTenants":0`，三个角色均 `unchanged`。

- **未重启 app 单元**：脚本说明 `RbacService` 缓存 5 分钟，按此窗口生效；需要立即生效才重启。
- 回退：执行该 JSON 的 `rollbackSql`（3 条 update），然后重启 app 单元或等 5 分钟。

## 2. 构建门禁：转绿，以及它的两个真实条件

### 2.1 根因（这次拿到了决定性证据）

- 仓库里 `.mercato/next` **和** `.mercato/next-staging` 都是符号链接 → `/storage/build-cache/crm/*`（`ls -ld`）。
- Turbopack 把 postcss transform 的 Node 运行时代码生成在 **distDir 内**；当 distDir 在仓库外时，那些 chunk `require('@tailwindcss/postcss')` 无法回找仓库的 `node_modules`。日志里的 Require stack 直接指到 `/storage/build-cache/crm/next-staging/build/chunks/…`（`/tmp/s105-build-12g.log`），同一次构建换成仓库内 dist 后该错误 **0 次**（`/tmp/s105-build-gate2.log` grep 计数 0）。
- 内存：12G 单元里 `next-build` RSS 峰值约 **8.4G**（`ps` 实测），所以 7G 单元必然 OOM——这也解释了 S101 尝试三的 41 分钟 OOM。
- 并发：`Collecting page data using 42 workers` 需要足够的任务数；一次性 scope 里 `TasksMax=512` 会以 `OS can't spawn worker thread: Resource temporarily unavailable` + `SIGABRT` 失败，`TasksMax=8192` 通过。

### 2.2 绿色构建证据

```bash
XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
systemd-run --user --scope --quiet \
  -p MemoryHigh=9G -p MemoryMax=12G -p CPUWeight=25 -p IOWeight=25 -p TasksMax=8192 \
  --working-directory=/home/pro/apps/mercato -- \
  env OM_DIST_DIR=.mercato/next-gate yarn build
```

- **exit 0**；`.mercato/build-info.json` → `status:"ok"`，`commit 6989d138`，`builtAt 2026-11-13T01:42:10Z`；
- `BUILD_ID = qdk-QWt7ONKJxEKuuejYY`，完整路由表输出到日志末（`/tmp/s105-build-gate2.log`）;
- 日志中 `Cannot find module '@tailwindcss/postcss'` 计数 **0**；
- 构建后还原 Next 自动改写的 `tsconfig.json`（它把 `.mercato/next-gate/types` 加进了 include），并删除 2.7G 的门禁产物 `.mercato/next-gate`。

构建对应提交是 `6989d13`；当前 HEAD `3c25c2d` 与它只差文档（`git diff --stat 6989d13..HEAD` 全是 docs），代码一致。

### 2.3 留下的运维条件（不是代码问题）

默认 `yarn build` 仍会因为 `.mercato/next` 指向 `/storage` 而报 postcss 解析错，且默认受管单元只有 7G。要让它开箱即绿，二选一：

1. 把 `.mercato/next` 从符号链接改成仓库内真实目录（或构建时固定 `OM_DIST_DIR` 到仓库内）；并
2. 构建单元给到约 12G、`TasksMax ≥ 8192`。

这两条属于环境/资源策略，本片没有擅自改共享 wrapper 或删符号链接。

## 3. 生产现状（只读核查，决定真实收发仍是「待环境」）

| 项 | 值 |
| --- | --- |
| `communication_channels` | **0** |
| `external_conversations` | **0** |
| `messages` | 7（历史测试/种子） |
| 与渠道相关的 env 键 | 只有 `META_WEBHOOK_VERIFY_TOKEN`（无 App Secret、无 Resend/IMAP 凭据） |

`graph.facebook.com:443` 仍不通（P-1）。所以「真实外发/真实来信」无法验收，继续按目标边界记「待环境」，不拿分层证据冒充闭环。

## 4. S88 分桶深度：按批准保持默认

`RATE_LIMIT_TRUST_PROXY_DEPTH` 未设（=0，全局桶）。链路 `mercato.ila3.top → cloudflared-mercato → 127.0.0.1:3000` 已核对，无 nginx；未改生产 env。要改按 IP 需先抓真实 webhook 头（依赖 P-3）。

## 5. 证据索引

- 构建：`/tmp/s105-build-gate2.log`（绿）、`/tmp/s105-build-gate.log`（TasksMax 失败）、`/tmp/s105-build-12g.log`（postcss Require stack）
- 权限：`/tmp/s105-prod-check.json`（执行前计划）、`/tmp/s105-prod-apply.log`、生产审计 JSON、执行后 `--check`
- 生产库存：本轮只读 SQL（channels/conversations/messages 计数、env 键名）
