# S95 · 提取会话访问/客户关联，并在真实 Postgres 上验证（F4-01）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F4-01；D6 §7-S89。
> 状态：**完成**；仅一次性隔离库，未触碰生产库。

## 1. 为什么重构

备注路由（S87c）和客户关联路由（S89）各写了一份“会话/渠道归属”校验，逻辑相同、复制两份。现在提取为：

| 文件 | 职责 |
| --- | --- |
| `lib/conversation-access.ts` | `resolveConversationForCaller`：tenant + NULL-inclusive 组织作用域、渠道未删除、个人渠道必须属于调用者；失败一律 masked not-found |
| `lib/customer-link.ts` | `findCustomerCandidates`（LIKE 转义、限制 20、组织作用域）、`readConversationCustomer`、`setConversationCustomer`（幂等 no-op / 越界客户 404）、`customerSummary` |

两条路由改为调用它们，响应形状不变（客户接口新增 `changed` 字段，属 additive）。

## 2. 真实库抓到一个真 bug

第一次跑真库时，第 4 个场景失败：`contact_person_id` 没写进去。原因不是 SQL，而是**实体附着**——`setConversationCustomer` 拿到的是另一个 fork 里的 detached 实体，属性赋值成功但 `flush()` 静默不持久化。

修法：写路径先用 `(id, tenantId)` 重新加载实体再赋值（渠道归属已由调用方校验）；并在注释里写明原因。**单测用假 EM 永远发现不了这个**——这就是真库证据的价值。

## 3. 真库场景（`__tests__/realdb/customer-link-runner.mts` + `customer-link-realdb.test.ts`）

隔离库：`initdb` → `/tmp/realdb-s95`，端口 **55436**，trust，仅 127.0.0.1。

```
PASS another employee personal channel is masked
PASS own channel and NULL-organization conversation resolve
PASS another organization conversation is masked
PASS link persists and re-linking is a no-op
PASS unlink clears the column
PASS out-of-scope customer is refused as not found
PASS candidates respect scope and escape LIKE wildcards
conversation access + customer link realdb: all scenarios passed
```

其中“re-linking is a no-op”同时断言 `updated_at` 未被 bump；“escape LIKE wildcards”用 `100%` 查询只命中 `100% 折扣客户`，不会命中文档里随机的其他客户。

## 4. 证据

- 带 `P6_REALDB_URL` 的包装器 → 1 passed（1.16s）；不带 → skip
- 全模块无环境变量 → **53 passed / 5 skipped / 321 tests**
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0
- 介质清理：端口 55436 已释放、`/tmp/realdb-s95` 已删除、无残留 postgres 进程（`pgrep -af` 只匹配到查询命令本身）

## 5. 边界

- 备注（S87c）的写入走 hub `messages.messages.compose`，真库验证需要 messages 模块整套表与命令总线，**本片未覆盖**；它目前只有假 EM 单测。
- 该 real-DB 套件同样未接入 CI（需要环境提供 `P6_REALDB_URL`）。
