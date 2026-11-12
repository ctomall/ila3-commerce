# 第 3 名员工 E2E（B/C 阶段，2026-11-12）

运行 release：`d7437b5`（隔离改造前）与 `61435f5`（隔离后）同一套流程。
原始输出：`evidence/2026-11-12/third-employee-result.json`。

## 结果

| 步骤 | 真实动作 | 结果 |
| --- | --- | --- |
| 创建 | 管理员 `POST /api/auth/users` `{email: qa-third-…@example.test, organizationId, roles:['employee'], password}` | 201，返回 `id=9cb3cf6c-7bdd-42c1-aa93-ce192f576187` |
| 首次登录 | 新员工 `POST /api/auth/login` | 200；JWT `sub` 与创建 id 一致 |
| 自动绑定 | 登录后轮询 `dsh_assistant_bindings` | 行 `d6b7035b-e208-401c-9bef-c2c7b3859ae4`，status=`active`（登录订阅器创建成功） |
| 真实对话 | `POST /api/ai_assistant/chat`，要求调用 `crm_find_companies` | 200，3.9 s，模型回答 “Copperleaf Design”；`dsh_runs` 该员工记录 1 条 |
| 审批隔离 | 新员工 `GET /api/internal/dsh-write-approvals` | 200，`approvals=[]`（看不到其他员工的审批） |
| 目录隔离 | 计算 `sha256(tenant\0org\0user)[:32]` 定位 home | 新员工 `6ec8f10b…` 与验收员工 `91b8e5d0…` 不同；均为 0700、归各自 `dsh-<hash>` 用户（隔离改造后） |
| 撤销 | 管理员 `POST /api/internal/dsh-bindings/revoke` | 200，`revokedRuns:0` |
| 停用 | 管理员 `DELETE /api/auth/users?id=…` | 200 |
| 停用后登录 | 同邮箱/密码登录 | 401（无法再进入） |
| 绑定终态 | 查询 binding | status=`revoked` |

## 边界

- 停用是软删除（应用层），绑定的 Unix 用户与 `/srv/dsh/homes/<hash>` 保留用于审计；
  物理删除属“重要删除”，未执行。
- 该员工没有生产客户归属，`own` 范围下看不到任何公司；隔离证据来自目录/用户与
  API 范围，不是客户数据本身。
- 登录订阅器在“创建后首次登录”路径上验证；不存在“只创建不登录”的绑定。
