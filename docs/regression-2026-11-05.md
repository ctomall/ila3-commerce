# 全站回归记录（2026-11-05）

覆盖目标要求的 **18 业务页 + 26 设置页**，全部在真实浏览器中加载，检查四项：
中文渲染、英文残留词、是否 404、页面标题。

## 业务页（18/18 通过）

| 页面 | 标题 | 中文 | 残留 |
|---|---|---|---|
| `/backend` | ILA3 Commerce | ✅ | 0 |
| `/backend/customers/companies` | 公司 | ✅ | 0 |
| `/backend/customers/deals` | 商机 | ✅ | 0 |
| `/backend/customers/people` | 联系人 | ✅ | 0 |
| `/backend/customer-tasks` | 客户相关任务 | ✅ | 0 |
| `/backend/calendar` | 日历 | ✅ | 0 |
| `/backend/sales/orders` | 订单 | ✅ | 0 |
| `/backend/sales/quotes` | 报价单 | ✅ | 0 |
| `/backend/sales/channels` | 销售渠道 | ✅ | 0 |
| `/backend/catalog/products` | 产品与服务 | ✅ | 0 |
| `/backend/catalog/categories` | 分类 | ✅ | 0 |
| `/backend/catalog/prices` | 价格规则 | ✅ | 0 |
| `/backend/wms` | 运营看板 | ✅ | 0 |
| `/backend/checkout/pay-links` | 支付链接 | ✅ | 0 |
| `/backend/checkout/transactions` | 交易记录 | ✅ | 0 |
| `/backend/messages` | 消息 | ✅ | 0 |
| `/backend/integrations` | 集成 | ✅ | 0 |
| `/backend/documents` | 文档 | ✅ | 0 |

## 设置页（26/26 通过）

全部 `/backend/config/*`，**0 个 404、0 个报错、26/26 中文**。

残留检查仅 1 处命中：`/backend/config/customers` 出现 `in_progress`。

**判定：非缺陷。** 该页是「商机状态」字典编辑表，`值` 列本就展示代码
（`in_progress`），同行 `标签` 列是中文「进行中」。编辑界面必须让用户看到代码。

## 残留词表

`Not set`、`Open actions`、`per page`、`Showing`、`Customize columns`、
`in_progress`、`healthy`、`monitor`、`at_risk`、`Custom Fields`、`No results`

## 结论

44 页中 **44 页中文正常、0 页 404、0 页报错**；唯一命中项为编辑界面刻意展示的代码值。
中文覆盖率**未下降**。
