# M5 获客候选审核 · 评审包（2026-11-12）

状态：**评审分支完成，未合入 main，未对生产应用迁移**。生产 release 与 main 不受影响。
分支：`feat/leadgen-m5`（基于 `9072c33`，合并 `feat/leadgen-schema-final` 后加 M5 实现）。

## 1. 数据模型

两片已评审 schema（13 + 35 条语句，16 表）**再加一张**决策台账：

| 迁移 | 内容 |
| --- | --- |
| `Migration20261108192028_leadgen` | 候选/证据/公司认领/调研 run/验证（13 条） |
| `Migration20261108194144_leadgen` | 额度/草稿/审批/发送/抑制/bot 绑定等（35 条，4 条手写部分唯一索引） |
| `Migration20261112060000_leadgen_decisions` | `leadgen_candidate_decisions`：`decision_key` 幂等 + 审核人/理由/合并目标审计（2 条） |
| `Migration20261112063000_leadgen_evidence_fields` | `leadgen_candidate_evidence.fields jsonb`：验证器需要结构化字段，只有 excerpt 无法复现判决（1 条） |

为什么加第三张：合同要求 `decision_key` 幂等与“谁审的”审计，原 schema 没有承载处；
不加就会在接口层伪造幂等。

## 2. 隔离库演练（已通过）

`CRM_MIGRATION_DRILL_DEFAULT_REF=feat/leadgen-m5 node scripts/crm-migration-drill-gate.mjs`

- 克隆生产 schema（324 表）到 `om_drill_leadgen`，应用 3 片迁移 → 17 张 leadgen 表，与 ORM snapshot 完全一致；
- 4 条部分唯一索引谓词与文档一致；非 leadgen schema 摘要不变；
- down 全回滚 → 0 张 leadgen 表残留；reapply 复现同一 schema；
- `prod.guard`：生产表数 324 未变，非 leadgen schema 摘要不变。

报告：`docs/crm-platform/verify/migration-drill-2026-11-12T05-26-15.md`。

## 3. M5 代码（分支内）

| 能力 | 文件 | 幂等/边界 |
| --- | --- | --- |
| 候选状态机/指纹/写计划/验证摘要 | `src/modules/leadgen/services/candidate-rules.ts` | 纯函数；11 例单测 |
| 审核、入库编排 | `services/leadgen-service.ts` | `decisionKey` 重放；二次决定 409；`merge` 必填目标；写入前 `approved → writing_crm` 抢占；CRM 失败回退 `approved`；认领冲突只回 owner |
| ORM 适配 | `services/orm-repository.ts` | 原子状态 CAS；公司创建走 `customers.companies.create`（审核人身份） |
| API | `src/app/api/leadgen/{runs,candidates,candidates/[id],candidates/[id]/decisions,candidates/[id]/crm-write,candidates/[id]/verify}` | 会话身份；`leadgen.*` feature；跨组织 404；body 不能选 tenant/org |
| 候选提交 | `POST /leadgen/candidates`（已补进 OpenAPI 草案，17 操作/14 路径） | run 必须属于调用者组织；指纹去重；证据随候选一起入库 |
| 验证 | `/verify` 用纯 `verifyCandidate` 计算，再按 `(candidate, verifier_version, input_digest)` 复用存储；`deliverability` 固定 `unknown` | 同输入不重算；证据来自 `fields` 列 |
| 额度 | `GET /leadgen/quota/buckets`、`POST /leadgen/quota/reservations` | 四层桶取最小余量；`Idempotency-Key` 重放；任一桶不足整单失败；超限 429 带缺口 |
| ACL | `src/modules/leadgen/acl.ts` | `leadgen.candidates.view` / `.review` / `.manage` / `quota.view` / `quota.manage`，与合同 `x-required-features` 逐条对齐 |

测试：`36` 例（规则/服务/额度/审核门 + 路由守卫）通过；分支全量 unit `956 passed`（`JEST_MAX_WORKERS=2`，13.5s）；`tsc --noEmit` 0 错误；
4 片迁移的隔离库演练再次 PASS（18 列变更随 snapshot 一致）。

## 4. 仍需批准/补齐（未做）

1. **合并与迁移应用**：把 `feat/leadgen-m5` 合入 main 并在生产执行 3 片迁移（生产迁移属另批）。
2. **`contact_email` 是否加密**：当前列是明文 + hash；决定加密则要改实体/迁移并回填方案。
3. **4 条部分唯一索引方案**：保持手写 + 白名单 + 每次复核，还是改为生成器支持。
4. **补齐**：审核列表 UI。`POST /leadgen/candidates` 已进入草案，合同门 17 操作校验通过。
5. **M4 剩余**：#7 配额/审批绕过、#1.1 leadgen 候选越权，需本分支合入后才有路径可测。

## 5. 部署前置门禁（已在分支上运行，非应用）

`node --input-type=module -e "import {preflightMigrations} from './scripts/auto-deploy/migration-preflight.mjs'; ..."`（releaseDir=分支 `a7f606c`，baselineDir=main）

结果：**ok=true，4 片迁移 51 条语句全部 expand，destructive=0，unknown=0**——部署管线的静态 expand-only 门禁会接受这批迁移（旧进程可继续运行）。
证据：`evidence/preflight-20261112.json`。注意：这是分类器结论，**不等于已应用**；生产应用仍需批准。

## 6. 应用与回退（批准后）

```
# 预检 + 备份
node scripts/auto-deploy/migration-preflight.mjs   # 或等价检查：仅 create/index
pg_dump ... > backup.sql
# 应用（三片）
yarn db migrate   # 或按模块 mikro_orm_migrations_leadgen 逐片
# 验证
select count(*) from pg_tables where tablename like 'leadgen_%';  -- 17
# 回退
每片 down 已在 drill 演练；生产回退需另行批准（drop 17 张 leadgen 表）
```
