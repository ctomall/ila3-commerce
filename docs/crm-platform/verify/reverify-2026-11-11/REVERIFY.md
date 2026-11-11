# ILA3 Commerce T1–T16 独立复验（2026-11-11）

> 复验对象：`mercato.ila3.top` / `http://127.0.0.1:3000` 当前生产实例
> 复验依据：`docs/plan/2026-11-05-structure-visual-tasks.md` 原 T1–T16 验收口径
> 复验性质：**只读**。未部署、未重启、未改数据库/生产数据、未改被验仓库业务代码；构建/安装类检查只在隔离临时目录执行。
> 与历史结论的关系：`docs/acceptance-2026-11-05.md` 的 ✅ 仅作对照，不作为本次判定依据；凡与本次实测冲突，以本文件实测为准。

## 0. 本轮发布候选（已冻结）

| 字段 | 值 |
| --- | --- |
| 运行 commit | `56d319dc7b423618257b2f7dcc2c3a136b6f8ec6`（short `56d319dc`） |
| release 创建时间 | `2026-11-11T00:54:50.762Z` |
| 版本元数据 | `release.json` = `0.2.2`；页面页脚 = `v0.9.0 (56d319d)`（不一致，见 T14） |
| 来源 | `ci-artifact`，workflow run `42932072943`（`.github/workflows/build-artifact.yml`） |
| 产物 | id `13817151450`，14,589 files，archive sha256 `b78534a4…56de8`，contentDigest `17129f56…314b` |
| 安装 | `yarn install --immutable`，29,415 ms；主机未跑 Next build |
| 运行时 | pid `2071847`，`/proc/2071847/cwd` = `/home/pro/releases/mercato/56d319dc…`（与 release 一致） |
| 源码 | 冻结时 HEAD = `7ee01b7`，复验中上游又推进到 `e055b80`；两者均**未部署**（仅 communications 改动） |
| 健康 | `/login` HTTP 200；`/backend` 登录后 200 |

证据：`evidence/candidate.json`。

## 1. 结论总表（T1–T16）

| ID | 验收要点（原文口径） | 判定 | 关键实测 |
| --- | --- | --- | --- |
| T1 | `/login` HTML ≤150 KB、内联键 ≤1500 | **通过** | 112–114 KB；内联键 867（窄正则）/1,427（宽正则），均 ≤1500；`/login` 无后台导航壳 |
| T2 | 字典外置为可缓存资源；`cache-control: public, max-age=31536000, immutable`；CF HIT | **不通过** | 无 `/api/i18n/*`（5 条探针 404）；字典内联 HTML；`/api/dictionaries` 200 但无 cache-control/etag；公网 `cf-cache-status: DYNAMIC` |
| T3 | 关 extension 套餐后内联键降 ≥30%、构建时间下降 | **不通过（未达成）** | 机制存在但惰性：生成注册表 278 个模块导入、0 处 tier；生成器不读 `enabledModules`；本轮未在隔离环境重跑 tier 构建对比 |
| T4 | 对外无 `-v2`；旧路径 301；路由清单与 `route.ts` 数量一致 | **不通过** | `companies-v2/[id]`、`people-v2/[id]` 仍在路由注册表；实际请求 **200**（非 301）；列表/详情/搜索/仪表盘仍产出 `-v2` 链接；无 `docs/routes.md`，`src/proxy.ts` 无 rewrite |
| T5 | DOM 无裸枚举；未知枚举 `—` 并上报 | **通过** | 46 页扫描无裸 `in_progress/open/lost/win/healthy/monitor/at_risk`（config 值列豁免）；`UNKNOWN_LABEL='—'` + `onUnknown` 单测通过 |
| T6 | 中文界面无 `Nov 3, 2026` / `3:10 PM` 形态 | **部分通过** | 8 页扫描无上述英文形态；但 `/backend/checkout/pay-links` 已创建列渲染 `11/3/2026`（en-US 数字格式） |
| T7 | 18 业务页 + 26 设置页英文残留归零 | **不通过** | 46 页（18 业务 + **28** 设置）中 **12 页**仍有英文 UI；含 `Pay Links/Create Link`、`Save translations`、`Add partition`、`Search Settings`、`System status`、integrations 整页英文 |
| T8 | 导航项 100% 有名称；分组 ≤8；Tab 顺序可用 | **部分通过** | 展开后 63/63 链接有 `aria-label`/可读名称；Tab 顺序从跳转链接→侧栏→分组→子项可用；**主分组 14 个（>8）** |
| T9 | 默认列 ≤5；1280px 无横向滚动 | **部分通过** | companies/deals/wms/tasks ≤5 且无横向滚动；orders/quotes/transactions 8 列、products 22 列（均无横向滚动） |
| T10 | 组件不直接引用 primitive（stylelint 规则） | **通过** | `tokens:check --strict`：4 files / 8 tokens / **non-semantic 0** |
| T11 | 6 个主页面三态齐全 | **不通过** | 组件齐（EmptyState/ErrorState/SkeletonTable）；companies/deals/login 达标；`/backend/config` **404**；系统升级页错误态**无限骨架**；deals 错误态与「暂无商机」并存 |
| T12 | 品牌资产齐备；`/login` 首屏使用主视觉 | **部分通过** | logo 变体/favicon 16·32/180/OG/空错插图齐且 200，`<head>` 引用正确；**登录页无主视觉大图**（品牌文档自述“暂缓”） |
| T13 | 6 页暗色截图；暗色对比度 ≥4.5:1 | **通过** | 暗色实测最小 **6.94**（login），其余 7.66；badge ≥7.98；`docs/visual-baseline/` 6 张存在但为 **2026-11-04** 旧构建，建议重拍 |
| T14 | 页脚 `ILA3 Commerce · vX.Y.Z (abc1234)` | **部分通过** | 格式符合：`ILA3 Commerce · v0.9.0 (56d319d)`，SHA 与运行 commit 一致；版本号与 `release.json`/`package.json` 的 `0.2.2` 不一致 |
| T15 | CI 预构建产物 + 软链切换；升级窗口 ≤60 s | **通过** | 实际切换：systemd `Stopped 00:54:58` → Next `Ready 00:55:06` ≈ **8 s**；安装 29.4 s；全程无主机 Next build |
| T16 | 补丁清单 + postinstall 断言；重装后自动校验 | **部分通过** | 部署产物：**21 patches / 35 targets 全部 present**；隔离纯净包复现 `OK`（语法/效果/行为）；但 **无 postinstall**，普通 `yarn install` 不校验；预算 15、实际 21（**超 6**） |

统计：通过 5（T1/T5/T10/T13/T15）；部分通过 6（T6/T8/T9/T12/T14/T16）；不通过 5（T2/T3/T4/T7/T11）。

## 2. 逐项证据

### T1 首屏壳分离（通过）

```
GET /login → 200
html 114,274 B (112 KB)；内联键 867（`\\"ns.key\\":` 窄正则）/ 1,427（宽正则）
body 仅品牌 + 表单 + 页脚，无后台侧栏/导航
```

### T2 字典外置与缓存（不通过）

| 探针 | 结果 |
| --- | --- |
| `/api/i18n/zh`、`/api/i18n/en`、`/api/i18n`、`/api/translations`、`/api/locales` | 全 404 |
| `/api/dictionaries` | 200，8,046 B，**无** cache-control / etag / content-encoding |
| `/api/customers/dictionaries/currency` | 200，15,442 B，同样无缓存头 |
| i18n 字典载体 | 服务端内联：`/login` 1,427 键；`/backend` **23,107** 键 |
| 公网 `/login` | 200，`cf-cache-status: DYNAMIC`，`cache-control: private, no-store` |

结论：原任务书的“字典外置为可缓存资源”未实现；历史验收把 T2 改写成“后台字典瘦身”，本次按原文口径判不通过。且后台内联键 23,107，也高于历史宣称的 5,428。

### T3 模块套餐（不通过）

- `src/lib/module-tiers.ts` + `src/modules.ts` 的 `OM_MODULE_TIER` 过滤存在；
- 运行产物 `.mercato/generated/modules.generated.ts`：278 个模块 import、`tier` 出现 **0** 次；
- CLI 生成器（`@open-mercato/cli`）不读取 `enabledModules`；
- 未在隔离环境执行 `OM_MODULE_TIER=core` 构建对比（只读边界），故“≥30% 降幅”无本轮证据；按静态结构判定达标路径不成立。

### T4 路由 -v2 收敛（不通过）

```
GET /backend/customers/companies/<id>       → 200
GET /backend/customers/companies-v2/<id>    → 200   （期望 301）
GET /backend/customers/companies-v2          → 404
```

- 产物路由注册表含 `/backend/customers/companies-v2/[id]`、`/backend/customers/people-v2/[id]`；
- `node_modules/@open-mercato/core` 中列表行点击、创建后跳转、搜索、仪表盘 widget 均生成 `-v2` 链接；
- `src/proxy.ts` 只有 `x-next-url` 头，无 rewrite/redirect；
- 仓库无 `docs/routes.md`，无路由清单生成器（`route.ts` 39 个、`page.tsx` 6 个，与 546 条基线不可比）。

### T5 状态枚举（通过）

- `src/lib/status-label.ts`：`UNKNOWN_LABEL='—'`、`onUnknown` 上报、含 health/dealStatus/lifecycleStage 映射；单测覆盖未知值；
- 46 页 innerText 扫描未见非豁免裸枚举；deals 徽章为「未关闭/赢单/输单/进行中」；
- 豁免：`/backend/config/customers` 的“值列”与 `/backend/config/workflows` 的命令 ID 属刻意展示。

### T6 日期/数字本地化（部分通过）

- 8 个业务页扫描：无 `Nov 3, 2026`、无 `3:10 PM`；
- 反例：`/backend/checkout/pay-links`「已创建」列渲染 `11/3/2026`（英文数字日期），zh-CN 应为 `2026/11/3`。

### T7 英文残留（不通过）

46 页复验：**PASS 34 / FAIL 12 / UNVERIFIED 0**，全部 HTTP 200、有真实内容。失败页与命中文本：

| 页面 | 命中（示例） |
| --- | --- |
| `/backend/checkout/pay-links` | `Pay Links`（h1）、`Create Link`（主 CTA） |
| `/backend/checkout/transactions` | `Transactions`（h1） |
| `/backend/integrations` | `Configure`、`0 log events (30d)`、`Error rate: 0%`、`Data Sync`（整页 zhRatio≈0.09） |
| `/backend/documents` | `Favorites`、`Templates` |
| `/backend/config/currency-fetching` | `Fetch Now`、`Daily Sync Time:`、`Last Sync:`、`success`、`Rates Fetched: 0` |
| `/backend/config/notifications` | 分类表头 `Security/Checkout/Communication/Warranty claims/Webhooks/Workflows` |
| `/backend/config/system-status` | `System status`（h2）、`Runtime mode: Production` |
| `/backend/config/module-telemetry` | `Module telemetry`（h2）、`Report generated…`、`Collecting since…` |
| `/backend/config/translations` | `Translations`（h2）、`Save translations`（按钮）、英文说明段 |
| `/backend/config/attachments` | `Attachment partitions`（h2）、`Add partition`、`Storage/Env variable` 表头 |
| `/backend/config/search` | `Search Settings`（h1）、`Driver: No fulltext driver configured.` |
| `/backend/config/encryption` | `Save encryption map`、`Add field` |

补充：设置页实际 **28** 个（nav 去重），不是任务书基线的 26；未凑数、未推断差异来源。`/backend/config/customers` 的 `in_progress` 为值列+中文标签并列，判豁免。

### T8 导航可访问性（部分通过）

| 指标 | 实测 |
| --- | --- |
| 展开后侧栏链接 | 63 |
| 无名称链接 | **0** |
| 无 `aria-label` 链接 | 0 |
| 主分组按钮 | **14**：工作台/客户/销售/商品目录/仓储运营/售后/人员与项目/排班与工时/支付/文档/消息/自动化/业务合规/管理中心 |
| Tab 顺序 | 跳转链接→侧栏切换→品牌→导航搜索→分组→子项，可用 |

分组 14 > 8，未达原验收；历史记录写“设置分组 8”，与主侧栏分组不是同一口径。

### T9 表格列优先级（部分通过）

1280×800 实测：

| 页面 | 默认列 | 横向滚动 |
| --- | ---: | --- |
| companies / deals / wms | 5 | 无 |
| customer-tasks | 4 | 无 |
| orders / quotes / transactions | 8 | 无 |
| catalog/products | 22 | 无 |

“≤5 列”只在部分页面成立。

### T10 令牌（通过）

`node scripts/check-token-layers.mjs --strict` → `files scanned 4 / distinct tokens used 8 / non-semantic usages 0`。

### T11 三态（不通过）

| 页面 | 载 | 空 | 错 |
| --- | --- | --- | --- |
| `/backend` | PASS（加载指示→内容） | N/A | PASS（组件级文案，无 alert/重试） |
| companies | PASS | PASS（中文空态+插图+清除） | PASS（role=alert，可恢复） |
| deals | PASS | PASS | PASS（alert+重试；但同时出现「暂无商机」，错误/空并存） |
| `/backend/config` | **FAIL：404** | N/A | N/A |
| 系统升级 `/backend/config/system-update` | PASS（骨架→5 行） | N/A | **FAIL：2/6/11 s 无限骨架，无错误态/重试** |
| `/login` | PASS（SSR 无骨架） | N/A | PASS（alert，可恢复） |

组件存在（`src/components/states/{EmptyState,ErrorState,SkeletonTable}.tsx`），但“6 页三态齐全”未成立。

### T12 品牌资产（部分通过）

`/brand/{favicon-16,favicon-32,apple-touch-icon-180,og-512,logo-mark,logo-mono,logo-wordmark,state-empty,state-error}` 全部 200；`<head>` 正确引用 16/32/SVG/180/OG；`/login` 使用 `/brand.svg` 作为标识。**无登录主视觉大图**，`docs/brand.md` 自述“登录页主视觉大图…暂缓”。

### T13 暗色基线（通过）

Chromium `prefers-color-scheme: dark`（html class=dark，body `rgb(10,10,10)`），canvas 取色合成背景：

| 页面 | 最小比值 | 必填样本 |
| --- | ---: | --- |
| companies / deals / 系统升级 | 7.66 | 6/6 |
| `/backend` | 7.66 | 5/6（无表格） |
| `/login` | **6.94** | 4/6（无表格/侧栏） |
| `/backend/config` | 404 | 替代页 dictionaries 7.07（不等同） |

全部 ≥4.5；`docs/visual-baseline/` 6 张截图为 2026-11-04，非当前构建，建议重拍后归档。

### T14 页脚品牌化（部分通过）

渲染：`ILA3 Commerce · v0.9.0 (56d319d)`。格式符合；`56d319d` 与运行 commit 一致；但 `release.json`/`package.json` 为 `0.2.2`，版本字符串来源不一致。

### T15 升级原子化（通过）

- 产物来源 `ci-artifact`，安装 29.4 s，主机未跑 build；
- 真实切换窗口：`Stopping/Stopped 00:54:58` → `✓ Ready in 184ms`（`00:55:06`）≈ **8 s** ≤60 s；
- 未在隔离环境另做一次全链路升级演练（避免影响生产），以本次真实发布为观测证据。

### T16 补丁治理（部分通过）

```
(仓库)  node scripts/verify-patches.mjs → all 21 patch(es) present across 35 target(s)
(产物)  cd /home/pro/releases/mercato/56d319dc… && node scripts/verify-patches.mjs
        → all 21 patch(es) present across 35 target(s)
(隔离)  node scripts/check-patch-reproducibility.mjs
        → temp workspace… all 21 present；syntax OK；effects OK；behaviour OK；OK
```

不达标项：`package.json` **无 postinstall**（普通 `yarn install` 不自动校验）；补丁预算 15、实际 21，`check-patch-budget` 报 “over budget by 6”；清单路径为 `scripts/patches/manifest.json`（任务书写作 `scripts/patches-manifest.json`）。构建链 `build:inner` 确实先 `verify-patches --apply`，属构建期兜底，不替代 postinstall 断言。

### 附：T17（任务书存在，目标 T1–T16 之外）

`node scripts/crm-dict-cr-audit.mjs` → 19 行 / 291 条关联条目仍含 CR；清洗 SQL 已生成但“执行仍需人工批准”。本轮未改数据。

## 3. 页面覆盖与问题清单

### 3.1 覆盖

- 18 业务页 + 28 设置页 = **46 页**，全部真实浏览器加载，HTTP 200，0 超时；
- 46 张截图 + 46 份 innerText；证据 `evidence/pages-report.json`、`evidence/pages-summary.md`。

### 3.2 问题清单

| 级别 | 问题 | 证据 |
| --- | --- | --- |
| P0 | T4 未收敛：`-v2` 仍是对外可用路径（200），且列表/搜索/仪表盘持续产出 `-v2` 链接 | 2 条 200 响应 + 路由注册表 + 源码链接点 |
| P0 | T7 未归零：12/46 页英文 UI，含主 CTA 与页面标题 | 逐页 innerText + 截图 |
| P1 | `/backend/config` 404，任务书“六主页面”之一不存在；导航也无该索引页 | 404 |
| P1 | 系统升级页无错误态：拦截 API 后无限骨架 | 2/6/11 s 三次采样 |
| P1 | 字典无缓存资源：`/api/i18n/*` 404、dict API 无缓存头、公网 DYNAMIC | 探针 + 响应头 |
| P1 | 后台首屏 1.73 MB / 内联字典 23,107 键 | loopback 20 次采样 |
| P2 | 错误文案英文 `Failed to fetch`；deals 错误态与空态并存；dashboard 无 alert/重试 | 拦截实验 |
| P2 | 主侧栏分组 14 > 8 | 展开后 DOM |
| P2 | 部分列表默认列 >5（orders/quotes/transactions 8、products 22） | 1280 实测 |
| P2 | 页脚版本 `v0.9.0` ≠ 构建 `0.2.2` | 渲染文本 vs release.json |
| P2 | 补丁预算超 6、无 postinstall 断言 | budget 输出 / package.json |
| P3 | 暗色基线截图为旧构建；登录无主视觉；公网 TTFB 抖动（2/6 样本，其余 30 s 超时） | 文件时间 / brand.md / curl |

## 4. 与历史验收记录的差异（对照，不据此判定）

| 项 | `acceptance-2026-11-05.md` 宣称 | 本次实测 |
| --- | --- | --- |
| T2 | 后台字典 907 KB / 5,428 键 | 后台 1.73 MB / 23,107 键；且无缓存资源 |
| T4 | （未列入验收表） | `-v2` 仍 200，未收敛 |
| T7 | 44 页 0 残留 | 46 页 12 页英文 |
| T8 | 导航 41/41、设置分组 8 | 63/63 有名称，但主分组 14 |
| T9 | 客户/商机 5 列 | 仅部分页面 ≤5 |
| T11 | 三态组件 + 5/6 页面 | 6 页三态不齐（config 404、升级页错误态失败） |
| T16 | 20 补丁全 present、接入 build | 21 补丁 present + 隔离复现 OK，但无 postinstall、预算超 6 |
| 设置页 | 26 | 实际 28 |

## 5. 签收建议

**不建议按“T1–T16 全部达成”签收。** 当前候选 `56d319dc` 可继续对外服务（核心列表/详情/跟进链路 HTTP 正常、暗色对比度达标、发布切换约 8 s），但原任务书仍有 5 项不通过、6 项部分通过。

建议的放行条件（按优先级）：

1. **T4**：把 `-v2` 路由改为 301 到无 `-v2` 路径，并把列表/搜索/仪表盘链接切到规范路径；补路由清单生成与数量断言。
2. **T7**：修 12 个失败页的英文 UI（标题/CTA/表头/状态行），复验到 0 残留。
3. **T11**：系统升级页补错误态与重试；明确 `/backend/config` 入口（或从“六主页面”口径移除并书面确认）。
4. **T2**：给出字典缓存的产品口径；若保留内联，需在任务书中改口径并重新验收，不能沿用旧 ✅。
5. **T9/T8/T12/T14/T16**：列数、分组数、登录主视觉、版本号、postinstall/预算，逐项改口径或修复后再签。

复验方法限制：全程只读；未在隔离环境重跑 tier 构建对比（T3）；未做独立升级演练（T15 以真实发布观测代替）；公网 TTFB 因链路抖动未取得 20/20 样本（标 UNVERIFIED）；暗色 `/backend/config` 用替代页测量。

## 6. 证据索引

| 文件 | 内容 |
| --- | --- |
| `evidence/candidate.json` | 候选冻结：sha/产物/运行时 pid/cwd/源码 HEAD |
| `evidence/pages-report.json` | 46 页逐页结果（状态/标题/中文占比/裸键/英文残留/截图） |
| `evidence/pages-summary.md` | 页面复验计数、28 设置页清单、12 失败清单、方法 |
| `evidence/english-chrome.json` | 英文 UI 命中元素（tag/class/rect/heading） |
| `evidence/settings-sections.json` | nav 返回的设置分组原始数据 |
| `evidence/flows-report.json` | 三态/暗色/字典/性能原始数值（A/B/C/D） |
| `evidence/flows-summary.md` | 三态与对比度逐项结论、问题清单 |
| `evidence/t8-nav.json` | 63 链接名称、14 分组、Tab 顺序 |
| `evidence/t5-t6-t9.json` | 8 页枚举/日期/列数/横向滚动原始值 |
| `evidence/shots/` | 侧栏展开、6 页暗色、3 个失败页截图 |

---

## 7. 修复后复验更新（2026-11-11 09:05，运行 `6a721d1`）

> 本节是修复后的状态，不覆盖第 1 节的基线判定；基线保留作前后对照。

| 项 | 基线（56d319dc） | 现状（6a721d1） | 证据 |
| --- | --- | --- | --- |
| T4 `-v2` 收敛 | 不通过（200） | **通过**：companies-v2/people-v2/config/system-updates 均 301 到规范路径 | `/tmp/reverify-loop/release-6a721d1/` |
| T11 三态 | 不通过（config 404、升级页无限骨架） | **通过**：config 301→settings；升级页 571ms 中文 alert+重试，恢复 5 行 | 同上 |
| T14 页脚版本 | 部分通过（0.9.0 vs 0.2.2） | **通过**：`v0.2.2 (6a721d1)`，版本与 SHA 同源 | 同上 |
| T7 英文残留 | 不通过（12/46 页） | **部分通过**：9/12 目标页归零；剩 44 条包内硬编码（integrations 25、search 19）+ 1 条 `success` 状态值；0 条字典可修 UI 标签 | `release-6a721d1/t7-classification.json` |
| T8 导航分组 | 部分通过（14>8） | 未改，仍 14 组；63/63 有名称、Tab 可用 | `release-6a721d1/` |
| T13 暗色基线 | 截图陈旧（11-04） | **已重拍**当前构建 6 张（`docs/visual-baseline/dark-*.png`，1440×900，html.dark）；对比度沿用实测最小 6.94（≥4.5） | `docs/visual-baseline/` |
| DSH 引擎 | — | A 阶段 mock 模型端到端 PASS（隔离实例）；生产仍 OpenCode | `docs/crm-platform/dsh-integration/EVIDENCE-2026-11-11-A.md` |

**更新后的签收建议**

- 原 T1–T16 修复范围：T4/T11/T14 已关闭；T7 只剩“声明硬编码 + 状态数据值”，需产品豁免口径；T8 需信息架构决策；T2/T9/T16 仍待口径。
- 可以按“T4/T11/T14 已验收、T7 条件通过、T8 保留”做**有条件签收**；不建议宣称 T1–T16 全部达成。
- DSH 替换未完成：生产未切换、B 迁移未应用、C/D 未闭环、真实模型未调用。

---

## 8. 2026-11-11 14:5x 状态补充（不覆盖第 7 节）

> 第 7 节记录 `6a721d1` 时刻；此后生产已切换 DSH，UI 入口/会话隔离已修复并通过独立 QA。本节只更新状态与签收建议。

| 项 | 当前状态 | 证据 |
| --- | --- | --- |
| T4 `-v2` 收敛 | 通过（未回退） | 第 7 节 |
| T11 三态 | 通过（config 301→settings；升级页错误态） | 第 7 节 |
| T14 版本同源 | 通过 | 页脚 `v0.2.2 (<sha>)` |
| T13 暗色基线 | 已重拍并通过（对比度沿用最小 6.94） | `docs/visual-baseline/` |
| T7 英文残留 | **条件通过**：9/12 目标页归零；44 条包内硬编码（integrations 25、search 19）+ 1 条 `success` 状态值待产品豁免 | `release-6a721d1/t7-classification.json` |
| T8 导航分组 | 保留（14 组 > 8），需信息架构决策 | 第 7 节 |
| T2/T9/T16 | 待口径，未擅自改验收 | — |
| DSH 引擎 | **生产已切 DSH**（`OM_AI_ENGINE=dsh` + `OM_DSH_PERSIST=orm` + `OM_DSH_AGENTIC=1`）；正式 `/api/ai_assistant/chat` 与 UI `ai/chat` 实测执行 DSH | `docs/crm-platform/dsh-integration/EVIDENCE-2026-11-11-REAL.md` §10–§17 |
| DSH 独立 QA | release `5113ec9` 5/5 PASS（默认入口/会话隔离/回归/双员工隔离） | `/tmp/reverify-loop/real-5113ec9/` |

**签收建议（2026-11-11）**

- UI 修复线：可按“T4/T11/T14/T13 已验收、T7 条件通过、T8/T2/T9/T16 保留”做**有条件签收**；不建议宣称 T1–T16 全部达成。
- DSH 替换线：生产可用、核心链路与 QA 通过，但 **不满足 complete**：工具卡/审批富事件未接、写工具未开、其余 3 名员工未抽样、同 uid OS 隔离未实现、`customer_access` 未产品化。
- 需要产品决策的最小集：T7 44 条包内硬编码豁免口径；T8 14 组导航是否合并；助手入口默认可见性。
