# S91（上）· unknown 对账的产品内入口（F8-03）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F8-03；D6 §7-S91。
> 状态：**接口 + 页面 + 测试完成**；无迁移、无生产数据变更。

## 1. 问题

`unknown` 是终态：平台可能已收到也可能没有，**绝不自动重发**。此前唯一的处置方式是 CLI（`scripts/reconcile-unknown.mjs`），一线主管没法在界面上闭环。

## 2. 改动

| 文件 | 内容 |
| --- | --- |
| `lib/unknown-reconciliation.ts`（新） | 列出调用方范围内**未对账**的 unknown 出站链接；记录结论时把 `{outcome, note, operatorUserId, at}` 追加进链接元数据 `channel_metadata.reconciliation`，**不改 `delivery_status`、不发送** |
| `api/me/reconciliation/route.ts`（新） | `GET` 列表（附会话主题/渠道名，不读正文）；`POST` 记录结论 |
| `backend/communications/exceptions`（新页） | “发送结果对账”：每条结果选“平台侧确认已发出/未发出” + 至少 8 字核实依据；已记录的直接显示结论，不再给第二票 |

与 CLI 对齐的规则：note ≥ 8 字符；只处理 `unknown`；不同之处是**产品侧对同一条只接受一条结论**（重复提交 409 `RECONCILIATION_ALREADY_RECORDED`），避免两个人各写一票互相盖掉；CLI 的追加语义保留给运维。

## 3. 权限与范围

- 路由与页面都要求 `communication_channels.manage`（运维动作，不是收件箱读取）；
- 列表按 tenant + 组织作用域过滤；链接不在范围内 → 404（不泄露存在性）。

## 4. 测试（`__tests__/unknown-reconciliation.test.ts`，10 条）

lib：只列未对账、`includeReconciled` 才含已对账、where 含 `deliveryStatus=unknown`；记录后 `deliveryStatus` 仍是 unknown 且 flush 一次；note 太短 422；非 unknown 409；已对账 409；越界/非法 id 404。
路由：列表带会话/渠道标签；冲突映射 409；非法载荷 422 且不开容器；匿名 401。

## 5. 证据

- `npx jest src/modules/communications` → **51 passed / 3 skipped（realdb）/ 309 tests**。
- `yarn generate` exit 0（页面注册 `backend-route-metadata.generated.ts:1007`，`pageGroup: Messages`、order 490；接口已注册）。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 6. 边界

- 不提供“确认未发出后重新发送”按钮：重发需要新 `clientRequestId` 与人工决策，属后续流程（当前 CLI/接口仍可发送）。
- 死信（`channel_ingest_dead_letters`）未纳入此页；本片只覆盖出站 unknown，死信可见性属 F8-03 剩余项。
- 未记录谁在何时查看了该页（审计属 F5-02 二期）。
