# 报价 → 订单闭环：接口覆盖与字段缺口

数据来源：认证态下拉取 `/api/docs/openapi`（11,250,549 bytes），以及 `/api/sales/quotes`、`/api/sales/order-statuses`、`/api/customers/dictionaries/currency` 的真实响应。测量时间 2026-11-08。

## 1. API 边界是成文且完整的

| 指标 | 值 |
| --- | --- |
| OpenAPI path | **676** |
| OpenAPI operation | **1149** |
| 销售域 path | **99** |
| 销售域 operation | **225** |
| 未认证访问 | 401（`/api/docs/openapi`） |

结论：独立前端（路线 B）所需的接口面不是未知量，而是已文档化。缺口在页面能力，不在接口缺失。

## 2. 闭环链路

| 环节 | 接口 | 说明 |
| --- | --- | --- |
| 客户 | `GET/POST/PUT/DELETE /customers/companies`、`/customers/people` | 实体 + 关联 |
| 商机 | `GET/POST/PUT/DELETE /customers/deals`、`/customers/deals/{id}`、`/customers/deals/{id}/companies`、`/customers/deals/{id}/people` | 含看板阶段：`/customers/deals/bulk-update-stage`、`/customers/deals/aggregate` |
| 报价 | `GET/POST/PUT/DELETE /sales/quotes`、`/sales/quotes/{id}` | 明细行、`lineItemCount` |
| 报价 → 发送 | `POST /sales/quotes/send` | 存在，spec 无请求体定义 |
| 报价 → 转订单 | `POST /sales/quotes/convert` | 存在，spec 无请求体定义 |
| 订单 | `GET/POST/PUT/DELETE /sales/orders` | 与报价同构字段 |
| 单据历史 | `GET/POST /sales/document-history` | 「该单据发生过什么」的唯一来源 |
| 单据编号 | `POST /sales/document-numbers` | 生成下一个编号 |
| 状态字典 | `GET/POST/PUT/DELETE /sales/order-statuses` | 状态是**字典数据**，不是代码枚举 |
| 渠道 | `/sales/channels` | 渠道名是数据，UI 显示的是数据值 |

## 3. 状态与迁移的现状

状态字典实测 10 条：草稿、待审批、已发送、已批准、已拒绝、已确认、已挂起、履约中、已履约、已取消。

三个必须记录的事实：

1. **状态名带尾随回车**：接口返回 `"已取消\r"`、`"已发送\r"`，currency 字典同样是 `"AED – 阿联酋迪拉姆\r"`。这是种子数据缺陷，会在筛选、比较和导出里变成看不见的脏值。
2. **只有两个显式迁移接口**：`quotes/send` 与 `quotes/convert`。其余状态变更走 `PUT /sales/quotes`（直接改 `status`），**没有服务端迁移守卫**——任意状态可以跳到任意状态。
3. **没有迁移元数据**：spec 里没有「从哪个状态可以到哪个状态」的定义，UI 也就无法按状态推导按钮。

## 4. 字段缺口（¥ / 日期 / 渠道）

真实记录（`/api/sales/quotes`）：

```
currencyCode: "USD"
grandTotalNetAmount: 680        // 数字，不是字符串
grandTotalGrossAmount: 716
placedAt: null
```

| 需求 | 现状 | 位置 | 代价 |
| --- | --- | --- | --- |
| 金额显示 ¥ | 单据币种是 **USD**，渲染成 `$680.00` | 币种是**数据**；符号由 `packages/ui/src/utils/format.ts` 决定 | 换币种=改数据；换符号=改一个函数 |
| 日期中文 | `11/13/2026` | `formatDate` 的 `locale` 参数被 30 处调用**省略** | 一个文件加默认值即全站生效 |
| 渠道中文 | `Field Sales` / `Online Store` | 渠道名是数据（`/sales/channels`） | 改数据，不是改代码 |

`format.ts` 源码自述：

> Pass `locale` to format in the application locale… Omitting it keeps the runtime default, which varies per machine and is therefore not assertable in tests.

而调用点实测：`formatCurrency(deal.valueAmount, deal.valueCurrency)`、`formatCurrency(row.original.cost, row.original.currencyCode)` 等**大量省略 locale**，于是 `Intl` 回落到运行时默认（en-US），中文部署里照样输出 `$680.00` 与 `11/13/2026`。

页面 `lang` 已是 `zh`（`OM_FORCE_LOCALE=zh`），但格式化没读它。`/api/auth/locale` 返回 409「语言已由配置固定」，说明语言不是用户偏好，而是部署配置。

## 5. 三个结论

1. **框架收敛的第一个真实收益点就是这个函数**：在 mirror 源码里给 `formatCurrency/formatDate` 加一个应用级默认 locale，一处改动覆盖全部 30 个调用点，胜过 27 个 dist 补丁里的任何一组。
2. **¥ 是数据问题，不是样式问题**：要显示人民币，需要把租户单据币种改成 CNY；把 `$` 硬改成 `¥` 而数据仍是 USD，等于在单据上写错币种。
3. **状态驱动按钮需要新增服务端迁移层**：现有 API 允许任意状态直改，UI 若按状态隐藏按钮，只是视觉约束，不是业务约束。

## 6. 下一步（按本文件顺序执行）

- [ ] 在 mirror 源码改 `format.ts` 默认 locale，重建 UI 包并 vendor，实测日期/金额本地化。
- [ ] 把租户默认币种切到 CNY，验证新单据 `currencyCode=CNY` 且渲染 `¥`。
- [ ] 为报价加迁移守卫（合法状态图 + 前置条件），并让 UI 由状态推导按钮。
- [ ] 清洗字典种子数据里的 `\r`。
