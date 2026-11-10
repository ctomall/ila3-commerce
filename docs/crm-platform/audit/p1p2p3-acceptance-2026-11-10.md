# P1/P2/P3 阶段验收包（2026-11-10，运行 6b71b9a4）

> 只记录**已上线并可复核**的内容；演示/未完成项在文末单列。

## 运行事实

| 项 | 值 |
|---|---|
| 运行 commit | `6b71b9a4`（ci-artifact，run 42749218494） |
| 进程/目录 | pid 815499，`/home/pro/releases/mercato/6b71b9a4…`（`/proc/<pid>/cwd`） |
| HTTP | 本地 `/login` 200、`/backend` 307；03:33 起 0 条 error |
| 发布记录 | 03:32:45 `已部署 · 自动 · 6b71b9a4`，耗时 3 分 12 秒 |

## P1 菜单：普通业务员可见的五场景

| 门禁/证据 | 结果 |
|---|---|
| `crm-nav-public-host-check --role employee/admin` | 均 200、5 场景、无自取超时 |
| `crm-nav-scene-check --strict` | admin 5/128/unknown 0；employee 5/66/unknown 0；`all invariants hold` |
| 侧栏截图 | `p1-five-scene-rail-employee-2026-11-10.png` |
| 业务页截图 | `p1-business-scene-employee-2026-11-10.png`（7 分类 / 39 项） |

## P2 客户闭环：列表→详情→跟进/草稿→消息

| 步骤 | 证据 |
|---|---|
| 客户列表 | `p2-customers-list-2026-11-10.png` |
| 客户详情 | `p2-customer-detail-2026-11-10.png` |
| 记录跟进（备注） | `p2-followup-history-2026-11-10.png`；行 `customer_interactions c07f9d0e…` 02:35:03 |
| 生成草稿（未外发） | `p2-draft-compose-2026-11-10.png`；行 `messages 097b867e…` `is_draft=t` `sent_at=NULL` 02:36:27 |
| 草稿夹列表 | `p2-drafts-visible-2026-11-10.png`（2 条草稿） |
| 草稿详情 | `p2-draft-detail-2026-11-10.png`（作者、关联客户） |
| 文案中文 | `p2-message-detail-zh-2026-11-10.png`（返回消息列表/会话操作/关联对象） |

## P3 发布：同 SHA 测试/构建/健康/回滚 + 自动安装

| 项 | 证据 |
|---|---|
| CI 门禁 | 每次切换前 `ci-gate` 必须命中该 SHA 的成功测试运行；未命中即 `refused/ci-gate-denied`（当日多次） |
| 同 SHA 不重启 | `result=already-current`（多次；`ActiveEnterTimestamp` 不变） |
| artifact 回滚演练 | `artifact-rollback-drill` passed（切换后注入失败 → 回滚到旧版并复验） |
| 迁移预检 | `migration-preflight` 拒绝破坏性迁移（`migration-refusal-drill` passed） |
| 备份恢复 | `crm-restore-drill`（`crm-verify-all --full` 门禁；结构+内容比对，比对器先自证会红） |
| 升级页（superadmin） | `p3-update-versions-2026-11-10.png`、`p3-update-records-2026-11-10.png` |

## 未完成 / 待决策（不折算为已完成）

1. **employee 角色技术类权限**：仍持有 `auth.users.list` 等，管理中心可见 12 项入口（含用户名单）——等你决策是否收紧。
2. **systemd 单元 apply**：仓库版已把 `TimeoutStopSec` 30s→90s，但写 `/etc` 需你批准；当前仍 30s。
3. **公网 URL 同角色截图**：本机到 Cloudflare 时通时断，截图为 loopback（同一 release）。
4. **M5–M7（获客/触达/Bot）**：阻塞于 leadgen 迁移批准与真实外发授权。
5. 消息详情里的公司状态值 `active` 属数据枚举，非文案缺口。
