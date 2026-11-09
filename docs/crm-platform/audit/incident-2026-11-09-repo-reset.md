# 事故记录：外部进程重置仓库并重启构建（2026-11-09 03:13–03:17 UTC）

> 记录人：本会话（第 48/49 轮）。目的：留下可核对的事实，避免把"验证没跑完"写成"验证通过"，也避免把责任推给"环境不稳定"这种没证据的说法。

## 发生了什么

`git reflog`（可复核）：

```
7150d21 HEAD@{2026-11-09 03:17:19 +0000}: reset: moving to 7150d21          ← 本会话恢复
8ba4c61 HEAD@{2026-11-09 03:15:15 +0000}: reset: moving to 8ba4c61c60...    ← 外部进程
7150d21 HEAD@{2026-11-09 03:13:47 +0000}: reset: moving to 7150d216f64...   ← 外部进程（同值空操作）
7150d21 HEAD@{2026-11-09 03:11:24 +0000}: commit: test(crm): re-anchor the directory-mode mutation ...
```

- `8ba4c61` 是 **2026-11-08 20:13** 的提交（`widen the consolidated gate set to lint, tokens and hardcoded-i18n`），是 `7150d21` 的祖先，落后约 48 轮工作。
- 03:15:15 的 `reset` 把工作树退回该提交，`scripts/crm-restore-drill.mjs`、`scripts/crm-mutation-check.mjs`、`src/lib/dsh/profile.ts` 等本轮/前几轮的文件从磁盘消失。
- 同一时段有外部 `next build` 在跑：`node ./scripts/build.mjs` → `yarn build:inner` → `next-build`，起始约 03:12，持续 25 分钟以上。`.mercato/build-info.json` 被写成 `commit 8ba4c61 · builtAt 03:15:17`，**没有 `status` 也没有 `treeDigest`**（旧版构建脚本的格式）。
- 该构建中途经历了两次工作树切换（03:15 变旧、03:17 变回），所以产物是**混合树**，不可作为任何一方的证据。

## 影响

| 项 | 状态 |
|---|---|
| 我的提交 | 未丢失。全部在 `7150d21`（及其父提交），并已用分支 `crm-round48-verified` + 标签 `crm-round48-recovered` 固定 |
| 正在跑的全量验证 | **作废**。`nav-baseline` FAIL（服务跑的是旧提交的产物）、`typecheck` 922s（机器 load average 46、30 GB 内存耗尽）——两者都不是代码结论 |
| 运行中的服务 | **不对应当前源码**。`build-info.json` 记的是 `8ba4c61`，新鲜度门此时必然是红的 |
| 数据/数据库 | 未受影响（本会话没有执行迁移；外部进程只动了 git 与构建） |

## 恢复动作（已执行）

1. `git reset --hard 7150d21`，确认 `scripts/crm-restore-drill.mjs`、`scripts/crm-dsh-profile-check.ts`、`src/lib/dsh/profile.ts` 都在。
2. `git branch crm-round48-verified 7150d21` + `git tag crm-round48-recovered 7150d21`：之后即使 `main` 再被重置，工作也能按名字找回。
3. 放弃本次全量运行（已 `job_kill`），不把 load 造成的失败当代码结论。

## 待办（下一轮，且需要先确认没有别的写入者）

1. 确认外部构建/重置是否仍在进行（`ps -eo cmd | grep 'next build'`、`git reflog -3`）。
2. 在没有并发构建的情况下重跑 `bash /tmp/ila3-rebuild.sh`，让服务对应当前源码。
3. 跑 `node scripts/crm-verify-all.mjs --full --require-clean --require-no-skip`，拿到 7150d21 的发布级证据。

**不要**在并发构建期间重建：`next build` 会写 `.mercato/`，两个构建交错会产出第三份不可信的产物。

## 追加（03:57 UTC）：同一个写入者又在改数据与加文件

全量运行（03:54 起）在最后一步失败，原因是**运行期间工作树出现了别人的文件**：

```
[crm-verify] --require-clean: 本次运行改动了 2 个非门产物文件，结果不算提交级证据
  ?? docs/deployment/
  ?? scripts/auto-deploy/
```

这两个路径不是本会话创建的（本会话只写 `docs/crm-platform/**`、`scripts/crm-*`、`src/lib/dsh/**`）。它们是在本次运行过程中出现的，`--require-clean` 的"运行结束再取快照"规则把它抓了出来——这条规则本来就是为了抓这种情况。

同一时段还有一次业务写入，`action_logs` 里有据可查：

```
2026-11-09 03:17:33 | resource_kind=sales.order   ← 与 03:17:19 的 git reset 同一分钟
```

后果：`sales_quotes` 里再没有 `status='draft'` 的行，`crm-quote-regression` 因此报
`cannot resolve a draft quote:` 并失败。这是**夹具被别人的业务操作消耗掉**，不是报价修复回归；
门选择失败而不是跳过，这一点是对的。

### 本轮全量运行的准确结果（03:54–04:00）

| 项 | 值 |
|---|---|
| 门禁 | **PASS 21 · FAIL 1 · SKIP 0** |
| 唯一的 FAIL | `quote-regression` — 找不到 draft quote 夹具（原因见上） |
| 发布级门禁 | **FAIL** — 运行期间出现 2 个非门产物目录（别人的文件） |
| 其余 21 门 | 含 `build-freshness`、`dsh-profile`、`m4-harness`、`restore-drill`、`mutation` 全绿 |

**结论：在别人同时写这个 checkout 的情况下，拿不到干净的发布级证据。** 这不是代码问题，也不是"环境不稳定"这种含糊说法——是同一个仓库有第二个写入者，有 reflog、有 action_logs、有新增目录三条独立证据。
