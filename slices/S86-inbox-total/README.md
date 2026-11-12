# S86 · 收件箱 `total` 语义修正 + 失败态回归

> 设计依据：`full-design/rev2/D6-review-package.md` §7-S86、`rev2/D1-functional-spec.zh.md` F2-01/F2-02/F2-06。
> 状态：**代码与测试完成**（纯读路径改动，无迁移、无生产数据变更）。

## 1. 问题

`GET /api/communications/me/threads` 返回 `total: items.length`（原 `route.ts:197`），即**本页条数**。任何满页都会显示“共 30 条”，与真实会话数无关；D5 §3 记为疑点，D1 `F2-06` 要求改成真实总数或删除字段。

## 2. 改法

- 新增 `countConversations(em, scopeWhere)`：对**同一可见范围**做真实计数，**不含 `before` 游标**（翻页不改变总数语义）。
- `scopeWhere`（租户/可见渠道/组织作用域）与页面 `conversationWhere` 拆开，避免把游标混进计数。
- **计数失败不拖垮收件箱**：捕获后 `logger.warn` 并返回 `total: null`，HTTP 200 与 `items` 保持；`null` 表示“未知”，绝不用页大小冒充。
- OpenAPI 响应说明同步写清 `total` 语义。

## 3. 测试（`__tests__/routes.test.ts`，新增 4 条）

| 用例 | 断言 |
| --- | --- |
| 3 个会话、`limit=1`、带 `before` | `items.length=1` 且 `total=3`；计数条件**不含** `lastMessageAt` |
| 计数抛错 | 仍 200，`items` 正常，`total=null` |
| `channelId=not-a-uuid` | 422，且不查询 |
| 匿名 | 401，且不创建容器 |

fake EM 增加 `count()`：只认 `ExternalConversation`，其他实体抛错（防止“返回 0 掩盖错查询”）。

## 4. 证据

- `npx jest src/modules/communications/__tests__/routes.test.ts` → **44 passed**（原 40 + 新 4）。
- `npx jest src/modules/communications` → **42 passed / 3 skipped（realdb）/ 243 tests**。
- `yarn generate` exit 0；`yarn typecheck` exit 0；改动文件 `eslint` 无输出。

## 5. 未做（明确边界）

- 未改 Web/Android UI 展示（当前 UI 未消费 `total`；要展示“共 N 条”需另立 UI 需求）。
- 列表本身仍不轮询：会话页 20s `after` 轮询触发 `router.refresh()` 时列表随服务端重渲染（D5 §3 现状），未改变刷新模型。
