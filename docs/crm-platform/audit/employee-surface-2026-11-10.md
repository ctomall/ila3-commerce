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

## 附带发现：授权与“浏览器可见特性”的漂移（诊断工具）

`scripts/crm-feature-payload-check.mjs`（只读）对比「角色 ACL 里的具体权限」与「导航 payload 报给浏览器的
`grantedFeatures`」，并按“该模块是否在 payload 里出现”区分两类：

| 角色 | ACL 条数 | payload 条数 | 真正异常 | 未暴露模块 |
|---|---|---|---|---|
| employee | 113 | 117 | `customers.interactions.manage` | `vector.*` |
| admin | 125 | 300 | — | `vector.*` |

- payload 会把 `x.*` 展开成具体权限，所以条数不能直接比；工具按“具体权限必须出现或被通配覆盖”比较。
- `vector.*` 属于 payload 里完全没有出现的模块 → 视为“本应用未暴露该模块”，属信息项。
- **`customers.interactions.manage` 是真异常**：角色持有、API 也放行（POST 返回 400 校验错误而非 403），
  但 payload 不报。当前 UI 没有因此隐藏按钮（已用真实员工账号核对），但任何**依赖 payload 做显隐**的控件
  都会“隐藏但接口可调”，这是一类需要上游统一的漂移。

未接入发布级门禁（当前有 1 条已知异常，接入会长期变红）；作为诊断保留，异常清零后再接门禁。
