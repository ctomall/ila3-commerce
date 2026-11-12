# 写工具 + 人工审批真实链路证据（C 阶段，2026-11-12）

运行 release：`d7437b57718a63f60f62ff466598f93dbde86f4c`（生产 `ila3-auto-deploy-app.service`，
`/home/pro/releases/mercato/current`）。生产开关 `OM_DSH_WRITES=1`（drop-in
`20-dsh-canary.conf` → `canary.env`）。数据表 `dsh_write_approvals` 已应用（新增表，
ledger `mikro_orm_migrations_dsh_approvals` 1 行）。

测试身份：生产验收员工 `acceptance-employee@example.test`（role `employee`）。

## 1. 正向链路：提议 → 批准 → 执行 → 单次消费

脚本：`/tmp/e2e/write-e2e2.mjs`，原始输出
`evidence/write-approval/write-e2e2-result.json`。

| 步骤 | 真实动作 | 结果 |
| --- | --- | --- |
| A 提议 | 模型先调 `crm_find_companies`（返回实体 id `bc7f08f6…`、名称 Harborview Analytics），再调 `crm_update_company` 把 industry 改为 `QA-WRITES-004031` | 工具返回 403 `approval_required`；审批行 `f3fc712b…` status=`pending`，`args_preview` 含 companyId、companyName=Harborview Analytics、fields.industry |
| B 批准 | `POST /api/internal/dsh-write-approvals/f3fc712b… {decision:approve}`（员工会话） | 200，status=`approved` |
| B 重试 | 同一参数调用 `crm_update_company` | 200 `ok:true, updatedFields:["industry"]`；审批 status=`consumed`，`consumed_at` 非空；`GET /api/customers/companies/bc7f08f6…` 返回 industry=`QA-WRITES-004031` |
| C 重放 | 再次调用完全相同的参数 | 409 `approval_consumed`；审批仍 `consumed`；无新 pending；公司值未二次变化 |

关键点：
- 审批前**没有**任何写入（A 步骤只产生 pending）。
- 执行通过既有命令总线 `customers.companies.update`；读取公司与写后校验均用 CRM 公司 API。
- 批准与执行都由员工会话完成，身份只来自 token/会话。

## 2. 拒绝链路 + 审批卡 UI

脚本：`/tmp/e2e/reject-ui-e2e.mjs`，原始输出
`evidence/write-approval/reject-ui-result.json`，截图
`evidence/write-approval/approval-card-{pending,confirm,rejected}.png`。

| 步骤 | 真实动作 | 结果 |
| --- | --- | --- |
| 提议 | 模型对 Copperleaf Design Co. 提议 industry=`QA-REJECT-004748` | 审批行 `d5815251…` pending |
| 页面 | 员工打开 `/backend/config/ai-write-approvals` | 卡片显示工具名、公司名、公司 ID、`industry: QA-REJECT-004748`、请求/过期时间、runId、批准/拒绝按钮 |
| 拒绝 | 点“拒绝”→“确认拒绝” | 成功提示；DB status=`rejected` |
| 重试 | 同一参数再次调用 | 403 `approval_rejected`（“The employee rejected this exact write.”），未写入 |

## 3. 边界与未做

- `OM_DSH_WRITES` 关闭时桥路由返回 `write_not_enabled`、MCP 不暴露写工具（单测覆盖，
  未在生产做开关演练以免二次重启）。
- 并发认领、崩溃后 `executing` 视为过期、`own` 范围拒绝均已有单测；生产只验证了
  组织范围（当前 9 家公司 `owner_user_id` 均为空，`own` 模式下该员工看不到任何公司）。
- 审批功能页需要 RBAC feature `dsh_approvals.review`。已给生产 `employee` 角色
  （role id `385aaf84…`）增量授予该 feature（`role_acls.features_json` 追加），RBAC
  缓存 TTL 5 分钟后生效；回退方式为从该数组移除该字符串。
- 审批页的“批准”按钮未在浏览器里点击（批准走同会话 API），拒绝按钮在浏览器里真实点击；
  两者走同一 `decide` 端点。
