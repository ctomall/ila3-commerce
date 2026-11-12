# customer_access：员工级客户访问授权

状态：数据模型 + 管理 API 已实现（2026-11-12）。DSH 工具范围默认仍是组织模式，
`OM_DSH_CUSTOMER_SCOPE=assigned` 时启用“本人负责 + 显式授权”。

## 1. 为什么

原工具范围只有两种：`organization`（组织内所有公司，组织隔离≠员工客户隔离）和
`own`（仅 `owner_user_id = 调用者`）。业务需要“把某个客户临时授权给某员工”而不改
归属，因此新增 `customer_access_grants`。

## 2. 数据模型（`customer_access_grants`）

| 列 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id / organization_id | uuid | 授权归属范围 |
| user_id | uuid | 被授权员工 |
| customer_entity_id | uuid | 客户/公司（`customer_entities.id`） |
| access_level | text | `view` 或 `edit` |
| granted_by | uuid | 操作人 |
| created_at / revoked_at | timestamptz | `revoked_at` 非空即撤销（软删除、保留审计） |

部分唯一索引 `(tenant, org, user, customer) where revoked_at is null`：同一员工同一客户
只有一条有效授权；重复授权走 upsert 改级别。

## 3. 范围解析

`OM_DSH_CUSTOMER_SCOPE`：

| 值 | 行为 |
| --- | --- |
| `organization`（默认） | 组织内全部公司；显式声明“不是员工客户隔离” |
| `own` | 仅 `owner_user_id = 调用者` |
| `assigned` | 本人负责 + 有效授权；`view` 只放宽读，`edit` 同时放宽写 |

授权在**每次工具调用**时从数据库重读，撤销下一次调用即生效，无缓存可失效。

## 4. 管理 API

- `GET /api/internal/customer-access?userId=<uuid>` → 该员工有效授权
- `POST /api/internal/customer-access` `{ userId, customerEntityId, accessLevel }` → upsert
- `DELETE /api/internal/customer-access/<grantId>` → 撤销（软删除）

三者都要求 CRM 会话 + RBAC feature `customer_access.manage`；tenant/organization 只来自
会话，body 不能指定。失败码：401/403 `feature_denied`/400/404 `grant_not_found`/503。

## 5. 与写工具的关系

- `crm.find_companies`：own/assigned 下 `entity` 过滤为
  `($or ownerUserId ∈ 本人  OR  id ∈ 授权)`；两者都为空时匹配空集，绝不回退组织。
- `crm.update_company`：允许条件 = 本人所有 或 `edit` 授权；`view` 授权不能写；
  越界仍返回 404（不泄露存在性）。
- 撤销/过期：`revoked_at` 后下一个工具调用即失效；已批准的写审批仍受 `canWriteToCrm`
  与绑定状态约束。

## 6. 未做

- 管理页面（当前只有 API；页面排在后续 UI 迭代）。
- 团队/角色级授权（当前是员工个人级）。
- 默认模式未改为 `assigned`：产品未决定前保持 `organization`，开关回退无需发布。
