# 验收记录：普通业务员在正式入口完成 P2 闭环（2026-11-09）

## 账号与环境
- 验收账号：`acceptance-employee@example.test`，仅 `employee` 角色，挂在既有组织 **Acme Corp**（`328bc848…`，租户 `f27fa168…`），不绑定真实员工。
- 创建方式：`yarn mercato auth add-user --email … --organizationId 328bc848… --roles employee`（应用自带 CLI，非改种子密码）。
- 密码：随机强口令，存 `/home/pro/.local/state/ila3-acceptance/acceptance.json`（0600），不写入仓库；验收结束可按需删除该用户。
- 生产版本：**1837cb4**（ci-artifact，CI run 42651107276），`/home/pro/releases/mercato/1837cb4…`。
- 视口：800×513（本机 X 显示上限）。

## 复现的完整动作（同角色、同视口）
| 步骤 | 结果 | 证据 |
|---|---|---|
| 登录 | 进入 `/backend`，工作台显示“客户任务/新增客户”卡片，含真实客户 | `p1-employee-workbench-2026-11-09.png` |
| 菜单 | 侧栏四区：工作台 / 销售业务 / 资料中心 / 管理后台（普通业务员可见） | `p1-employee-nav-2026-11-09.png` |
| 菜单展开 | 销售业务 → 公司 / 商机 / 客户相关任务 / 日历 / 联系人 | `p1-employee-nav-sales-2026-11-09.png` |
| 客户列表 | `/backend/customers/companies`，3 家公司、状态与生命周期列 | `p2-customers-list-2026-11-09.png` |
| 客户详情 | Copperleaf Design Co.：进行中商机 US$145,000、活动、联系人/商机/活动日志标签页 | `p2-customer-detail-2026-11-09.png` |
| 生成草稿 | 详情→发送消息→填标题/正文→**保存草稿**（未发送） | `p2-draft-compose-2026-11-09.png`、`p2-draft-saved-2026-11-09.png` |
| 记录跟进 | 活动日志→新增→备注→标题→**保存备注** → 写入成功并出现在活动历史 | `p2-followup-dialog-2026-11-09.png`、`p2-followup-saved-2026-11-09.png` |

数据库核对（只读查询）：
- `messages`：`513087d3…`，`is_draft=t`，`sent_at=NULL`，`sender_user_id=77f676ed…`（验收账号），创建于 22:41:09 —— 草稿真实落库、未外发。
- `customer_interactions`：`436b9e7c…`，`interaction_type=note`，`entity_id=f67258f2…`（Copperleaf），`author_user_id=77f676ed…`，创建于 23:21:08。
- 页面活动历史：`备注 1`、总计 3 条，条目标题“跟进：客户确认设计交付节点（电话）”，作者显示验收账号。

## 过程中发现并处理的问题
1. **普通业务员保存跟进被 403 且静默**：`POST /api/customers/interactions` 需要 `customers.interactions.manage`，employee 角色当时只有 `.view`；弹窗不报错、只停止响应。
   - 处理：经用户批准，给 `role_acls`（employee，tenant `f27fa168…`）追加该 feature（112 → 113 项），随后重启应用清 ACL 缓存（`RbacService` 缓存 5 分钟）；
   - 可回滚：从该角色 `features_json` 移除同一 id 即可，或用角色编辑页保存一次。
2. **消息“文件夹”切换不生效**（上游 UI）：在 `/backend/messages` 选择 Drafts 后，列表请求仍是 `folder=inbox`；而 `GET /api/messages?folder=drafts` 能返回那条草稿。草稿因此“存了但看不到”。
3. **文件夹标签未翻译**：`Drafts` 与 收件箱/已发送/已归档 并列，属 i18n 缺口。
4. 20:12–20:14 有外部会话用 `yarn mercato auth setup --orgName 同频测试 …` 在共享机器上跑过两次并触发应用 SIGTERM/重启（20:13:27）；事后 `auth list-orgs` 只有 Acme Corp，该次 setup 未留下组织。非本会话操作，记录为共享环境事实。

## 结论
P2 的“客户列表→详情→记录跟进 / 生成草稿”作为**普通业务员**在正式入口已经跑通并有截图与数据库证据；
草稿仍未外发（`sent_at` 为空）。消息列表在 UI 上看不到草稿是上游缺陷，不影响“草稿已生成”的事实。

## 追加（2026-11-10）：字典裁剪导致的“键名外露”已修

后端路由按区域裁剪 i18n 字典（`src/lib/i18n/auth-dict.ts` 的 `AREA_NAMESPACES`），
`/backend/customers/*` 当时只保留 `customers`+`sales`，于是客户详情里的
`documents.relatedDocuments.*`、`workflows.pendingWork.*`、`warranty_claims.customerTab.title`、
`audit_logs.version_history.*` 直接显示键名；`/backend/messages` 没保留
`communication_channels`，表头显示 `communication_channels.columns.provider`。

改动（`0055416`）：给 customers 补 `documents/workflows/warranty_claims/audit_logs`，
给 messages 补 `communication_channels`，并补上 zh.json 里缺的 4 个标签。

上线后实测（生产 `d9ac12d9`，截图 `p2-customer-detail-i18n-2026-11-10.png`、
`p2-messages-i18n-2026-11-10.png`）：客户详情页 `key 名残留 = 0`，“保修/文件”为中文；
消息页表头显示“服务商”。
