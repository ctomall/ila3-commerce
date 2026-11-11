# ILA3 Commerce 只读复验报告

- 实例：http://127.0.0.1:3000（v0.9.0 (56d319d)）
- 生成时间：2026-11-11T01:44:10.443Z
- 账号：superadmin（来自 /home/pro/.ila3-admin-credentials，密码未打印）
- 纪律：只读复验；未部署、未重启、未改数据库/生产数据、未改 /home/pro/apps/mercato；产物仅写 /tmp/verify96/flows/
- 工具：Node v24.22.2 + Playwright 1.64.1（mercato/node_modules，chromium headless）

## 结论总览

| 页面 | 载 | 空 | 错 | 暗色 | 暗色最小比值 |
| --- | --- | --- | --- | --- | ---: |
| 工作台 /backend | PASS | N/A | PASS | PASS | 7.66 |
| 公司列表 /backend/customers/companies | PASS | PASS | PASS | PASS | 7.66 |
| 商机列表 /backend/customers/deals | PASS | PASS | PASS | PASS | 7.66 |
| 配置 /backend/config | FAIL | N/A | N/A | —（404） | — |
| 系统升级 /backend/config/system-update（导航实测路径） | PASS | N/A | FAIL | PASS | 7.66 |
| 登录 /login | PASS | N/A | PASS | PASS | 6.94 |

> 说明：实测 /backend/config 与 /backend/system/updates 均为 404；导航 API 中「系统升级」链接为 /backend/config/system-update（实测 200），本报告按该实际路径复验。暗色 config 使用 /backend/config/dictionaries 替代测量。

## A. 三态（载/空/错）

### A1. 逐页证据

| 页面 | 载（首屏→内容） | 空（zzzz-no-such-record-96） | 错（拦截该页 API） |
| --- | --- | --- | --- |
| 工作台 /backend | PASS：DCL 有加载指示（「加载中」）→ 稳定后真实内容（工作台） | N/A：组件化仪表盘，无列表级空态概念（组件内「暂无…」不算列表空态） | PASS：错误文案（无法加载… / 加载订单失败）；无 role=alert；无重试入口 |
| 公司列表 /backend/customers/companies | PASS：DCL 有加载指示（「加载中」）→ 稳定后真实内容（公司，表格 3 行） | PASS：「未找到与“zzzz-no-such-record-96”匹配的公司，请调整搜索或筛选条件」；清除搜索=true；插图=true | PASS：role=alert「无法连接服务器，请检查网络后重试」；解除拦截重载恢复 |
| 商机列表 /backend/customers/deals | PASS：DCL 有加载指示（「加载中」）→ 稳定后真实内容（商机，表格 6 行） | PASS：「未找到与“zzzz-no-such-record-96”匹配的商机，请调整搜索或筛选条件」；清除搜索=true；插图=true | PASS：role=alert「Failed to fetch」；解除拦截重载恢复 |
| 配置 /backend/config | FAIL：页面 404，无内容 | N/A：页面 404，无页面可测 | N/A：页面本身 404 |
| 系统升级 /backend/config/system-update（导航实测路径） | PASS：DCL 有加载指示（aria-busy=1/骨架=3）→ 稳定后真实内容（h2 系统升级，表格 5 行） | N/A：非列表页面 | FAIL：拦截后 11s 仍停在骨架（aria-busy=1/骨架=3/0 行），无 role=alert、无「加载失败」、无重试 |
| 登录 /login | PASS：DCL 即 SSR 真实内容（无骨架/无白屏） | N/A：登录页无列表/空态概念 | PASS：role=alert「Failed to fetch」；解除拦截重载恢复 |

### A2. 关键原始数值

| 页面 | HTTP | DCL 时加载标记 | DCL 时 h1 | 稳定后 h1 | 稳定后表格行 | 首屏 FCP(ms) | 拦截后恢复 |
| --- | ---: | --- | --- | --- | ---: | ---: | --- |
| backend | 200 | 「加载中」 | — | 工作台 | 0 | 436 | 是（组件数据恢复） |
| companies | 200 | 「加载中」 | 公司 | 公司 | 3 | 540 | 是（3 行恢复） |
| deals | 200 | 「加载中」 | 商机 | 商机 | 6 | 484 | 是（6 行恢复） |
| config | 404 | aria-busy=0/骨架=0 | — | 404 | 0 | — | N/A |
| updates | 200 | aria-busy=1/骨架=3 | — | h2 系统升级 | 5 | 256 | 是（5 行恢复） |
| login | 200 | aria-busy=0/骨架=0 | Open Mercato | Open Mercato | 0 | 176 | 是（无 alert） |

补充：
- 工作台错误态：6 个组件显示「无法加载客户任务/新增客户/新增商机/即将到来的互动」「加载订单失败」「加载报价单失败」；无 role=alert、无重试。恢复后组件数据回来。
- 公司列表错误态：role=alert「无法连接服务器，请检查网络后重试」（出现 2 处），非空态伪装；恢复后 3 行数据。
- 商机列表错误态：role=alert「Failed to fetch」+「无法加载商机指标 / 重试」；同时列表区显示「暂无商机」空态（错误/空态并存，见问题清单）。恢复后 6 行。
- 系统升级：阻断状态接口后 2s/6s/11s 均停在骨架（aria-busy=1、骨架=3、0 行），无错误提示/重试 → FAIL。
- 登录页：阻断 POST /api/auth/login 后 role=alert「Failed to fetch」，表单仍在，解除后重载无 alert；阻断 /api/auth/feature-check 页面无提示（静默）。

## B. 暗色对比度（prefers-color-scheme: dark）

测量方法：Chromium emulated dark；用 canvas 把 computed color 画成 1px 像素读取 RGB（oklch/lab 不能直接解析），沿祖先链合成有效背景；普通文本阈值 4.5，大字（≥24px 或 ≥18.66px 粗体）阈值 3.0。

| 页面 | 结论 | 最小比值 | 最小样本 | 测得必填样本 | 缺失样本 |
| --- | --- | ---: | --- | ---: | --- |
| backend | PASS | 7.66 | body | 5/6 | table header |
| companies | PASS | 7.66 | table header | 6/6 | 无 |
| deals | PASS | 7.66 | table header | 6/6 | 无 |
| config | UNVERIFIED_PAGE_MISSING | 7.75 | muted text | 2/6 | body、table header、sidebar group、primary button |
| updates | PASS | 7.66 | body | 6/6 | 无 |
| login | PASS | 6.94 | muted text | 4/6 | table header、sidebar group |
| config（替代页） | PASS | 7.07 | table header | 6/6 | 无 |

### 每页每样本比值

| 页面 | 样本 | 比值 | 阈值 | 结果 |
| --- | --- | ---: | ---: | --- |
| 工作台 /backend | body | 7.66 | 4.5 | PASS |
| 工作台 /backend | table header | N/A | — | N/A（元素不存在） |
| 工作台 /backend | page title | 18.97 | 3 | PASS |
| 工作台 /backend | muted text | 7.66 | 4.5 | PASS |
| 工作台 /backend | sidebar group | 7.66 | 4.5 | PASS |
| 工作台 /backend | primary button | 17.5 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | body | 18.97 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | table header | 7.66 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | page title | 17.18 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | muted text | 7.66 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | sidebar group | 7.66 | 4.5 | PASS |
| 公司列表 /backend/customers/companies | primary button | 14.23 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | body | 18.97 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | table header | 7.66 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | page title | 17.18 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | muted text | 7.66 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | sidebar group | 7.66 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | primary button | 14.23 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | badge:未关闭 | 7.98 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | badge:未关闭 | 7.98 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | badge:赢单 | 10.67 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | badge:输单 | 8.42 | 4.5 | PASS |
| 商机列表 /backend/customers/deals | badge:进行中 | 10.37 | 4.5 | PASS |
| 配置 /backend/config | body | N/A | — | N/A（元素不存在） |
| 配置 /backend/config | table header | N/A | — | N/A（元素不存在） |
| 配置 /backend/config | page title | 21 | 3 | PASS |
| 配置 /backend/config | muted text | 7.75 | 4.5 | PASS |
| 配置 /backend/config | sidebar group | N/A | — | N/A（元素不存在） |
| 配置 /backend/config | primary button | N/A | — | N/A（元素不存在） |
| 系统升级 /backend/config/system-update（导航实测路径） | body | 7.66 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | table header | 7.66 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | page title | 18.97 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | muted text | 7.66 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | sidebar group | 7.66 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | primary button | 17.5 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | badge:发布进行中 | 10.37 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | badge:检查未完成 | 12.21 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | badge:包版本一致 | 10.67 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | badge:暂不支持检测 | 12.21 | 4.5 | PASS |
| 系统升级 /backend/config/system-update（导航实测路径） | badge:未知 | 18.97 | 4.5 | PASS |
| 登录 /login | body | 17.18 | 4.5 | PASS |
| 登录 /login | table header | N/A | — | N/A（元素不存在） |
| 登录 /login | page title | 17.18 | 3 | PASS |
| 登录 /login | muted text | 6.94 | 4.5 | PASS |
| 登录 /login | sidebar group | N/A | — | N/A（元素不存在） |
| 登录 /login | primary button | 14.23 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | body | 18.97 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | table header | 7.07 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | page title | 17.18 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | muted text | 7.66 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | sidebar group | 7.66 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | primary button | 14.23 | 4.5 | PASS |
| 配置替代页 /backend/config/dictionaries | 最小比值 | 7.07 | — | PASS |

说明：
- 工作台无表格 → table header N/A；登录页无表格/侧栏 → table header、sidebar group N/A；config 404 → 多数字段 N/A。
- 附加检查了页面上的文字 badge（10–12px 粗体）；deals/updates 的全部 badge 比值 ≥7.98，无额外失败。
- 暗色已确认生效：html class=dark，body 背景 rgb(10,10,10)。

## C. 字典缓存

| 项目 | 结论 | 实测 |
| --- | --- | --- |
| i18n 专用字典接口 | N/A | 不存在 /api/i18n/* 专用字典接口（5 条探针均 404）；i18n 字典内联在服务端 RSC/HTML 中 |
| 字典 API /api/dictionaries | PASS | GET /api/dictionaries -> 200, 8046 bytes |
| 字典 API 缓存头 | FAIL | cache-control=缺失; etag=缺失; content-encoding=缺失; transfer-encoding=chunked |
| /login HTML 字典载体 | PASS | 1427 keys, 114274 decoded bytes, cache-control=private, no-cache, no-store, max-age=0, must-revalidate |
| 公网 cf-cache-status | PASS | cf-cache-status=DYNAMIC |

- 说明：该部署没有独立 i18n 字典接口（/api/i18n/zh、/api/i18n/en、/api/i18n、/api/translations、/api/locales 均 404）。i18n 字典由服务端内联进 HTML/RSC：/login 1,427 键、/backend 23,107 键。
- 可访问的字典 API 是业务字典模块：/api/dictionaries（200，8,046B）与 /api/customers/dictionaries/currency（200，15,442B）；两者均无 cache-control/etag/content-encoding。
- 公网 https://mercato.ila3.top/login：200；cf-cache-status=DYNAMIC；cache-control=private, no-cache, no-store, max-age=0, must-revalidate；content-encoding 未设置（curl 未请求压缩）；实测 TTFB 1.59s / 总 4.50s（另一次 30s 超时，链路抖动）。

## D. 性能

口径：loopback=本机 127.0.0.1:3000，keep-alive 单连接，Node http.request 到响应头为 TTFB；每个路径 20 次请求，每次均带 gzip。公网与 loopback 分开记录，不混用。

| 路径（口径） | TTFB p50(ms) | TTFB p95(ms) | min | max | HTML 解码字节 | gzip 字节 | content-encoding | 状态 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| /login（loopback） | 27.9 | 39.7 | 26.8 | 50 | 114274 | 27180 | gzip | 200 |
| /backend/customers/companies（loopback） | 260.5 | 374.9 | 177.5 | 531.5 | 1731215 | 344415 | gzip | 200 |

- /login HTML 内联字典键：**1427**（唯一 1427；正则 `\\"([a-zA-Z][\w-]*(?:\.[\w-]+)+)\\":`）。
- 公网 /login：UNVERIFIED（2/6 个完整样本；成功样本 TTFB 3.37s、2.38s；其余超时）。公网与 loopback 分开，不混用。
- 公网与 loopback 数值口径不同（公网含 TCP/TLS 握手且当前链路严重抖动），不可相互替代。

## 问题清单

| 级别 | 问题 | 证据/影响 |
| --- | --- | --- |
| P1 | /backend/config 返回 404 | 任务指定的六页之一不存在；导航中也没有 /backend/config 索引页（只有 /backend/config/* 子页）。载 FAIL，空/错 N/A。 |
| P1 | 系统升级页无错误态 | 拦截 /api/system_update/status 后，2s/6s/11s 均停留在骨架（aria-busy=1、3 个骨架、0 行），无 role=alert、无「加载失败」、无重试入口。 |
| P1 | 字典 API 无缓存头 | /api/dictionaries 200/8046B，但 cache-control、etag、content-encoding 均缺失；若验收要求字典缓存，则不达标（私有管理数据不缓存也可解释，需产品口径确认）。 |
| P2 | /backend/system/updates 路径 404 | 按导航「系统升级」实际为 /backend/config/system-update，已按该路径复验并记录。 |
| P2 | 错误文案未本地化 | deals/登录页错误态出现英文「Failed to fetch」。 |
| P2 | deals 错误态与空态混淆 | 列表 API 失败时同时出现 role=alert「Failed to fetch」和列表内「暂无商机」空态文案。 |
| P2 | 工作台错误态弱提示 | 阻断 dashboard widget API 后仅各组件文本「无法加载…/加载订单失败」，无 role=alert、无重试按钮。 |
| P2 | 系统升级页标题层级异常 | 页面标题使用 h2（其它页为 h1），一致性观察项。 |
| P2 | 登录页 feature-check 静默失败 | 阻断 /api/auth/feature-check 后无任何错误提示（页面仍可登录）；静默降级，非阻断。 |
| P2 | 首屏 HTML 体积大 | /backend HTML 1,731,215B（gzip 344,415B），内联字典键 23,107；/login 114,274B（gzip 27,180B），内联 1,427 键。 |
| P3 | 公网链路抖动 / 边缘未缓存 | 同一 /login 出现 30s 超时与 1.59s 成功；cf-cache-status=DYNAMIC，HTML 未走边缘缓存。 |
| P3 | 暗色 config 无法测量 | /backend/config 404，改用 /backend/config/dictionaries 替代，最小比值 7.07（PASS，但不等同于原页面）。 |

## 截图产物（/tmp/verify96/flows/）

- backend-dark.png
- backend-error.png
- backend-load.png
- backend-loaded.png
- backend-recovered.png
- companies-dark.png
- companies-empty.png
- companies-error.png
- companies-load.png
- companies-loaded.png
- companies-recovered.png
- config-dark.png
- config-load.png
- config-loaded.png
- config_substitute-dark.png
- deals-dark.png
- deals-empty.png
- deals-error.png
- deals-load.png
- deals-loaded.png
- deals-recovered.png
- login-dark.png
- login-error.png
- login-load.png
- login-loaded.png
- updates-dark.png
- updates-error.png
- updates-load.png
- updates-loaded.png
- updates-recovered.png

- 载：{page}-load.png；稳定后：{page}-loaded.png（附加）；空：{page}-empty.png；错：{page}-error.png；恢复：{page}-recovered.png（附加）；暗色：{page}-dark.png（附加）。
- config 无 empty/error 截图（页面 404，N/A）；细节见 report.json。

## 未验证 / 限制

- 公网 TTFB：UNVERIFIED（窗口内 2/6 完整样本 + 多次 30s 超时），未用历史结论替代；C 段 cf-cache-status 来自实际 200 响应头。
- /backend/config 三态与暗色：UNVERIFIED（404）；暗色使用 /backend/config/dictionaries 替代。
- 错误态测试通过浏览器 route abort 实现，未改服务端；登录错误态使用 route abort POST（请求未到达服务器），未尝试错误密码。
