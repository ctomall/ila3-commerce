# S97 · 发送幂等台账的真实数据库证据（F3-08）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-08；D5 §9 现状。
> 状态：**真实 Postgres 上跑通 7 个场景**；仅一次性隔离库。

## 1. 为什么必须上真库

台账的全部价值都在三个数据库语义上，假 EM 一个都证明不了：

1. `(tenant, user, clientRequestId)` **唯一约束**在真正并发下只放一个赢家；
2. `createdAt` 超过 2 分钟 TTL 的 in-flight 行可被**回收且旧行消失**（否则崩溃会永久锁死调用方的 key）；
3. 表缺失（`42P01`）时必须降级为 `SendLedgerUnavailableError`（路由 503 + 可重试），而不是裸 500。

## 2. 实测（`__tests__/realdb/send-ledger-runner.mts` + `send-ledger-realdb.test.ts`）

隔离库 `/tmp/realdb-s97`、端口 **55438**、trust、仅 127.0.0.1：

```
PASS first claim reserves the key with its payload hash
PASS an in-flight retry reports in_flight without a second row
PASS completed keys replay on the same hash and conflict on a different one
PASS a stale in-flight row is reclaimed and the old row is gone
PASS release removes the row so the key is usable again
PASS concurrent claims produce exactly one reservation
PASS a missing ledger table surfaces SendLedgerUnavailableError
send ledger realdb: all scenarios passed
```

其中第 6 条是**真并发**：三个 fork 同时 claim 同一 key，断言恰好 1 个 `claimed`、库里恰好 1 行，另外两个只能拿到 `in_flight`/`replay`——这正是唯一约束 + 冲突后回读的实现意图。第 3 条同时验证了“完成态同 hash 回放、异 hash 409 语义”。

## 3. 证据

- 带 `P6_REALDB_URL` → 1 passed（1.11s）；不带 → skip
- 全模块无环境变量 → **55 passed / 7 skipped / 328 tests**
- `yarn typecheck` exit 0；新增文件 `eslint` exit 0
- 介质清理：端口 55438 释放、`/tmp/realdb-s97` 删除、无残留 postgres 进程

## 4. 边界

- runner 末尾 drop 了 `communications_send_requests` 以触发 `42P01`，因此**该库在该场景后不完整**；只用于一次性库，未接入 CI。
- 未覆盖：hub 侧 `sendAsUser` 真实投递（需渠道凭据与环境）；本片只证明台账自身语义。
