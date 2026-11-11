# ILA3 Commerce 页面只读复验报告

- 生成时间（UTC）：2026-11-11T01:32:06.241Z
- 目标：http://127.0.0.1:3000（Next.js 生产实例，未重启、未改动）
- 登录：POST /api/auth/login 角色 superadmin（凭据取自 /home/pro/.ila3-admin-credentials，未打印密码），登录 HTTP 200
- 导航接口：GET /api/auth/admin/nav → HTTP 200
- 所有产物仅写入 /tmp/verify96/pages/；每页均保存 innerText 与截图。

## 1. 计数

| 指标 | 值 |
| --- | --- |
| 复验总页数 | 46（业务页 18 + 设置页 28） |
| PASS | 34 |
| FAIL | 12 |
| UNVERIFIED | 0 |
| 截图 | 46/46 |

> 设置页数量核对：任务书基线 26，**本次 nav 实际返回 28 个不重复 /backend/config/ href**，如实记录，未凑数。
>
> 差异未可判定：本次为只读复验，无法确认基线 26 的具体条目，故不做“多出哪两个”的推断。已核对 /backend/config/ai-agents（智能体列表，zhRatio 0.644）与 /backend/config/ai-assistant/agents（AI 智能体配置，zhRatio 0.089）渲染内容不同，不是同一页面重复计数。

## 2. 设置页实际清单（28）

| # | path | 导航分组 | 导航标签 |
| --- | --- | --- | --- |
| 1 | /backend/config/scheduled-jobs | 渠道集成 | 定时任务 |
| 2 | /backend/config/ai-assistant/models | AI管理 | 模型配置 |
| 3 | /backend/config/ai-agents | AI管理 | 智能体列表 |
| 4 | /backend/config/ai-assistant/agents | AI管理 | AI 智能体 |
| 5 | /backend/config/ai-assistant/settings | AI管理 | AI 设置 |
| 6 | /backend/config/ai-assistant/usage | AI管理 | AI 用量 |
| 7 | /backend/config/ai-assistant/playground | AI管理 | AI 调试台 |
| 8 | /backend/config/ai-assistant/legacy | AI管理 | AI 助手（旧版） |
| 9 | /backend/config/ai-assistant/allowlist | AI管理 | AI 白名单 |
| 10 | /backend/config/ai-assistant/moderation-flags | AI管理 | 审核标记 |
| 11 | /backend/config/sales | 业务设置 | 销售 |
| 12 | /backend/config/catalog | 业务设置 | 商品目录 |
| 13 | /backend/config/customers | 业务设置 | 客户 |
| 14 | /backend/config/dictionaries | 业务设置 | 数据字典 |
| 15 | /backend/config/currency-fetching | 业务设置 | 汇率抓取 |
| 16 | /backend/config/wms | 业务设置 | 仓储配置 |
| 17 | /backend/config/workflows | 规则流程 | 工作流命令 |
| 18 | /backend/config/notifications | 通知设备 | 通知投递 |
| 19 | /backend/config/system-status | 系统维护 | 系统状态 |
| 20 | /backend/config/module-telemetry | 系统维护 | 模块遥测 |
| 21 | /backend/config/cache | 系统维护 | 缓存 |
| 22 | /backend/config/modules | 系统维护 | 模块应用 |
| 23 | /backend/config/translations | 系统维护 | 翻译管理 |
| 24 | /backend/config/attachments | 系统维护 | 存储 |
| 25 | /backend/config/system-update | 系统维护 | 系统升级 |
| 26 | /backend/config/search | 系统维护 | 搜索设置 |
| 27 | /backend/config/settings | 高级 | 自定义实体 |
| 28 | /backend/config/encryption | 高级 | 加密 |

## 3. 失败清单（12）

| # | path | 命中文本 / 元素 | 截图 |
| --- | --- | --- | --- |
| 1 | /backend/checkout/pay-links | `Create Link`（a.inline-flex (primary CTA)）；`Pay Links`（h1 page heading） | shots/backend_checkout_pay-links.png |
| 2 | /backend/checkout/transactions | `Transactions`（h1 page heading） | shots/backend_checkout_transactions.png |
| 3 | /backend/integrations | `Configure`（a (button-styled, per provider card)）；`0 log events (30d)`（p (card meta)）；`Error rate: 0%`（p (card meta)）；`Data Sync`（button (category filter)） | shots/backend_integrations.png |
| 4 | /backend/documents | `Favorites`（button）；`Templates`（a (button-styled link)） | shots/backend_documents.png |
| 5 | /backend/config/currency-fetching | `Fetch Now`（button）；`Daily Sync Time:`（field label）；`Last Sync:`（field label）；`Rates Fetched: 0`（p (status text)）；`success`（status badge） | shots/backend_config_currency-fetching.png |
| 6 | /backend/config/notifications | `Security`（th (category header)）；`Checkout`（th）；`Communication`（th）；`Warranty claims`（th）；`Webhooks`（th）；`Workflows`（th） | shots/backend_config_notifications.png |
| 7 | /backend/config/system-status | `System status`（h2）；`Runtime mode: Production`（p (status line)）；`Snapshot generated 2026/11/11 01:31:43`（p (status line)） | shots/backend_config_system-status.png |
| 8 | /backend/config/module-telemetry | `Module telemetry`（h2）；`Report generated 2026/11/11 01:31:45`（p）；`Collecting since 2026/11/11 00:50:00`（p）；`From 11月11日 00:50 to now · 9 buckets (5m interval)`（p） | shots/backend_config_module-telemetry.png |
| 9 | /backend/config/translations | `Save translations`（button）；`Translations`（h2）；`Which languages content can be translated into. A language t`（p (intro copy)） | shots/backend_config_translations.png |
| 10 | /backend/config/attachments | `Attachment partitions`（h2）；`Add partition`（button）；`Define storage partitions and visibility for uploads.`（p (intro copy)）；`Storage`（th）；`Env variable`（th） | shots/backend_config_attachments.png |
| 11 | /backend/config/search | `Search Settings`（h1 page heading）；`Driver: No fulltext driver configured.`（p (status text)） | shots/backend_config_search.png |
| 12 | /backend/config/encryption | `Save encryption map`（button）；`Add field`（button） | shots/backend_config_encryption.png |

判定说明：
- **/backend/checkout/pay-links** — 页面标题 h1 与主 CTA 为英文；其余表头/导航为中文。命中词表词 "Create"（元素 <a>Create Link</a>）。
- **/backend/checkout/transactions** — 页面 h1 为英文 "Transactions"，而左侧导航同一页面显示"交易记录"，属未翻译标题。
- **/backend/integrations** — 整页基本未本地化（zhRatio 0.088）：卡片描述、Configure 按钮、日志/错误率元信息、分类标签均为英文；仅"未配置"为中文。rawKey "gmail.users.messages.send" 系英文说明句中的 Google API 方法名，不计为裸键。
- **/backend/documents** — 中文页面中混入英文控件 "Favorites" 与 "Templates"（同区块其余为"从模板新建/创建文档/刷新"）。
- **/backend/config/currency-fetching** — 中文配置页中同步控件/状态为英文（"Daily Sync Time:"、"Last Sync:"、"Fetch Now"、"success"、"Rates Fetched: 0"）。
- **/backend/config/notifications** — 通知矩阵的分类表头为英文（同表列头"通知类型/应用内/邮件/推送"为中文）；另有一段英文说明 "Delivery channels per notification type..."。疑似模块提供的分类名，需产品确认是否应本地化。
- **/backend/config/system-status** — 页面 h1 为中文"系统状态"，紧随的 h2 与状态行仍为英文。
- **/backend/config/module-telemetry** — h1 中文"模块遥测"，但其下 h2 与时间/统计行为英文；事件名（application.request.received 等）与模块 id 属刻意展示的数据标识，不计为残留。
- **/backend/config/translations** — 中文页面（翻译管理）中 h2、说明段与保存按钮为英文。命中词表词 "Save"（元素 <button>Save translations</button>）。值列展示的语言名/值为刻意展示，不计。
- **/backend/config/attachments** — 中文页面中 h2 "Attachment partitions"、英文说明、按钮 "Add partition" 及表头 "Storage/Env variable" 未翻译。命中词表词 "Add"。
- **/backend/config/search** — 导航显示"搜索设置"，页面 h1 为英文 "Search Settings"；另有英文状态句。命中词表词 "Search"。
- **/backend/config/encryption** — 中文配置页（加密）中两个操作按钮为英文；实体字段名 dashboards:dashboard_layout 属刻意展示的标识，不计。命中词表词 "Save"、"Add"。

## 4. 全量明细

| path | 类型 | HTTP | 中文占比 | 判定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| /backend | 业务 | 200 | 0.6215 | PASS | HTTP200 979ch h1="工作台" zhRatio=0.6215 |
| /backend/customers/companies | 业务 | 200 | 0.6845 | PASS | HTTP200 476ch h1="公司" zhRatio=0.6845 |
| /backend/customers/deals | 业务 | 200 | 0.5958 | PASS | HTTP200 1078ch h1="商机" zhRatio=0.5958 |
| /backend/customers/people | 业务 | 200 | 0.5039 | PASS | HTTP200 985ch h1="联系人" zhRatio=0.5039 |
| /backend/customer-tasks | 业务 | 200 | 0.789 | PASS | HTTP200 303ch h1="客户相关任务" zhRatio=0.789 |
| /backend/calendar | 业务 | 200 | 0.7979 | PASS | HTTP200 594ch h1="2026年11月11日" zhRatio=0.7979 |
| /backend/sales/orders | 业务 | 200 | 0.4758 | PASS | HTTP200 992ch h1="销售订单
查看单据详情，含客户信息、金额合计与渠道。" zhRatio=0.4758 |
| /backend/sales/quotes | 业务 | 200 | 0.809 | PASS | HTTP200 454ch h1="销售报价单
查看单据详情，含客户信息、金额合计与渠道。" zhRatio=0.809 |
| /backend/sales/channels | 业务 | 200 | 0.4276 | PASS | HTTP200 648ch h1="销售渠道
按市场或店铺管理商品报价。" zhRatio=0.4276 |
| /backend/catalog/products | 业务 | 200 | 0.2238 | PASS | 表头 SKU/EUDR 为行业缩写，属领域术语，不计英文残留。 |
| /backend/catalog/categories | 业务 | 200 | 0.4205 | PASS | HTTP200 762ch h1="分类" zhRatio=0.4205 |
| /backend/catalog/prices | 业务 | 200 | 0.3449 | PASS | HTTP200 1459ch h1="价格规则" zhRatio=0.3449 |
| /backend/wms | 业务 | 200 | 0.8726 | PASS | HTTP200 781ch h1="运营看板" zhRatio=0.8726 |
| /backend/checkout/pay-links | 业务 | 200 | 0.512 | FAIL | 页面标题 h1 与主 CTA 为英文；其余表头/导航为中文。命中词表词 "Create"（元素 <a>Create Link</a>）。 |
| /backend/checkout/transactions | 业务 | 200 | 0.7542 | FAIL | 页面 h1 为英文 "Transactions"，而左侧导航同一页面显示"交易记录"，属未翻译标题。 |
| /backend/messages | 业务 | 200 | 0.784 | PASS | HTTP200 296ch h1="" zhRatio=0.784 |
| /backend/integrations | 业务 | 200 | 0.0878 | FAIL | 整页基本未本地化（zhRatio 0.088）：卡片描述、Configure 按钮、日志/错误率元信息、分类标签均为英文；仅"未配置"为中文。rawKey "gmail.users.messages.send" 系英文说明句中的 Google API 方法名，不计为裸键。 |
| /backend/documents | 业务 | 200 | 0.7311 | FAIL | 中文页面中混入英文控件 "Favorites" 与 "Templates"（同区块其余为"从模板新建/创建文档/刷新"）。 |
| /backend/config/scheduled-jobs | 设置 | 200 | 0.1628 | PASS | zhRatio 低（0.163）源于任务名/cron/目标等英文数据；界面文案（定时任务/刷新/新建定时任务/表头）为中文。 |
| /backend/config/ai-assistant/models | 设置 | 200 | 0.8364 | PASS | HTTP200 831ch h1="模型配置" zhRatio=0.8364 |
| /backend/config/ai-agents | 设置 | 200 | 0.6438 | PASS | HTTP200 1327ch h1="智能体列表" zhRatio=0.6438 |
| /backend/config/ai-assistant/agents | 设置 | 200 | 0.0887 | PASS | 残留命中（Save/Search/Add）均在 <pre> 系统提示词预览块内，属内容展示；允许的工具名（Hybrid search + search.hybrid_search）属工具注册数据，不计。 |
| /backend/config/ai-assistant/settings | 设置 | 200 | 0.5918 | PASS | HTTP200 727ch h1="AI 助手设置" zhRatio=0.5918 |
| /backend/config/ai-assistant/usage | 设置 | 200 | 0.4667 | PASS | HTTP200 669ch h1="" zhRatio=0.4667 |
| /backend/config/ai-assistant/playground | 设置 | 200 | 0.2654 | PASS | zhRatio 低（0.265）源于提示词/模型输出等英文内容，界面文案为中文。 |
| /backend/config/ai-assistant/legacy | 设置 | 200 | 0.6 | PASS | HTTP200 755ch h1="AI 助手设置" zhRatio=0.6 |
| /backend/config/ai-assistant/allowlist | 设置 | 200 | 0.5162 | PASS | 标签为模型/供应商名（Anthropic、claude-*、gpt-*、Ollama (local) 等），属刻意展示的数据。 |
| /backend/config/ai-assistant/moderation-flags | 设置 | 200 | 0.7937 | PASS | HTTP200 313ch h1="" zhRatio=0.7937 |
| /backend/config/sales | 设置 | 200 | 0.5153 | PASS | HTTP200 3113ch h1="" zhRatio=0.5153 |
| /backend/config/catalog | 设置 | 200 | 0.7778 | PASS | HTTP200 475ch h1="" zhRatio=0.7778 |
| /backend/config/customers | 设置 | 200 | 0.6389 | PASS | 值列展示管道阶段键（in_progress/open/lost/closed）与中文标签（进行中/未关闭/输单/已关闭）并列，属"值列刻意展示"，不计残留。 |
| /backend/config/dictionaries | 设置 | 200 | 0.4395 | PASS | HTTP200 678ch h1="" zhRatio=0.4395 |
| /backend/config/currency-fetching | 设置 | 200 | 0.5642 | FAIL | 中文配置页中同步控件/状态为英文（"Daily Sync Time:"、"Last Sync:"、"Fetch Now"、"success"、"Rates Fetched: 0"）。 |
| /backend/config/wms | 设置 | 200 | 0.8981 | PASS | HTTP200 750ch h1="WMS 配置" zhRatio=0.8981 |
| /backend/config/workflows | 设置 | 200 | 0.2471 | PASS | 命令 ID（catalog.products.update 等，10 个）与中文描述"更新产品"及 "Requires:" 并列，属刻意展示的权限/命令标识；英文说明段与 "Requires:" 标签未判失败（非控件/标题），列为口径外风险。 |
| /backend/config/notifications | 设置 | 200 | 0.6258 | FAIL | 通知矩阵的分类表头为英文（同表列头"通知类型/应用内/邮件/推送"为中文）；另有一段英文说明 "Delivery channels per notification type..."。疑似模块提供的分类名，需产品确认是否应本地化。 |
| /backend/config/system-status | 设置 | 200 | 0.279 | FAIL | 页面 h1 为中文"系统状态"，紧随的 h2 与状态行仍为英文。 |
| /backend/config/module-telemetry | 设置 | 200 | 0.0927 | FAIL | h1 中文"模块遥测"，但其下 h2 与时间/统计行为英文；事件名（application.request.received 等）与模块 id 属刻意展示的数据标识，不计为残留。 |
| /backend/config/cache | 设置 | 200 | 0.5433 | PASS | HTTP200 405ch h1="" zhRatio=0.5433 |
| /backend/config/modules | 设置 | 200 | 0.3838 | PASS | 模块 id "search"（等宽字体，旁为中文"搜索"）属标识展示；"Loading" 命中位于英文模块描述长句中，属内容文本，不计 UI 残留。 |
| /backend/config/translations | 设置 | 200 | 0.3533 | FAIL | 中文页面（翻译管理）中 h2、说明段与保存按钮为英文。命中词表词 "Save"（元素 <button>Save translations</button>）。值列展示的语言名/值为刻意展示，不计。 |
| /backend/config/attachments | 设置 | 200 | 0.2642 | FAIL | 中文页面中 h2 "Attachment partitions"、英文说明、按钮 "Add partition" 及表头 "Storage/Env variable" 未翻译。命中词表词 "Add"。 |
| /backend/config/system-update | 设置 | 200 | 0.6488 | PASS | HTTP200 1730ch h1="" zhRatio=0.6488 |
| /backend/config/search | 设置 | 200 | 0.236 | FAIL | 导航显示"搜索设置"，页面 h1 为英文 "Search Settings"；另有英文状态句。命中词表词 "Search"。 |
| /backend/config/settings | 设置 | 200 | 0.5259 | PASS | HTTP200 353ch h1="" zhRatio=0.5259 |
| /backend/config/encryption | 设置 | 200 | 0.6789 | FAIL | 中文配置页（加密）中两个操作按钮为英文；实体字段名 dashboards:dashboard_layout 属刻意展示的标识，不计。命中词表词 "Save"、"Add"。 |

## 5. 中文占比偏低页面（zhRatio < 0.35，供人工复核）

| path | zhRatio | 判定 | 说明 |
| --- | --- | --- | --- |
| /backend/integrations | 0.0878 | FAIL | 整页基本未本地化（zhRatio 0.088）：卡片描述、Configure 按钮、日志/错误率元信息、分类标签均为英文；仅"未配置"为中文。rawKey "gmail.users.messages.send" 系英文说明句中的 Googl |
| /backend/config/ai-assistant/agents | 0.0887 | PASS | 残留命中（Save/Search/Add）均在 <pre> 系统提示词预览块内，属内容展示；允许的工具名（Hybrid search + search.hybrid_search）属工具注册数据，不计。 |
| /backend/config/module-telemetry | 0.0927 | FAIL | h1 中文"模块遥测"，但其下 h2 与时间/统计行为英文；事件名（application.request.received 等）与模块 id 属刻意展示的数据标识，不计为残留。 |
| /backend/config/scheduled-jobs | 0.1628 | PASS | zhRatio 低（0.163）源于任务名/cron/目标等英文数据；界面文案（定时任务/刷新/新建定时任务/表头）为中文。 |
| /backend/catalog/products | 0.2238 | PASS | 表头 SKU/EUDR 为行业缩写，属领域术语，不计英文残留。 |
| /backend/config/search | 0.236 | FAIL | 导航显示"搜索设置"，页面 h1 为英文 "Search Settings"；另有英文状态句。命中词表词 "Search"。 |
| /backend/config/workflows | 0.2471 | PASS | 命令 ID（catalog.products.update 等，10 个）与中文描述"更新产品"及 "Requires:" 并列，属刻意展示的权限/命令标识；英文说明段与 "Requires:" 标签未判失败（非控件/标题），列为口径外风险 |
| /backend/config/attachments | 0.2642 | FAIL | 中文页面中 h2 "Attachment partitions"、英文说明、按钮 "Add partition" 及表头 "Storage/Env variable" 未翻译。命中词表词 "Add"。 |
| /backend/config/ai-assistant/playground | 0.2654 | PASS | zhRatio 低（0.265）源于提示词/模型输出等英文内容，界面文案为中文。 |
| /backend/config/system-status | 0.279 | FAIL | 页面 h1 为中文"系统状态"，紧随的 h2 与状态行仍为英文。 |
| /backend/catalog/prices | 0.3449 | PASS | HTTP200 1459ch h1="价格规则" zhRatio=0.3449 |

> 低中文占比不等于未本地化：任务名、提示词、模型名、事件名、命令 ID 等数据会拉低比值（如 scheduled-jobs、ai-assistant/agents、ai-assistant/playground）；这些页面已逐一核对控件文案为中文。integrations 等则确属整页未本地化。

## 6. 判定为「刻意展示/内容」而未计入残留的项（防误判说明）

- **版本号**：全局页脚 `ILA3 Commerce · v0.9.0 (56d319d)`，46 页均出现，按版本号排除（首轮曾被误判为裸键，已修正）。
- **值列**：/backend/config/customers 的 `in_progress/open/lost/closed` 与中文标签“进行中/未关闭/输单/已关闭”并列展示（值/标签两列），属刻意展示；与“字典编辑页值列”同类。
- **权限/命令 ID**：/backend/config/workflows 的 `catalog.products.update` 等 10 个，均带中文描述与 `Requires:` 权限说明。
- **事件/模块/路由 ID**：/backend/config/module-telemetry 的 `application.request.received`、`query_index.coverage.refresh` 等，及模块列 `search`、`GET /search/settings/vector-store`。
- **提示词预览**：/backend/config/ai-assistant/agents 的 `<pre>` 系统提示词块（英文，含 Save/Search/Add 命中），属内容展示。
- **模型/供应商名**：/backend/config/ai-assistant/allowlist 的 `claude-*`、`gpt-*`、`Ollama (local)` 等。
- **领域缩写**：/backend/catalog/products 表头 `SKU`、`EUDR`。
- **Google API 方法名**：/backend/integrations 的 `gmail.users.messages.send` 出现在英文说明句中，非未翻译键（该页仍因英文控件判 FAIL）。

## 7. 方法与口径

- **中文占比 zhRatio** = 中日韩汉字数 /（汉字数 + 拉丁字母数），基于 `body.innerText`；纯数字/符号不计入分母。
- **裸键** = 形如 `a.b.c`、≥3 段的标识符串（如 `crmNav.manage.category.users`）；已排除版本号、文件名/扩展名、域名、URL、邮箱、IP、`e.g.` 等缩写。
- **英文残留** = 词表 20 词 + 精确 DOM 元素证据；按元素语义分类：`<pre>/<code>` 内容、标识符、值列、品牌/模型名不算残留；标题/按钮/标签/表头/状态文案算残留。
- **内容加载**：等待 `加载中` 消失（≤30s）+ networkidle（≤15s）+ 400ms 稳定；导航超时 40s，超时记 UNVERIFIED（本次 0 例）。
- **只读**：全程仅 GET 页面与 nav 接口、POST 登录；未点击任何写操作，未部署/重启/改库/改仓库。

## 8. 未验证项

- 无。46 页全部取得 HTTP 200 与真实内容，无 40s 超时。
- 说明：交互行为（点击、保存、分页）不在本次只读复验范围。

## 9. 证据文件

| 文件 | 内容 |
| --- | --- |
| report.json | 46 页逐项结果（path/status/finalUrl/title/zhRatio/rawKeys/residue/verdict/note/screenshot） |
| summary.md | 本报告 |
| shots/*.png | 46 张页面截图 |
| text/*.txt | 46 份 body.innerText 原始文本 |
| evidence.json | 裸键/残留的 DOM 证据（含被排除项） |
| english-chrome.json | 词表外英文 UI 控件扫描原始结果 |
| settings-sections.json | nav 接口设置页清单（28） |
| meta.json / counts.json / login.json | 运行元信息 |
