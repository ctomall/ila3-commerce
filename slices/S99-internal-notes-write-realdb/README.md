# S99 · 内部备注写入：真正执行装好的 compose 命令（真库）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-06；S96 遗留的“compose 未真库验证”。
> 状态：**完成**；一次性隔离库，5 套真库证据由 `yarn realdb:check` 一条命令复跑。

## 1. 上一轮留下的空白

S96 只证明了 app 自己的读查询和 compose 输入契约，**没证明装好的 `messages.messages.compose` 在真库跑得通**。这一轮把最小容器搭起来试了，结果可以跑：

- 容器只需提供 `em`；事件总线缺失时 hub 只打 WARN（`messages.message.sent` 发不出去），`query_index.upsert_one` 会因为 resolve 抛错被内部 catch 后跳过——都不影响写库。
- 命令通过 `commandRegistry.get('messages.messages.compose')` 取得（模块导入即注册）。

## 2. 真库场景（`__tests__/realdb/internal-notes-write-runner.mts`）

```
PASS compose creates an internal note row with no delivery flags
PASS the note is addressed to its author
PASS the composed note is returned by the app read path
PASS a note with a parent inherits the parent thread
PASS another conversation stays out of the list
internal notes write realdb: all scenarios passed
```

断言细节：
- 行字段：`visibility=internal`、`type=note`、`isDraft=false`、`sendViaEmail=false`、`sourceEntityType/Id` 指向会话、`senderUserId=作者`；
- 根备注把**自己的 id 作为 threadId**（hub 行为），带 `parentMessageId` 的备注继承父线程；
- `message_recipients` 恰好一条、收件人=作者、`status=unread`（internal 可见性要求至少一个收件人）；
- 用 app 的 `listInternalNotes` 读回同一条，且别的会话的备注不在结果里。

## 3. harness 扩到 5 套

`scripts/realdb-suite.mjs` 增加 `internal-notes-write` 套件，防朽测试同步改为 5 条路径断言。实跑：

```
[realdb] summary
  PASS reconciliation
  PASS customer-link
  PASS internal-notes
  PASS internal-notes-write
  PASS send-ledger
[realdb] cluster stopped and data dir removed
```

## 4. 证据

- 全模块无环境变量 → **56 passed / 8 skipped / 332 tests**；`yarn typecheck` exit 0；新增文件 `eslint` exit 0
- `yarn realdb:check` → 5 PASS 并自动清理
- 手工集群（端口 55439）已停、目录已删

## 5. 仍未覆盖（不是本轮能糊过去的）

- **hub `sendAsUser` 真实投递**：需要真实渠道凭据与出口（P-3/P-1），最小容器里没有意义。
- 事件总线的真实消费（索引、通知、客户时间线）：本 runner 里总线缺失，只验证了写库与读回。
- 备注编辑/删除（P1）与审计导出（F5-02）仍未实现。
