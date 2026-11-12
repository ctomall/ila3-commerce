# M5 上线前的三项口径（需要拍板）

状态：`feat/leadgen-m5`（tip `7cd6f79`）已通过全部可在分支上跑的校验；生产未动。
只要对下面三项给出结论，合并/应用/验收可以一次走完。

## 决策 1：合并 + 生产应用 4 片迁移

**证据**：隔离库演练 4 片 up→17 表→down 归零→reapply 一致（`docs/crm-platform/verify/migration-drill-2026-11-12T05-36-49.md`）；
deploy 静态 expand-only preflight：4 片 51 语句，0 destructive/0 unknown（分支 `evidence/preflight-20261112.json`）；
分支静态门禁 lint 0 error / tsc 0 / unit 956 / contract 17 操作全绿。

**推荐**：批准。执行顺序：合分支 → push main → CI → auto-deploy 切换 → **备份** → 应用 4 片迁移 → 核对 17 张表 → 同提交跑 25 道门 → 用真实账号走一遍审核/入库。

**风险与回退**：迁移为 expand-only，旧进程可继续运行；回退 = 4 片 down（已逐片演练）+ revert 合并提交。不含真实外发、删除、渠道副作用。

## 决策 2：`contact_email` 是否加密

**现状**：`leadgen_candidates.contact_email` 明文 + `contact_email_hash`（sha256，用于抑制/去重）。
**推荐**：合并时保持现状（hash 用于匹配），把“加密列 + 应用密钥”作为独立变更跟进；理由是本次合并不扩大外发面，明文仅对 `leadgen.candidates.view` 返回。
若要求上线前必须加密：新增 `contact_email_cipher` + 应用层加解密 + 回填 + 不回显明文，约一轮工期。

## 决策 3：4 条手写部分唯一索引

**现状**：第二片迁移有 4 条带谓词的部分唯一索引，MikroORM 生成器不产出，靠手写 SQL + 演练漂移检查（`drift.partial-indexes` PASS）。
**推荐**：保留现状 + 演练门禁（每次 full run 校验谓词一致），不改成生成器；生成器改造收益低、回归面大。

## 批准方式

回一句即可，例如：
- “1、2、3 按推荐执行”——我据此合并、应用迁移，并跑同提交 25 道门 + M5 业务闭环验收；
- 或指出要改的口径（如“2 必须上线前加密”“3 改成生成器”）——我调整后再请批准。
