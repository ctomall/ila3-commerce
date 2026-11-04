# ILA3 Commerce：结构与视觉优化任务书

> 基线：`f72e348`（2026-11-05）
> 依据：本轮实测（`/login` HTML 1 546 KB / 内联字典 21 438 键 / 668 模块中 68 启用 / 558 个 `page.meta` / 546 条路由）
> 视觉基线截图：`/home/pro/dsh/shots/05-dashboard.png`、`06-customers-list.png`

## 0. 总目标（OKR）

| 维度 | 现状 | 目标（2026-12-05 前） |
|---|---|---|
| 首屏体积 | `/login` 1 546 KB，内联 21 438 键 | ≤ 150 KB，内联 ≤ 1 500 键 |
| 公网 TTFB p95 | 1.79 s | ≤ 0.8 s（缓存命中 ≤ 0.3 s） |
| 界面语言一致性 | 中英混排 + 原始枚举（`in_progress`/`healthy`） | 无裸枚举、无英文残缺文案 |
| 可访问性 | 侧边栏 16 项无可访问名称 | 导航项 100% 有 `aria-label` |
| 设计系统 | 472 个 CSS 变量平铺 | 三层令牌 + lint 约束 |

**完成定义（DoD，每个任务都要满足）**

1. 有代码变更 + 有验证命令输出；
2. 不降低中文覆盖率（回归用例：18 业务页 + 26 设置页）；
3. 不引入新的 `node_modules` 补丁（除非同时登记进 `scripts/patches-manifest.json`）；
4. 通过 `yarn build`；
5. 变更可回滚（`git revert` 即可，无手工步骤）。

---

## 1. 任务分解

### E1 结构：渲染边界与模块治理（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T1** | `/login` 与 `/backend` 壳分离 | 新增 `src/app/(auth)/layout.tsx`；`src/app/layout.tsx` 只保留最小 provider | `/login` HTML ≤ 150 KB；`curl` 后统计内联键 ≤ 1 500 | — | 1.5 d |
| **T2** | 字典外置为可缓存资源 | `src/lib/i18n/*`、新增 `src/app/api/i18n/[locale]/route.ts` | 响应头 `cache-control: public, max-age=31536000, immutable`；CF `cf-cache-status: HIT` | T1 | 1.5 d |
| **T3** | 模块套餐化 | `src/modules.ts` 拆 `core/business/extension`；复用 `feature_toggles` | 关闭 extension 套餐后内联键再降 ≥ 30%；`yarn build` 时间下降 | T2 | 2 d |
| **T4** | 路由 `-v2` 收敛 | `src/proxy.ts` 加 rewrite；`docs/routes.md` 生成路由清单（546 条） | 对外无 `-v2` 路径；旧路径 301；清单与 `route.ts` 数量一致 | — | 2 d |

### E2 视觉一致性（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T5** | 状态枚举语义化 | 用 `registerComponentOverrides`（`@open-mercato/shared/modules/overrides`）覆盖列表/看板状态单元格，**不改 `node_modules`**；新增 `src/lib/status-label.ts` + `docs/glossary.zh.md` | DOM 扫描无 `in_progress\|open\|lost\|win\|healthy\|monitor` 裸值；未知枚举显示 `—` 并上报 | — | 1.5 d |
| **T6** | 日期/数字/货币本地化 | 统一 `Intl.*` 封装，替换零散 `toLocaleString` | 中文界面无 `Nov 3, 2026`/`3:10 PM` 形态 | T5 | 0.5 d |
| **T7** | 英文残余文案收口 | 列表底栏、空状态、按钮、页脚（`Showing 1 to 3 of 3 results in 549ms`、`20 per page`、`No customer tasks yet.`） | 抽查 18 业务页 + 26 设置页，英文残留清单归零 | T5 | 1 d |

### E3 信息架构与可访问性（P0）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T8** | 侧边栏分组 + `aria-label` | 用 `modules.ts` 的 `groupOrder` 渲染分组标题；icon-only 链接补名称 | 可访问性快照中导航项 **100% 有名称**；分组 ≤ 8；Tab 顺序可用 | T3 | 2 d |
| **T9** | 表格列优先级 | 默认列 ≤ 5，其余进「自定义列」（功能已存在） | 1280 px 下无横向滚动；默认列数断言 | — | 1 d |

### E4 设计系统（P1）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T10** | 令牌三层化 | `globals.css` 拆 primitive/semantic/component | 组件不再直接引用 primitive 变量（stylelint 规则） | — | 3 d |
| **T11** | 空/错/载三态组件 | 新增 `<EmptyState>` `<ErrorState>` `<SkeletonTable>` | 6 个主页面三态齐全，截图留档 | T10 | 2 d |

### E5 品牌与稳态（P1）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T12** | VI 资产包 | logo 变体、favicon 16/32/180、登录主视觉、空状态插图 | 资产清单齐备；`/login` 首屏使用主视觉 | T7 | 2 d |
| **T13** | 暗色视觉基线 | 6 个主页面暗色截图入 `docs/visual-baseline/` | 暗色下对比度 ≥ 4.5:1 | T10 | 1 d |
| **T14** | 页脚版本品牌化 | `Version 0.9.0` → 产品版本 + 构建号（`git rev-parse --short`） | 页脚显示 `ILA3 Commerce · vX.Y.Z (abc1234)` | — | 0.5 d |

### E6 可迁移性（P2）

| ID | 任务 | 改动点 | 验收 | 依赖 | 估时 |
|---|---|---|---|---|---|
| **T15** | 升级原子化 | CI 预构建产物 + 软链/容器 tag 切换 | 升级窗口 ≤ 60 s（现 2–7 min） | — | 5 d |
| **T16** | 补丁治理 | `scripts/patches-manifest.json` + `postinstall` 断言 | 重新 `yarn install` 后补丁自动校验通过 | — | 1 d |
| **T17** | 字典 CRLF 清洗 | `scripts/normalize-i18n.mjs`（幂等）；清洗 `src/i18n/*.json` | 字典中含 `\r` 的值 = 0；`yarn build` 通过；页面抽查无异常空白 | T5 | 0.5 d |

### 1.12 轮次进展（Round 5，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T1** `/login` 与 `/backend` 壳分离 | ✅ 完成并上线 | `/login` HTML **105 KB**（原 1 546 KB）／内联键 **813**（原 21 438） |
| **回归** `/backend` 未受影响 | ✅ | 1 605 KB / 22 379 键（与改前同量级）；登录接口 `POST /api/auth/login` → 200 |
| 页面文案完整性 | ✅ | 可见文本：`ILA3 Commerce 登录你的工作空间 邮件 密码 记住我 登录 忘记密码？ 条款 隐私`（无 key 泄漏） |

**实现方式（低风险）**

1. `src/proxy.ts` 早已注入 `x-next-url`（含 pathname）；
2. 新增 `src/lib/i18n/auth-dict.ts`：`isAuthRoute()` + `trimDictionaryForAuthRoute()`，
   只保留 `auth / common / ui / appShell / errors / validation` 六个命名空间；
3. `src/app/layout.tsx` 按请求路径决定是否裁剪，**其它路由完全不裁剪**；
4. 3 个单测覆盖（路由判定、命名空间保留、前缀误伤如 `authn.*`）。

**为什么不是“把字典搬走”（T2 的做法）**

T2 需要客户端懒加载 + 首帧兜底，回归面覆盖所有模块页；T1 只影响匿名壳，
`/backend` 一行不改，是收益/风险比最高的一刀。T2 仍保留为后续项，
用于进一步压缩后台页（当前 1.6 MB）。

---

### 1.11 轮次进展（Round 4，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T8（可访问性）** | ✅ 完成并上线 | 主导航 41/41 链接均有 `aria-label`（`named: 41 / total: 41`），中文名称如「公司」「商机」 |
| **T8（分组 ≤ 8）** | ❌ 未达标，已定位 | 主导航：**0 个分组、41 项平铺**；设置区：**12 个分组**（系统/身份认证/客户门户/数据设计器/模块配置/财务与货币/组织与租户/功能开关/自定义/开发者/外部系统/安全） |
| **T16** 补丁清单 | ✅ 扩展至 9 个 | `all 9 patch(es) present` |

**T8 分组的落地难点（下一轮处理）**

1. `AppShell` **支持**分组（`group.id` + `group.items`），设置区已经在用；
2. 主导航为平铺，是因为各模块的 nav 条目没有携带 group 元数据——`modules.ts` 里的
   `groupOrder`（33 条）只是**排序表**，不会凭空造出分组；
3. 设置区有 12 组 > 目标 8 组，需要把相近组合并（建议合并为：
   系统 / 身份与权限 / 客户与门户 / 数据与集成 / 模块配置 / 组织与财务 / 开发者 / 安全）；
4. 两条路都涉及页面元数据（`pageGroupKey`）与 nav 注册，属于配置级改造，需单独一轮。

---

### 1.10 轮次进展（Round 3，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T5（第二半）** 商机状态 | ✅ 完成并上线 | Dashboard DOM：`rawStatus: []`，渲染「进行中 / 未关闭 / 输单 / 已成交」 |
| **T6** 日期本地化 | ✅ 完成并上线 | Dashboard DOM：`englishDates: []`，日期为 `2026年11月3日 15:10` |
| **T7** 英文残留 | ✅ 主屏归零（待全站抽查） | 客户列表：`englishChrome: []`、`Not set`→「未设置」、`Yes/No`→「是/否」 |
| **T16** 补丁管线 | ✅ 扩展至 8 个补丁 | 构建日志 `all 8 patch(es) present` |

**根因（这是本轮最关键的发现）**

界面英文残留的**主因不是缺翻译**，而是**界面语言根本没有被设为中文**：

- 这些 key 在 `zh.json` 里全都有（`打开操作`、`每页`、`未设置`、`是/否`）；
- 页面默认按 `Accept-Language`/浏览器语言返回 `en`，中文只存在于**数据层**（客户名、字典项）；
- 设置 `OM_FORCE_LOCALE=zh` 后，`<html lang="zh">`，绝大多数英文一次性消失。

**日期为何仍不中文（第二层根因）**

Dashboard 小组件用 `setLocale(navigator.language)` 取语言，浏览器是 `en-US`，
于是界面中文、日期英文。补丁改为优先 `document.documentElement.lang`。

---

### 1.9 轮次进展（Round 2，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T5（第一半）** 关系健康度枚举 | ✅ 完成并上线 | DOM 扫描 `rawEnums: []`；单元格渲染「良好 / 需关注」；截图 `shots/07-status-labels-applied.png` |
| **T16** 补丁清单与 CI 校验 | ✅ 骨架完成 | `scripts/patches/manifest.json` + `verify-patches.mjs`；`yarn build` 前置 `--apply`，构建日志输出 `all 3 patch(es) present` |
| **T5（第二半）** 商机状态 `open/win/lost/in_progress` | ⏳ 待做 | 与自定义字段链路不同（实体字段/看板），需单独定位 |

**本轮定位到的真实渲染链路（三次假设被打回，最终以 DOM 为准）**

1. 先假设走 `applyCustomFieldVisibility` → 打了两处补丁仍无效；
2. 又怀疑浏览器缓存（`immutable`）→ 清缓存后仍无效；
3. 读页面源码才发现：客户列表在 `page.js` 内联构建 `customColumns`，
   且 `cell` 用的是本地 `renderCustomFieldCell(value)`，**闭包拿不到字段定义**；
4. 最终补丁：把 `def` 传入单元格并映射 `options[].label`。

> 结论：这类“看起来该在框架层”的问题，实际落在某个页面的内联实现里。
> 以后定位同类问题，先读**页面**再读框架。

---

### 1.8 轮次进展（Round 1，2026-11-05）

| 任务 | 状态 | 证据 |
|---|---|---|
| **T17** 字典 CRLF 清洗 | ✅ 完成并上线 | `scripts/normalize-i18n.mjs` 幂等；清洗前 2 184 / 13 502 条含 `\r`，清洗后 0；构建通过；`/login` 响应体 `\r` 计数 0 |
| **T5** 状态枚举语义化 | 🟡 内核完成，接线待定 | `src/lib/status-label.ts` + 7 个单测通过；但**渲染层接线受阻**（见下） |

**T5 接线阻塞点（实测）**

1. `custom_field_defs.config_json.options` 存的是裸字符串（`["healthy","monitor","at_risk"]`），
   列表单元格直接渲染原值。
2. `DataTable` 支持列级 `cell` 渲染函数，但注入列走的是**追加**语义
   （`DataTable.tsx` 无按 `accessorKey` 去重），直接注入会**多出一列**而不是替换。
3. 因此 T5 只剩两条可行路径，需在下一轮二选一：
   - **A（推荐）**：把列定义改由应用层提供（覆盖 `customers.companies.list` 的列构造），
     或提交上游 issue 让 `applyCustomFieldVisibility` 支持 `meta.cell`；
   - **B**：登记为受管补丁（`scripts/patches/`），在 `customFieldColumns.js` 里补
     `cell` 渲染 + 选项标签映射，纳入 T16 的补丁清单与 CI 校验。

---

### 1.7 T5 侦察结论（2026-11-05，已完成定位）

| 发现 | 证据 | 对方案的影响 |
|---|---|---|
| 中文翻译**已存在**，只是没用上 | `customers.companies.detail.health.healthy = "良好"`、`atRisk = "有风险"` | T5 是**接线问题**，不是翻译问题；工作量集中在渲染层 |
| 框架提供受支持的覆盖点 | `registerComponentOverrides`（`@open-mercato/shared/modules/overrides`）+ `ComponentOverrideProvider` | 可在应用层覆盖状态单元格，**无需再给 `node_modules` 打补丁** |
| 字典存在 CRLF 污染 | 13 502 个中文值中 **2 184 个**以 `\r` 结尾（如 `"最大步数\r"`） | 新增 T17 清洗；不清理会持续影响渲染与文本比对 |

---

## 2. 排期

```
Sprint 1（第 1 周）  T5 → T7 → T6 → T8        视觉一致性 + 导航可访问性（用户可感知）
Sprint 2（第 2 周）  T1 → T2 → T3 → T4        结构 + 性能（与 Sprint 1 无冲突）
Sprint 3（第 3 周）  T9 → T10 → T11 → T14     设计系统与三态
Sprint 4（第 4 周）  T12 → T13 → T16 → T15    品牌、基线与可迁移
```

> 排期原则：先做「用户天天看见且改动小」的（T5/T7/T8），再做「结构性大改」（T1/T2），
> 避免一次性大改导致无法归因。

---

## 3. 度量脚本（验收用，可直接跑）

```bash
# 1) 首屏体积与内联键数
curl -sS http://127.0.0.1:3000/login -o /tmp/l.html
node -e "
const h=require('fs').readFileSync('/tmp/l.html','utf8');
const keys=[...new Set([...h.matchAll(/\\\\\"([a-zA-Z][a-zA-Z0-9_]{2,60}\.[a-zA-Z0-9_.]{2,80})\\\\\":/g)].map(m=>m[1]))];
console.log('html_kb', Math.round(Buffer.byteLength(h)/1024), 'inline_keys', keys.length);
"

# 2) 裸枚举残留
grep -oE '\b(in_progress|open|lost|win|healthy|monitor|Not set)\b' /tmp/l.html | sort -u

# 3) 边缘缓存命中
curl -sS -o /dev/null -D - https://mercato.ila3.top/login | grep -i 'cf-cache-status'

# 4) 可访问性名称（浏览器内）
# ego_snapshot 后确认每个 navigation 下的 link 都有可读名称
```

---

## 4. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 字典懒加载导致首帧显示 key | 体验事故 | 服务端仍全量渲染，客户端仅替换交互文案；灰度 1 个租户先验证 |
| 模块套餐化破坏现有路由 | 功能缺失 | 套餐只影响**加载**不影响路由注册；先做开关灰度 |
| `-v2` 重写与详情页参数冲突 | 404 | rewrite 保留 query/参数；上线后 7 天内保留 301 |
| 令牌重构引发视觉漂移 | 全站观感 | 逐组件迁移 + 截图 diff 基线（T13） |
| 升级原子化改动部署链 | 上线风险 | 保留现有 `ila3-self-update` 作为回退通道 |
