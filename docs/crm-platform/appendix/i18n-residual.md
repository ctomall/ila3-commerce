# 中文界面英语残留扫描

生成时间：2026-11-08T19:13:32.863Z · 页面 8 · 有残留 8

扫描方式：真实浏览器登录后逐页取 `main` 文本，按非字母切词，过滤掉合法拉丁缩写（AI/API/EUDR/USD…）。
命中不等于错误——专有名词也会命中；这里只是把可能需要翻译的地方列出来。

## 工作台 · `/backend`

| 词 | 次数 |
|---|---|
| Cookie | 2 |
| Expansion | 2 |
| Copperleaf | 1 |
| Design | 1 |
| Naomi | 1 |
| Harris | 1 |
| Taylor | 1 |
| Brooks | 1 |
| Lena | 1 |
| Ortiz | 1 |
| Arjun | 1 |
| Patel | 1 |

## 公司 · `/backend/customers/companies`

| 词 | 次数 |
|---|---|
| Cookie | 2 |
| Brightside | 1 |
| Solar | 1 |
| Harborview | 1 |
| Analytics | 1 |
| Copperleaf | 1 |
| Design | 1 |

## 联系人 · `/backend/customers/people`

| 词 | 次数 |
|---|---|
| com | 4 |
| she | 3 |
| her | 3 |
| Cookie | 2 |
| copperleaf | 2 |
| design | 2 |
| brightsidesolar | 2 |
| him | 2 |
| harborviewanalytics | 2 |
| Naomi | 1 |
| Harris | 1 |
| naomi | 1 |

## 商机 · `/backend/customers/deals`

| 词 | 次数 |
|---|---|
| Cookie | 2 |
| Expansion | 2 |
| SQL | 1 |
| Sunset | 1 |
| Lofts | 1 |
| Battery | 1 |
| Upgrade | 1 |
| Midwest | 1 |
| Outfitters | 1 |
| Blue | 1 |
| Harbor | 1 |
| Grocers | 1 |

## 报价单 · `/backend/sales/quotes`

| 词 | 次数 |
|---|---|
| Cookie | 2 |
| QUOTE | 1 |
| DEMO | 1 |
| Brightside | 1 |
| Solar | 1 |
| hello | 1 |
| brightsidesolar | 1 |
| com | 1 |
| Online | 1 |
| Store | 1 |

## 订单 · `/backend/sales/orders`

| 词 | 次数 |
|---|---|
| DEMO | 4 |
| Cookie | 2 |
| Field | 2 |
| Sales | 2 |
| Online | 2 |
| Store | 2 |
| Copperleaf | 1 |
| Design | 1 |
| studio | 1 |
| copperleaf | 1 |
| design | 1 |
| Harborview | 1 |

## 团队请假 · `/backend/staff/leave-requests`

| 词 | 次数 |
|---|---|
| Cookie | 2 |

## 我的请假 · `/backend/staff/my-leave-requests`

| 词 | 次数 |
|---|---|
| Cookie | 2 |


---

## 结论（人工判读）

| 页面 | 命中性质 | 处置 |
|---|---|---|
| 团队请假 / 我的请假 | 只剩 `Cookie`（浏览器提示条） | 无需处理 |
| 公司 / 联系人 / 商机 / 报价单 / 订单 | 公司名、人名、单据号（`SQ-DEMO-1001`）、渠道值（`Online Store`、`Field Sales`） | **数据**，不是界面文案；渠道值英文化是已知问题，另立决策 |
| 工作台 | `Expansion` 等来自商机标题 | 数据 |

界面结构里**没有剩余英文**：团队请假的搜索框、列头都已是中文（`搜索…`、`日期`）。

## 修复记录

之前三处英文来自「源码已用 `t(key, fallback)`，但 `src/i18n/zh.json` 缺键」：

| 键 | 值 |
|---|---|
| `staff.leaveRequests.table.dates` | 日期 |
| `staff.leaveRequests.table.search` | 搜索团队请假… |
| `staff.leaveRequests.detail.dates` | 日期 |

教训：**这类残留不需要改代码，也不需要加补丁**，补字典键即可。先查源码是否已 `t(key, fallback)`，再决定要不要动框架。
