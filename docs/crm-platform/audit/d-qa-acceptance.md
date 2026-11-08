# 子审计 D · 独立 QA 验收设计（原文归档）

> 只读审计，未写任何文件。以下为主 Agent 复核后确认的事实 + 设计。

## 结论

现有验证资产的**断言总量远小于名声总量**：能进生产证据链的是 4 个脚本、约 40 条断言，且全部落在像素/中文/令牌层；**CRM 业务、授权、幂等、配额的断言数 = 0**。

## 1. 现有资产到底断言了什么（主 Agent 已抽查复核）

| 资产 | 实际断言 | 证据级？ |
|---|---|---|
| `scripts/ui-regression.mjs` | 3 条静态（`/login` ≤150KB、内联键 ≤1500、`notices.*` 出现、zh 分页串无"用时"）+ 11 条浏览器（`td`≤41px、`th`≤36px、`aria-sort` 数 == 可排序列数、`tabular-nums`、emoji 0、无循环动画、焦点环 ≥2px、`aside` 240–280px、设置页三件套）；依赖运行实例 + 明文凭证 | 仅设计/中文/像素，CRM 域零断言；含 retry-once |
| `scripts/check-contrast.mjs` | 单页（`/backend/sales/quotes`）6 选择器 × 明暗，自算 WCAG | 测量真实但范围窄；**可被登录重定向糊过**（见 §5） |
| `scripts/verify-patches.mjs` | 每条：文件存在 + 含 marker 字符串 | 字符串在场，非行为 |
| Jest（8 文件，`roots:['src']`） | 纯函数单测 | 对该 8 个函数有效；`passWithNoTests:true`（已复核 `jest.config.cjs:10`）+ `diagnostics:false`（:36）→ 0 测试也退出 0 |
| `.ai/qa` Playwright | **0 个 spec**（`find .ai/qa -name '*.spec.ts'` → 0） | 断言数 0 |
| `docs/acceptance-*.md` | 「验收口径/实测/判定」+ `偏离与例外` + `未达成`，敢写否定 | 格式可复用，数字不可复跑 |
| 门禁脚本 | `tokens:check --strict`、`patches:budget`、`version:check`、`i18n:check-hardcoded`、`nav-check`、`ds:check`；`hooks:check` 恒退出 0 | 可作构建门，`hooks:check` 不可 |
| `build:inner` | `verify-patches --apply && version:check && tokens:check --strict && generate && next build`（已复核） | **不含 lint/typecheck/test**，构建绿 ≠ 三者绿 |
| `.ai/review-checklist.md` | 幂等键含 tenant+org、配额走约束/锁/CAS、scope 从受信上下文派生、undo 重新鉴权 | 判据源，非可执行证据 |

## 2. 里程碑 → 验收口径 → 证据产物

| 里程碑 | 口径 | 产物 |
|---|---|---|
| M0 | 每条结论带命令与原始输出；无证据写「未核对」 | 基线文档 + `git rev-parse HEAD` |
| M1 | 每入口有 `requireAuth`/`requireFeatures`/`page.meta`；未登录直取 302/401 | 断言脚本 + `curl` 状态码矩阵 + `git status .mercato/generated` 为空 |
| M2 | OpenAPI 可拉取；请求 schema 不含 `tenantId/organizationId`；响应含 `updatedAt` | 带凭证 path/op 计数 + 时间戳 |
| M3 | ui-regression 全 PASS、i18n 退出 0、对比度样本数下限 | 6 页截图 + 每页独立命令输出 |
| M4 | 七类攻击全部「拒绝 + 留审计行」 | HTTP 状态 + body + 审计行 JSON |
| M5 | 七段链路稳定 run id；同幂等键两次写 → 行数 +1、二次返回原 id | run 日志 + `psql` 前后行数 |
| M6 | 未审批发送 4xx；草稿 hash 绑审批；回执落库；回复分类混淆矩阵 | 原始 4xx + 分类 fixture |
| M7 | 签名失败即拒；一次端到端会话 | 回放 transcript + 坏签名拒绝 |
| M8 | 租户/组织限定、配额生效、kill switch、回滚已执行 | 429 原文 + 关停前后请求 |

## 3. M4 对抗性安全套件（攻击 → 期望 → 不可伪造产物）

| # | 攻击 | 期望 | 产物 |
|---|---|---|---|
| 1 | 猜 ID 跨员工取 candidate/run/artifact | **404 而非 403**（不泄露存在性） | 状态码矩阵 CSV |
| 2 | 绕过 UI 直调写接口 + body 注入 `tenantId` | 服务端独立拒绝；注入字段不生效 | 原始请求/响应 + 落库 scope |
| 3 | 模型伪造 acting user | 伪造值不采信；审计分别记 actor 与 on-behalf-of | 审计两列原文 |
| 4 | 子 Agent 提权 | 工具集 = 交集（非并集） | 子/父工具清单 diff |
| 5 | 撤权影响在飞任务 | 立刻 fail-closed，**不完成** CRM 写入；每次工具调用都校验 | 撤销时间戳 + 终止日志 + CRM 行数 0 |
| 6 | 跨员工隔离 file/session/memory/browser | 独立目录、不共享 cookie/profile/memory | 目录清单 + 跨读失败 |
| 7 | 配额/审批绕过：超配额创建、审批令牌复用 | 429 / 4xx；令牌与草稿一一绑定 | 原始响应 + 复用拒绝 |

## 4. 四层「完成」定义与拒收点

| 声明 | 必要条件 | 必须拒收 |
|---|---|---|
| 代码完成 | diff + `yarn typecheck`=0 + `yarn lint`=0 + 已注册 + `yarn generate` 干净 | 任一未跑 |
| 测试通过 | 具名套件、测试数 > 0、有一次负向对照 | 空跑绿；唯一断言是 marker；0 spec |
| 已部署 | 线上 URL 的构建 SHA == 本次 SHA；健康检查 200；新行为线上复现 | 本机 build 成功；只有 127.0.0.1 可访问 |
| 业务验收 | 具名人类签字 + 每条「实测」列可复跑命令 + 显式「未达成」 | 签字人 = 构建者；无「偏离与例外」 |

## 5. 最容易被伪造的 5 项与反伪造产物

| 风险 | 今天怎么糊过去 | 反伪造产物 |
|---|---|---|
| 「测试通过」 | `passWithNoTests` + 0 集成 spec → 空跑绿 | JUnit XML `tests>0` + 负向对照那一次的红 |
| 「已部署」 | 本地构建冒充上线 | 线上页脚/响应头携 SHA（现有页脚已渲染 `v0.9.0 (<sha>)`）+ deploy-artifact 日志 |
| 补丁/设计门禁 | marker 在场即过 | 每条补丁一个行为探针 |
| 对比度 PASS | 被踢回登录页仍报 PASS（`samples.filter` 丢弃未渲染元素，分母随之变小） | 断言样本数下限 + 落地当前 URL/标题 |
| 「幂等/隔离已验证」 | 读代码说「有幂等键」 | 同键两次写 + 行数前后 + 二次返回原 id |

> 口径：`ui-regression 18/18` 与 `contrast 10/10` 是真实测量，但只证明**界面没退步**，不能替 M1–M8 任何业务声明背书。
