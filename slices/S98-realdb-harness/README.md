# S98 · 一次性隔离库 harness：四个真库套件一条命令跑完

> 设计依据：本目标“每片可核对证据”的要求；延续 S94–S97 的真库验证。
> 状态：**完成**；不触碰生产库，未接入 CI（原因见 §4）。

## 1. 解决的问题

S94–S97 的四个真库套件此前靠手工 `initdb` + 记端口 + 手动清理。手工步骤不可复跑，也就等于“证据存在但不可重放”。现在一条命令：

```bash
yarn realdb:check      # 或 node scripts/realdb-suite.mjs
```

行为：
1. 自动定位 PostgreSQL 二进制（`/usr/lib/postgresql/*`、`/usr/pgsql`、Homebrew），也可用 `REALDB_PG_BIN` 指定；
2. `initdb` 到临时目录（trust 认证、仅 127.0.0.1、随机空闲端口）；
3. **每个套件一个独立数据库**（`send-ledger` 会 drop 自己的表，不能影响别人）；
4. 逐个跑 jest 包装器并注入 `P6_REALDB_URL`；
5. `finally` 里 `pg_ctl stop -m fast` + 删除数据目录（失败也清理）；`--keep` 才保留。

## 2. 实跑输出

```
[realdb] cluster ready on 127.0.0.1:41871
[realdb] summary
  PASS reconciliation
  PASS customer-link
  PASS internal-notes
  PASS send-ledger
[realdb] cluster stopped and data dir removed
```

`--only ledger` 也验证过：只跑发送台账，同样自动清理。任一失败 → 退出码 1（harness 自身错误 → 3）。

## 3. 防朽测试（`__tests__/realdb-harness-contract.test.ts`，4 条）

harness 本身无法在 jest 内跑（要 spawn Postgres），所以钉住它最容易悄悄失效的四件事：四个套件路径都存在、清理行为仍在、`realdb:check` 脚本仍指向它、不写死 PostgreSQL 版本路径。

## 4. 为什么不接 CI

需要流水线里允许起 Postgres（或提供 `P6_REALDB_URL`）并决定资源配额；这是环境策略决定，不是代码问题。当前定位：**本机发布前检查项**，已写进 `ACCEPTANCE-MATRIX.md` §1b。

## 5. 证据

- `node scripts/realdb-suite.mjs` → 4 PASS，自动清理
- `node scripts/realdb-suite.mjs --only ledger` → 1 PASS，自动清理
- 全模块无环境变量 → **56 passed / 7 skipped / 332 tests**；`yarn typecheck` exit 0；新增文件 `eslint` exit 0
