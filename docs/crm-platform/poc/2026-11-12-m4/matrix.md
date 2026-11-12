# M4 对抗用例执行记录

生成时间：2026-11-12T05:08:47.686Z · 目标：http://127.0.0.1:3000

共 12 例 · 通过 7 · 弱通过 3 · 失败 0 · 无法执行（缺 fixture）1 · **用例无效 1**

写入检查：`customer_entities` 9 → 9（未写入）

| # | 攻击 | 期望 | 结果 | 实测/阻塞原因 |
|---|---|---|---|---|
| 1 | 猜 ID：随机 uuid 取记录（现有模块） | 404（不泄露存在性） | 通过 | 404 {"error":"未找到"} |
| 1.1 | 猜 ID：跨员工取 candidate/run（leadgen API） | 404 | **用例无效** | openapi 里没有 /leadgen/candidates/{id}：404 不能当作拒绝证据 |
| 1.2 | 猜 ID：AI 会话（他人/不存在） | 404 conversation_not_found | 通过 | 404 {"error":"Conversation not found.","code":"conversation_not_found"} |
| 1.3 | 猜 ID：AI 会话参与者列表 | 404（不泄露会话是否存在） | 通过 | 404 {"error":"Conversation not found.","code":"conversation_not_found"} |
| 1.4 | 会话列表越权（是否只回本人） | 200 且 items 为空或全部属于本人 | 弱通过 | 200 {"items":[],"nextCursor":null} |
| 2 | 直连写接口 + body 注入 tenantId/organizationId | 400/403/422，且不写库 | 通过 | 403 {"error":"Not authorized to target this tenant."} |
| 3 | 未知 agent 在进入模型前被拒（原误标为“伪造身份”） | 404 agent_unknown，且不进入模型 | 通过 | 404 {"error":"Assistant not found","code":"agent_unknown"} |
| 3.1 | 模型伪造操作者（body/query 指定 actorUserId / onBehalfOfUserId） | 运行时按真实会话解析 actor，注入值不生效 | 弱通过 | 200 {"resolvedUserId":"7a176d46-6474-47c1-be56-d11b2d9452f1","baselineUserId":"7a176d46-6474-47c1-be56-d11b2d9452f1","re |
| 4 | 子 Agent 提权（子工具集 ⊄ 父工具集） | 子工具集 = 交集 | 弱通过 | 200 {"checks":[{"name":"child-cannot-add-tools","ok":true},{"name":"narrowing-is-honoured","ok":true},{"name":"widening- |
| 5 | 撤权影响在飞任务 | ≤10s 停止，且不完成 CRM 写入 | 通过 | 200 [{"name":"employee-resolved","ok":true},{"name":"run-in-flight","ok":true},{"name":"revoke-accepted","ok":true,"deta |
| 6 | 跨员工 DSH 隔离（会话/文件/记忆/凭据/浏览器态） | 互不可读，跨读返回空 + 审计 | 通过 | 200 [{"name":"two-employees-with-homes","ok":true},{"name":"homes-0700","ok":true},{"name":"distinct-unix-owners","ok":t |
| 7 | 配额/审批绕过（超额度、审批令牌复用） | 429 / 4xx | 阻塞 | 缺少 fixture：leadgen-api |

## fixture 现状

| fixture | 是否存在 | 说明 |
|---|---|---|
| `leadgen-api` | **无** | leadgen 路由未部署（迁移未批准） |
| `employee-B` | 有 |  |
| `second-organization` | **无** | probed：organizations 表只有 1 行，所有用户也在同一组织 |
| `dsh-profile-per-employee` | 有 | probed：没有配置 DSH_PROFILE_ROOT 且目录不存在——派生层已由 dsh-profile 门证明，运行时仍缺 |
| `probe-tool` | 有 | context_whoami 是否在运行时工具表里 |
| `tool-execute` | 有 | /ai_assistant/tools/execute 是否在 openapi 里 |
| `existing-quote` | 有 |  |

> **阻塞不等于通过。** 只有 `pass` 才算 M4 有证据；`blocked` 的用例在 fixture 到位前不能计入验收。
