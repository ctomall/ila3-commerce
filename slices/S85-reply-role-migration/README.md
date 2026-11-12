# S85 · 回复权限迁移（reply 默认授予 + 收回 employee 个人渠道连接）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` §1/§7（D-3、F5-01）、`rev2/D6-review-package.md` §7-S85。
> 状态：**代码与只读验证完成；生产权限未落地**（`--apply` 需单独批准，且本节不含执行记录）。

## 1. 为什么必须同批

`employee` 目前能回复，靠的是 legacy `communication_channels.connect_user_channel`（`lib/reply-permission.ts` 的兼容分支）。若只收回该 feature 而不先授予 `communications.reply`，**全公司业务员立即失去回复能力**；若只授予新 feature 而不收回，D-3「个人渠道仅主管以上」不成立。所以两件事在一个事务里做，并带后置校验。

## 2. 改动

| 文件 | 作用 |
| --- | --- |
| `src/modules/communications/setup.ts`（新增） | 新租户 seed 时给 superadmin/admin/manager/employee 授予 `communications.reply` |
| `src/modules/communications/lib/reply-role-plan.ts`（新增） | 纯函数：按当前 feature 生成 grant/revoke 计划（幂等）+ 后置不变量校验 |
| `scripts/crm-reply-role-migration.mjs`（新增） | 存量租户迁移：默认只读 `--check`；`--apply --tenant <id> --approval "<who>"` + `ILA3_ALLOW_ROLE_MIGRATION=1` 才写；单事务内 update → 校验 → commit，失败即回滚；写审计记录（before/after + `rollbackSql`） |
| `__tests__/reply-role-plan.test.ts`（新增） | 4 条计划语义 + 4 条校验不变量 |
| `__tests__/reply-role-migration-script.test.ts`（新增） | 脚本与 app 的 feature id/角色表防漂移；钉住“默认只读 + 双重门禁 + 单事务” |

未改动：`reply-permission.ts` 的 legacy 兼容分支保留（admin/manager 仍持有 connect，兼容期不破坏），收件箱读取仍是 `communication_channels.view`。

## 3. 证据（本机实测）

```
$ node scripts/crm-reply-role-migration.mjs --check
mode: check
tenant f27fa168-796c-4532-b9a4-1491a2e8c65e
  superadmin grant=[communications.reply] revoke=[]
  admin      grant=[communications.reply] revoke=[]
  employee   grant=[communications.reply] revoke=[communication_channels.connect_user_channel]
pendingTenants: 1   exit=0   （未修改任何权限）
```

- `npx jest src/modules/communications` → **42 passed / 3 skipped（realdb 需 P6_REALDB_URL）/ 239 tests passed**。
- `yarn generate` → setup 已注册（`.mercato/generated/modules.app.generated.ts:567`）。
- `yarn typecheck` → exit 0（无输出）。

## 4. 上线与回退

1. 备份后执行（生产单租户，需你批准）：`ILA3_ALLOW_ROLE_MIGRATION=1 node scripts/crm-reply-role-migration.mjs --apply --tenant f27fa168-796c-4532-b9a4-1491a2e8c65e --approval "<批准人>"`。
2. 记录写入 `docs/crm-platform/audit/reply-role-migration-<ts>.json`，含 `rollbackSql`。
3. `RbacService` 缓存 5 分钟；要立即生效重启 app 单元。
4. 回退：执行记录里的 `rollbackSql`（恢复 employee 的 connect、移除新增 reply），再重启或等缓存过期。

## 5. 已知限制（不隐藏）

- **新租户仍会被装好的 `communication_channels` 模块 seed 出 employee 的 `connect_user_channel`**；应用侧 setup 只能加不能减。因此 `mercato init` 之后必须再跑一次本脚本（`--check` 可先看计划）。这条已写入 D1 §7 的落地说明；若要在初始化流程里自动化，需要框架提供“setup 阶段可回收 feature”的官方途径，属后续项，不在本片伪造。
- 生产租户**没有 `manager` 角色**（只有 superadmin/admin/employee），所以当前“主管”能力等同 `admin`；若业务要独立主管角色，那是组织配置，不是本片代码能造出来的。
- 权限数据本身**未在本片落地**：这一步等你批准执行（它是生产授权变更）。
