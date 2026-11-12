# S89 · 会话 ↔ 客户关联（复用 customers，不重建）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F4-01、D6 §7-S89。
> 状态：**后端 + 会话头部面板 + 测试完成**；无新表、无迁移、无生产数据变更。

## 1. 复用点（先确认再写）

- 关联字段就是 hub 自己的 `external_conversations.contact_person_id`（入站匹配器已在用），不是新表、不是新客户库；
- 候选来自装好的 `customers` 实体（`display_name` / `primary_email` / `primary_phone`），按调用方 tenant + organization 取。

## 2. 接口

| 方法 | 路径 | 权限 | 行为 |
| --- | --- | --- | --- |
| GET | `/api/communications/me/threads/[id]/customer?q=` | `communication_channels.view` **且** `customers.people.view` | 返回已关联客户 + 最多 20 个候选；`q` 少于 2 字符不查询 |
| PUT | 同上 | `communication_channels.view` **且** `customers.people.manage` | `{customerId: uuid}` 关联 / `{customerId: null}` 解除 |

- 先校验会话与渠道归属（沿用消息路由同一套规则），他人个人渠道一律 404；
- 不在本组织范围的客户也返回 404（不泄露存在性）；
- 重复关联同一客户是 no-op，不写库；
- 候选查询对 `%`/`_` 做转义，避免用户输入当通配符。

## 3. UI

会话头部新增关联面板（`CustomerLink.tsx`）：显示已关联客户、搜索候选、关联/解除；403 时明确提示缺哪个权限，而不是显示空列表。变更成功后 `router.refresh()` 让服务端渲染的头部同步。

## 4. 测试（`__tests__/customer-link.test.ts`，10 条）

GET：已关联 + 短查询不搜索；候选落在 tenant/org 范围内且通配符被转义；他人个人渠道 404；匿名 401。
PUT：关联写库；已关联不写；null 解除；越界客户 404 且不写；非 uuid 422 且不开容器；匿名 401。

## 5. 证据

- `npx jest src/modules/communications` → **48 passed / 3 skipped（realdb）/ 286 tests**。
- `yarn generate` exit 0（新路由已注册）；`yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 6. 明确边界（未做）

- **不支持在会话内新建客户**：只在候选里选。新建走 customers 模块（避免第二套客户库），设计里的“新建”入口属二期 UI。
- 关联字段是单列覆盖写，hub 实体没有乐观锁版本；并发同时改以最后写入为准（此处可接受，已注明）。
- 未写审计（F5-02 二期）；候选未做按号码/邮箱的“精确优先”排序，先按姓名排序。
