# 普通业务员能读到什么：只读面清点（2026-11-10）

运行：`6b71b9a4`。方法：`scripts/crm-employee-surface-audit.mjs`（只读 GET，真实登录，
凭据取自 `~/.ila3-admin-credentials` 且不打印），再对每个 200 复核**响应内容**而不只看状态码。

## 结论

| 端点 | employee | admin | 响应内容 | 判定 |
|---|---|---|---|---|
| `GET /api/auth/users` | 200 | 200 | 3 个账号（邮箱、角色） | **需你决策**（employee 持有 `auth.users.list`） |
| `GET /api/integrations` | 200 | 200 | 14 条集成 | **需你决策**（`integrations.view`） |
| `GET /api/webhooks` | 200 | 200 | 0 条 | 需你决策（`webhooks.view`，当前无数据） |
| `GET /api/auth/roles` | 403 | 200 | — | 正确 |
| `GET /api/directory/organizations` | 403 | 200 | — | 正确 |
| `GET /api/audit_logs/...?scope=tenant&canViewTenant=true` | 200 | 200 | `canViewTenant:false`，14 条**均为本人**（actor 7a176d46…） | 正确（服务端按 self 收窄） |
| `GET /api/system_update/status` | 200 | 200 | 无 `deployment`/`versions` 字段（minimal payload） | 正确（页面与详情仅 superadmin） |
| `GET /api/docs/openapi` | 200 | 200 | OpenAPI 文档 | 可接受（接口文档） |
| `GET /api/communication_channels/channels` | 200 | 200 | 渠道列表 | 业务数据，保留 |

## 两个“看起来像漏洞、复核后不成立”的项

1. **审计日志租户范围**：带 `canViewTenant=true` 请求仍返回 `canViewTenant:false`，14 条记录全部是
   本人动作（另一账号 employee@acme.com），没有跨人泄漏。
2. **发布状态**：employee 拿到 200，但 payload 只有 `enabled/canManage/unitActive/state/repo/log`，
   没有 `deployment` 与 `versions`；superadmin 才有。页面与详情都按 superadmin 收窄。

## 若要收紧（等你确认后执行）

从 employee 角色撤销 `auth.users.list`、`integrations.view`、`webhooks.view`（保留 `customers.*`、业务读取）。
影响面：管理中心会少 3 个入口（用户/集成/Webhook），这些页面本身由 feature 控制会自动 403；
需重跑 `crm-nav-scene-check` 确认 unknown=0，并补一张收紧前后的管理中心截图。

复跑：

```bash
node scripts/crm-employee-surface-audit.mjs --out /tmp/employee-surface.json
```

## 收紧工具（只读检查跑过，等你一句话）

`scripts/crm-employee-role-tighten.mjs`：

```bash
node scripts/crm-employee-role-tighten.mjs --check          # 只读：113 → 110，列出将撤销的 3 项
node scripts/crm-employee-role-tighten.mjs --apply --approval "用户姓名/工单"   # 需 ILA3_ALLOW_ROLE_TIGHTEN=1
```

`--apply` 双重闸门（环境变量 + 显式 approval 文案），执行后写
`docs/crm-platform/audit/employee-role-tighten.json` 记录撤销前后数量与批准人；
`RbacService` 缓存 5 分钟或重启应用立即生效。

本轮只跑了 `--check`，生产权限未改动。
