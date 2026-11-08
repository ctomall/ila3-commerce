# 安全探针 · 运行说明与判读

## 是什么

`scripts/crm-security-probe.mjs` —— 用真实凭证打真实接口，记录**每个角色实际得到的响应**，产出 `matrix.json` + `matrix.md`。

它不是「安全测试通过」的证明，而是**基线**：把今天的行为固定下来，之后每改一处权限或桥接，重跑同一份脚本并 diff。

```bash
node scripts/crm-security-probe.mjs            # 默认输出到 poc/<日期>-probe/
node scripts/crm-security-probe.mjs --out /tmp/probe-2
```

## 2026-11-08 基线（14 例 / 14 符合预期 / 0 需复核 / 5 张表零写入；脚本会在不符合时 exit 1）

| 结论 | 证据 |
|---|---|
| 匿名访问业务接口 → 401 | `GET /api/customers/companies` → `{"error":"未登录"}` |
| 未登录读契约面 → 401；**已登录员工可读** → 200 | 同一端点两种角色，属设计（内部文档） |
| 员工注入 `?tenantId=<他人>` → 403 | 租户守卫 `enforceTenantSelection`（`tenantAccess.ts:60-79`）拒绝 |
| 员工注入 `?organizationId=<不存在>` → 200，但**结果集不变** | 基线可见 3 家，注入后仍 3 家（脚本内 `check` 断言） |
| 员工写公司 → 全部拒绝（400 无组织上下文 / 403 租户不可达 / 422 校验） | 三种拒绝都不写库：`customer_entities` 前后均为 9 行 |
| 员工删随机 id → 404 | 不泄露「存在性」 |
| 审计日志：员工即使在请求里塞 `canViewTenant=true&scope=tenant`，服务端仍按本人范围返回 | `canViewTenant:false`，`items:[]`，参数无法翻转 |
| 未登录调 AI → 401；未知 agent → **404 `agent_unknown`**，不进入模型调用 | `/api/ai_assistant/ai/chat?agent=…`（路径曾是错的，见下） |

## 本探针**没有**覆盖（别拿它当 M4 通过）

| 维度 | 为什么没覆盖 | 补上需要 |
|---|---|---|
| 跨组织隔离 | 当前只有 1 租户 1 组织（`tenants` 1 行、`organizations` 1 行），没有对照组 | 建测试组织或第二租户（数据写入，需批准） |
| 跨员工 DSH 隔离（会话/文件/记忆/凭据/浏览器态） | 仓库只有 CRM 侧，没有每员工 DSH 运行时 | 每员工独立 DSH profile（`05-security-poc.md` §3） |
| AI 工具越权（G2） | 需要注册探针工具并构造「工具 requiredFeatures 覆盖不住路由」的场景 | PoC 环境 + 探针工具；见 `audit/e-authz-enforcement.md` §3 |
| 撤权影响在飞任务 | 没有 Run 生命周期可撤 | M5 的 Run 表 + 事件 |

## 判读规则

1. `needs-review` 才是行动项；`as-expected` 只说明「与契约一致」。
2. 状态码相同 ≠ 语义正确：审计日志与组织注入两例都加了 `check` 断言（`canViewTenant`、结果集大小），**只看 200 会误判**。
3. 每次改动权限、路由 metadata、AI 工具集后重跑并 `git diff` 基线文件。

## M4 对抗用例执行器

`node scripts/crm-m4-harness.mjs` —— 按 `05-security-poc.md` 的 7 条用例执行，**缺 fixture 的显式标 blocked，不冒充通过**。

当前：3 通过 · 0 失败 · 4 阻塞 · 1 用例无效（leadgen 路由不存在，404 不算拒绝证据）。

## 已修正的三个错误期望（记录，避免下次再犯）

- `GET /api/audit-logs` 是**不存在**的路径（真实是 `/api/audit_logs/audit-logs/actions`）；一开始把 404 当成「权限拒绝」。
- `POST /api/customers/companies` 空 body 的 400「需要组织上下文」不是校验失败，而是 scope 解析在写库前就 fail closed；把 403/400 都算作合格拒绝才对。
- `POST /api/ai/chat` **不存在**（真实是 `/api/ai_assistant/ai/chat`，agent 走 query 参数）。之前的“未知 agent → 404”其实是“路由不存在 → 404”，是一条**假通过**。现在改成真路径 + 断言 `code=agent_unknown`，并给执行器加了「路由不在 openapi 里就判用例无效」的护栏。
