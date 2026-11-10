# 备份恢复演练（2026-11-10）

## 背景
`ila3-db-backup.timer` 每天 19:23 用 `pg_dump -Fc` 备份 `open_mercato` 到
`/storage/backup/postgres/`（保留 7 天），但此前**没有任何一次恢复验证**——只有“备份文件在”，
不等于“能恢复”。

## 做法
新增 `scripts/crm-backup-restore-drill.mjs`：

1. 取最新 dump，`pg_restore -l` 验证可读；
2. 记录生产库各表行数（只读，postgres 超级用户）；
3. `createdb om_drill_restore_<时间戳>` → `pg_restore --no-owner --no-privileges`；
4. 对比行数：备份行数必须 **≤** 生产（备份之后生产仍在写入），核心表必须非空；
5. 记录生产库行数（恢复前后必须一致，证明没写生产）；
6. `finally` 里 `dropdb`（`--keep` 可保留）。

安全护栏：临时库名必须以 `om_drill_` 开头且不等于源库；源库只读计数；临时库默认删除。

## 结果（passed=true）

| 项 | 值 |
|---|---|
| 备份文件 | `open_mercato-20261109-192133.dump`，11,843,772 B，6.9 小时前 |
| 恢复 | `pg_restore` 成功，临时库 `om_drill_restore_…` 创建后删除 |
| 行数（备份 / 生产） | users 3/4、roles 5/5、role_acls 5/5、messages 4/5、customer_interactions 0/1、customer_activities 11/11 |
| 生产是否被改动 | 否（恢复前后计数一致） |

差异是**预期的时点语义**：备份在 19:21，验收账号（22:37）、草稿（22:41）、跟进备注（23:21）
都发生在备份之后，所以恢复库里没有它们。

## 复跑

```bash
cd /home/pro/apps/mercato && node scripts/crm-backup-restore-drill.mjs   # 默认删除临时库
node scripts/crm-backup-restore-drill.mjs --keep                          # 保留临时库供检查
```
