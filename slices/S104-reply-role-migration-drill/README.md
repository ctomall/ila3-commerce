# S104 · S85 权限迁移的隔离库演练：apply → 校验 → 幂等 → 回退（含失败路径）

> 背景：S85 的 `--apply` 还没在生产执行（等你批准）。它是本任务**唯一**会改生产授权数据的动作，所以先在一次性 PostgreSQL 上把整条契约跑一遍，再把演练固化成可复跑的 harness 套件。
> 状态：**完成**；隔离库演练与自动化套件都通过。生产 `--apply` 仍**未执行**。

## 1. 演练做了什么（2026-11-13，一次性 PG 18，端口 55437）

脚本只从 release `.env` 读库连接，所以演练把 `ILA3_RELEASE_ROOT` 指向临时目录里的假 release，库是临时集群；种子数据镜像生产形态：`superadmin`/`admin` 有 reply + legacy，`employee` 只有 legacy（生产没有 `manager` 角色，这里用另外的 tenant 覆盖该分支）。

| 步骤 | 结果 |
| --- | --- |
| `--check` | `mode:"check"`，tenant 的计划：`employee` grant `communications.reply`、revoke `communication_channels.connect_user_channel`；`superadmin`/`admin` unchanged |
| `--apply` 不设 `ILA3_ALLOW_ROLE_MIGRATION=1` | **exit 2**，`refusing: --apply needs ILA3_ALLOW_ROLE_MIGRATION=1…`，库无变化 |
| `--apply` 指向不存在的 tenant | **exit 2**，`refusing: tenant … has no role_acls rows`，库无变化 |
| `--apply`（drill tenant） | **exit 0**，`changed:1`，审计记录含 `rollbackSql`；状态：`employee=["communications.reply"]`，admin/superadmin 保留 legacy + reply |
| 再跑一次 `--apply` | **exit 0**，`changed:0`（幂等） |
| 执行审计记录里的 `rollbackSql` | 状态回到演练前：`employee=["communication_channels.connect_user_channel"]` |
| **失败路径**：另一个 tenant 的 `manager` 角色缺 legacy | **exit 4**，`verify failed: a supervisor role lost communication_channels.connect_user_channel`；`employee` 与 `manager` 都保持原样（整批回滚），且**没有**写审计记录 |

失败路径证明的是：事务内的 post-condition `RAISE` 真的会把同批的 employee 更新一起回滚，而不是“改了 employee、校验失败、留下半截”。

## 2. 固化成 harness（可复跑）

- `src/modules/communications/__tests__/realdb/reply-role-migration-runner.mts`：在 `P6_REALDB_URL` 指向的一次性库里建 `roles`/`role_acls`、种两个 tenant、以子进程跑真实迁移脚本，断言上面 6 个场景。
- `src/modules/communications/__tests__/reply-role-migration-realdb.test.ts`：jest 包装，断言 runner 的 PASS 行；无 `P6_REALDB_URL` 时跳过。
- `scripts/realdb-suite.mjs` 增加第 6 套 `reply-role-migration`。
- `scripts/crm-reply-role-migration.mjs` 增加 `ILA3_AUDIT_DIR` 覆盖（演练把审计写进临时目录；生产默认路径不变）。

```bash
node scripts/realdb-suite.mjs --only reply-role-migration   # PASS
yarn realdb:check                                           # 6 套全 PASS
```

## 3. 证据

- 全套门禁（2026-11-13）：`yarn typecheck` **exit 0**；`yarn realdb:check` **6/6 PASS**（reconciliation / customer-link / internal-notes / internal-notes-write / send-ledger / reply-role-migration）；改动文件 eslint exit 0。
- 手动演练审计记录（tenant 是 drill UUID，不是生产 tenant）：`docs/crm-platform/audit/reply-role-migration-DRILL-2026-11-13.json`
- 日志：`/tmp/s104-drill.log`（正向）、`/tmp/s104-drill-fail.log`（失败路径）、`/tmp/s104-gates.log`（门禁）

## 4. 这个演练**不能**证明什么

- 生产实际行/角色集（生产是 `superadmin/admin/employee`，没有 `manager`）——真执行前仍建议先跑只读 `--check` 对照。
- `RbacService` 的 5 分钟授权缓存行为：脚本提示执行后重启 app 单元立即生效，本演练没有跑应用。
- 生产 `--apply` 本身：仍需你批准（命令与回退见 HANDOFF ①）。
