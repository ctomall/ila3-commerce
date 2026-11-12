# S94 · 对账写入的真实数据库证据（隔离库）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F8-03（unknown 对账）。
> 状态：**真实 Postgres 上跑通**；仅使用一次性隔离库，未触碰生产库。

## 1. 为什么还要做这一步

S91a 的单测用假 EM 驱动控制流，能证明“分支对不对”，不能证明“SQL 对不对”：`channel_metadata` 的 jsonb 写入会不会丢兄弟键、`unknown + direction + 组织作用域` 的过滤在真实 SQL 下是否按预期、NULL 组织（租户级渠道）是否被包含。这些只有真库能回答。

## 2. 做法

| 文件 | 作用 |
| --- | --- |
| `__tests__/realdb/product-reconciliation-runner.mts` | 通过 `tsx` 启动（Jest 的 CJS 变换无法加载 ESM 的 MikroORM），用**真实 MikroORM EntityManager** 建临时表并跑 4 个场景 |
| `__tests__/product-reconciliation-realdb.test.ts` | Jest 包装：`P6_REALDB_URL` 存在时才 spawn runner；未设置时 skip（skip = 未执行，不是已通过） |

隔离库：`initdb` 到 `/tmp/realdb-s94`，端口 **55435**，`listen_addresses=127.0.0.1`，trust 认证；跑完 `pg_ctl stop -m fast` 并删除数据目录。端口已确认释放，账号只存在于该临时库。

## 3. 实测输出

```
PASS append keeps delivery_status unknown and preserves sibling metadata
PASS a second verdict is refused
PASS a non-unknown link is refused
PASS listing filters unknown + outbound + NULL-inclusive organization scope
product reconciliation realdb: all scenarios passed
```

四个场景分别证明：
1. 写入后 `delivery_status` 仍是 `unknown`，`channel_metadata` 里原有 `lastAttemptAt` **未丢**；
2. 第二次结论被真实读到的 `reconciliation` 拒绝（409 语义）；
3. `delivered` 链接被拒（不是 unknown 不该有人工结论）；
4. 列表只含 **unknown + outbound + 本组织或 NULL 组织**，排除他人组织、已对账、入站行。

包装器两种模式都验证过：带 `P6_REALDB_URL` → 1 passed；不带 → 1 skipped。

## 4. 证据

- `P6_REALDB_URL=… npx jest …/product-reconciliation-realdb.test.ts` → 1 passed（1.1s）
- 不带环境变量 → 1 skipped
- 全模块（无环境变量）：**53 passed / 4 skipped / 321 tests**
- `yarn typecheck` exit 0；新增文件 `eslint` exit 0
- 介质清理：端口 55435 已释放、临时数据目录已删除；未动系统 18/main 集群

## 5. 边界

- 本片只覆盖对账写入/过滤；备注、客户关联、可收可发接口的 SQL 仍只有单测级证据（假 EM）。
- 临时库是手工 `initdb`，**未接入 CI**；要把 real-DB 证据变成常态门禁，需要环境提供 `P6_REALDB_URL`（属环境项）。
