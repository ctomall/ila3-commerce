# 备份恢复后能否“开起来”：restore-boot 演练（2026-11-10）

## 为什么还要一个演练

`crm-restore-drill` 证明备份能恢复出**同样的结构与数据**；它不证明恢复出来的库能让应用**真正启动并服务**。
本轮补上这一层：

```bash
node scripts/crm-restore-boot-drill.mjs          # 自动挑空闲端口；默认演练后删库
node scripts/crm-restore-boot-drill.mjs --keep   # 保留临时库排查
```

流程：取最新 dump → `createdb om_restore_boot_*` → `pg_restore` → **给应用角色授权** →
用**当前 release 的 next server** 连这个库在空闲端口启动 → `/login` 探活 → 用真实账号登录 →
`GET /api/customers/companies` 读到数据 → 杀进程、删库（`finally`）。

安全护栏：库名必须 `om_restore_boot_` 前缀且不等于源库；不碰 3000 端口；只杀自己拉起的子进程；默认删库。

## 结果（passed=true）

| 步骤 | 结果 |
|---|---|
| 恢复 `open_mercato-20261109-192133.dump`（11.8 MB） | `pg_restore` exit 0 |
| 授权给应用角色 | 成功 |
| 启动应用（当前 release `70176570` 的 Next server） | `Ready in 248ms`，`/login` 200 |
| 登录（employee 账号） | 200 + cookie |
| 读客户列表 | `200`，`items: 3`（与备份时点一致） |
| 清理 | 临时库已删除 |

## 演练过程中真实踩到的两个坑（已写进脚本）

1. **连接串没密码**：手写的 `postgresql://…@127.0.0.1/db` 会触发
   `SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`，登录 500。脚本改为复用 release `.env`
   的 `DATABASE_URL`，只替换库名。
2. **恢复出来的表属于 postgres**：应用角色访问 `users` 直接
   `permission denied for table users`。脚本在恢复后显式
   `grant usage on schema public / all tables / all sequences` 给应用角色。

这两条正是运维做恢复时会卡住的地方，现在被脚本固化下来。

## 门禁

已接入 `crm-verify-all` 的 `--full`：`restore-boot-drill`（约 11s）。
