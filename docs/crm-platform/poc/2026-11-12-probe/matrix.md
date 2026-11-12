# M4 安全探针 · 基线

生成时间：2026-11-12T18:16:47.063Z · 目标：http://127.0.0.1:3000

用例 14 · 符合预期 14 · 需要复核 0

写入检查：5 张表前后行数一致 → **未写入**

| 角色 | 方法 | 路径 | 期望 | 实际 | 判定 |
|---|---|---|---|---|---|
| anon | GET | `/api/customers/companies` | 401 | 401 | 符合 |
| employee | GET | `/api/customers/companies` | 200 | 200 | 符合 |
| employee | GET | `/api/sales/quotes` | 200 | 200 | 符合 |
| employee | GET | `/api/audit_logs/audit-logs/actions?canViewTenant=true&scope=tenant` | 200 | 200 | 符合 |
| admin | GET | `/api/audit_logs/audit-logs/actions` | 200|403 | 200 | 符合 |
| employee | GET | `/api/customers/companies?tenantId=00000000-0000-0000-0000-000000000000` | 403 | 403 | 符合 |
| employee | GET | `/api/customers/companies?organizationId=00000000-0000-0000-0000-000000000000` | 403|200 | 200 | 符合 |
| employee | POST | `/api/customers/companies` | 400|403|422 | 400 | 符合 |
| employee | POST | `/api/customers/companies` | 400|403|422 | 403 | 符合 |
| employee | DELETE | `/api/customers/companies/00000000-0000-0000-0000-000000000000` | 403|404 | 404 | 符合 |
| employee | POST | `/api/ai_assistant/ai/chat?agent=probe.does_not_exist` | 404 | 404 | 符合 |
| anon | POST | `/api/ai_assistant/ai/chat?agent=probe.does_not_exist` | 401 | 401 | 符合 |
| anon | GET | `/api/docs/openapi` | 401 | 401 | 符合 |
| employee | GET | `/api/docs/openapi` | 200 | 200 | 符合 |

## 响应片段

- `GET /api/customers/companies` (anon) → 401
  ```
  {"error":"未登录"}
  ```
- `GET /api/customers/companies` (employee) → 200
  ```
  {"items":[{"id":"b026cb18-bf9c-45c6-8b14-805eede4ff4c","display_name":"Brightside Solar","description":"Community solar developer helping multifamily buildings reduce energy costs across California.",
  ```
- `GET /api/sales/quotes` (employee) → 200
  ```
  {"items":[{"id":"ce2cba82-4834-4896-9094-46b7f081f04a","quoteNumber":"QUOTE-20261108-00008","status":null,"statusEntryId":null,"customerEntityId":null,"customerContactId":null,"billingAddressId":null,
  ```
- `GET /api/audit_logs/audit-logs/actions?canViewTenant=true&scope=tenant` (employee) → 200
  ```
  {"items":[{"id":"6bb8945a-7633-44a9-b8a9-45474b205798","commandId":"customers.companies.create","actionLabel":"创建公司","executionState":"done","actorUserId":"7a176d46-6474-47c1-be56-d11b2d9452f1","actor
  ```
- `GET /api/audit_logs/audit-logs/actions` (admin) → 200
  ```
  {"items":[{"id":"5b25f578-976a-4f99-93a5-4e7b96b837d1","commandId":"customers.companies.delete","actionLabel":"删除公司","executionState":"done","actorUserId":"77f676ed-7ab0-4245-a67a-d3b3e2d5170b","actor
  ```
- `GET /api/customers/companies?tenantId=00000000-0000-0000-0000-000000000000` (employee) → 403
  ```
  {"error":"Not authorized to target this tenant."}
  ```
- `GET /api/customers/companies?organizationId=00000000-0000-0000-0000-000000000000` (employee) → 200
  ```
  {"items":[{"id":"b026cb18-bf9c-45c6-8b14-805eede4ff4c","display_name":"Brightside Solar","description":"Community solar developer helping multifamily buildings reduce energy costs across California.",
  ```
- `POST /api/customers/companies` (employee) → 400
  ```
  {"error":"Invalid input","details":[{"expected":"string","code":"invalid_type","path":["displayName"],"message":"Invalid input: expected string, received undefined"}]}
  ```
- `POST /api/customers/companies` (employee) → 403
  ```
  {"error":"Not authorized to target this tenant."}
  ```
- `DELETE /api/customers/companies/00000000-0000-0000-0000-000000000000` (employee) → 404
  ```
  {"error":"未找到"}
  ```
- `POST /api/ai_assistant/ai/chat?agent=probe.does_not_exist` (employee) → 404
  ```
  {"error":"Assistant not found","code":"agent_unknown"}
  ```
- `POST /api/ai_assistant/ai/chat?agent=probe.does_not_exist` (anon) → 401
  ```
  {"error":"Unauthorized"}
  ```
- `GET /api/docs/openapi` (anon) → 401
  ```
  {"error":"unauthorized"}
  ```
- `GET /api/docs/openapi` (employee) → 200
  ```
  {"openapi":"3.1.0","info":{"title":"ILA3 Commerce API","version":"0.9.0","description":"为所有已启用模块自动生成的 OpenAPI 定义。"},"servers":[{"url":"https://mercato.ila3.top/api","description":"默认环境"}],"paths":{"/d
  ```

## 本探针未覆盖（原因）

- **跨组织隔离**：当前只有一个租户一个组织（`tenants` 1 行、`organizations` 1 行），没有第二个组织可作对照。要么建测试组织，要么用第二租户——两者都属数据写入，需你确认。
- **跨员工 DSH 隔离**（会话/文件/记忆/凭据/浏览器态）：需要每员工独立的 DSH 运行时；本仓库只有 CRM 侧，DSH 侧待定。
- **AI 工具越权（G2）**：探针只测「未知 agent 被拒」；真实工具的越权路径需要在 PoC 环境里注册探针工具，属实现工作。

结论：本文件是**基线**，不是通过证明。判定为「需复核」的用例，就是 M4 之前要修掉的清单。
