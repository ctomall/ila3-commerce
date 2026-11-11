# 文档一致性审计 — EVIDENCE-2026-11-11-REAL.md

审计对象：`/home/pro/apps/mercato/docs/crm-platform/dsh-integration/EVIDENCE-2026-11-11-REAL.md` 与同目录 `evidence/*.sse`。
实跑对象：隔离实例 `http://127.0.0.1:3901`，release `fb8f6fc7a4a6ed678f9274accd6d3325cc4c9913`，OM_DSH_PERSIST=orm，DB 已应用迁移。

## 判定：FAIL（文档存在 4 处与实跑/自身不一致）

### 1. 文档头 release 过期
- 文档第 3 行：`release 53e08fd`。
- 文档第 88 行：`v19 / fb8f6fc`。
- 实跑：`release.json.sha = fb8f6fc7a4a6ed678f9274accd6d3325cc4c9913`。
- 结论：头部 release 未更新，同一文档内两个 release 标识不一致。

### 2. 撤权错误文案描述过期
- 文档第 58 行仍写：`遗留：撤权流的 error 文案仍是通用 persistence_unavailable，应改成 revoked/cancelled（下轮修）`。
- 文档第 82 行（v18）：`SSE error:"run_cancelled"`。
- 实跑：revoke-inflight.sse 顶层 `{"type":"error","error":"run_cancelled"}`；run `cancelled`（reason `qa-revoke-fb8f6fc`），59 ms 停流。
- 结论：第 58 行是旧状态，与第 7 节和实跑矛盾。

### 3. 重启恢复状态前后矛盾
- 文档第 65 行（第 5 节“明确未完成”）：`重启恢复…未接线；当前只有 recoverInFlight 查询与服务函数`。
- 文档第 76–84 行（第 7 节）：已记录 v18 `restart-sweep` / `stale-sweep-2 → failed/server_restart`，并附证据 `restart-sweep.sse`、`recovery-sweep.txt`。
- 结论：第 5 节未随第 7 节更新，属内部不一致（本次未重跑重启恢复，仅指出文档冲突）。

### 4. 双员工证据来自旧 OM_DSH_ROOT
- 当前实例 `OM_DSH_ROOT=/tmp/dsh-e2e/runs-qa`；本次实跑生成 `/tmp/dsh-e2e/runs-qa/homes/{667d4bd3…,91b8e5d0…}`（均 0700）。
- 文档证据 `per-employee-homes.txt` 与 `iso-admin.sse`/`iso-employee.sse` 写的是 `/tmp/dsh-e2e/runs-real6/homes/…`；DB 中 iso3-a/e 运行创建于 12:14，早于当前实例 12:15 的启动。
- 结论：home 哈希（667d4bd3…/91b8e5d0…）可复现，但文档引用的证据文件并非当前 `runs-qa` 实例产出，证据来源路径过期。

## 与实跑一致的部分（抽样核对）
- `real-model-chat.sse`：8,380 B，顶层 1 条 text `READY`、1 done；与第 1 节一致。
- `real-model-tool.sse`：2 tool-call（同 id 转发）、1 tool-result `companies:[], scanned:3`；与第 3 节一致。
- `shell-tool-absent.sse`：0 tool-call，模型明确表示无 shell；与第 8.3 节一致。
- `mcp-tool-after-hardening.sse`：2 tool-call → `mcp__crm__crm_find_companies`，最终 `TOOL_OK`；与第 8.3 节一致。
- `iso-admin.sse`/`iso-employee.sse`：文本 `ISOLATED_a`/`ISOLATED_e`；与第 8.4 节一致（路径除外）。
- `dsh-runs.txt`/`dsh-bindings.txt` 中的 run 状态与当前 DB 查询一致。
