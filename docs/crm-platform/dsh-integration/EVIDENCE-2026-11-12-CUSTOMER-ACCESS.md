# customer_access 范围 E2E（D 阶段，2026-11-12）

运行 release：`e4da37f0`。原始输出：`evidence/2026-11-12/assigned-scope-result.json`。
每次范围切换都重启生产服务并等待 `/api/healthz` 200。测试后已恢复
`OM_DSH_CUSTOMER_SCOPE=organization` 与公司原始 industry。

## 流程与结果

| 步骤 | 范围 | 动作 | 结果 |
| --- | --- | --- | --- |
| A | `own` | 员工请求 `crm_find_companies`（limit 5） | 0 家公司；工具 scope 回显 `mode=own` |
| B | — | 管理员 `POST /api/internal/customer-access` 给该员工 `edit` 授权 Copperleaf Design（`f67258f2…`） | 200，grant id 返回 |
| C1 | `assigned` | 同一员工再次查询 | 只返回 1 家：Copperleaf Design |
| C2 | `assigned` | 提议把 industry 改为 `QA-GRANT-<ts>` | 403 `approval_required`，生成待审批 |
| C3 | `assigned` | 员工批准并原样重试 | 200 `ok:true`；CRM 公司 API 读回新值 |
| C4 | — | 通过 CRM 正常编辑接口恢复 industry=Interior Design | 200，读回一致 |
| D | `assigned` | 管理员 `DELETE /api/internal/customer-access/<grantId>` | 200；下一次查询 0 家公司 |
| E | `organization` | 恢复默认范围后查询 | 3 家公司，Copperleaf industry 已复原 |

结论：
- `own` 下“无归属 = 什么都看不到”，不会回退组织。
- `assigned` 下读=本人负责 ∪ 有效授权；`edit` 授权才能写，且仍受人工审批约束。
- 撤销在**下一次工具调用**即生效（无缓存）。
- 组织模式行为与改造前一致。

## 未做

- 授权管理页面（当前仅 API）。
- 默认范围未切换到 `assigned`：产品未决定，保持 `organization`。
