# 自动部署续作 / Handoff

> 更新时间：2026-11-09 06:00 UTC
> 结论先说：**隔离自动发布执行器已实现并完成失败演练；生产自动上线未启用。** 阻断点是 CI 门槛，不是脚本能力。

## 1. 本轮交付

| 文件 | 作用 |
| --- | --- |
| `scripts/auto-deploy/lib.mjs` | 配置、日志、git、flock、原子 symlink、HTTP、运行记录 |
| `scripts/auto-deploy/ci-gate.mjs` | 读 workflow 文件 + GitHub Actions runs；`success` 且确有 test 步骤才放行 |
| `scripts/auto-deploy/release.mjs` | `git worktree add <sha>` 导出源码，`yarn install --frozen-lockfile` + `yarn build`，产物/依赖/源码同 SHA |
| `scripts/auto-deploy/health.mjs` | 候选端口启动/健康检查（进程、`/login` 200、`/backend` 3xx→`/login`、build stamp） |
| `scripts/auto-deploy/deploy.mjs` | flock 互斥 → CI → release → candidate → 原子切换 → 切换后健康 → 回滚 |
| `scripts/auto-deploy/drill.mjs` | 两次失败演练（候选不健康拒绝切换；切换后失败自动回滚） |
| `scripts/auto-deploy/status.mjs` | 只读状态汇总 |
| `scripts/auto-deploy/enable.mjs` | 启用门禁；条件不满足时拒绝，当前未运行 `--enable` |
| `scripts/auto-deploy/systemd/*` | `ila3-auto-deploy.service/timer` + `ila3-auto-deploy-app.service` 模板（**未安装**） |
| `scripts/auto-deploy/*.test.mjs` | 14 项单测 |
| `docs/deployment/auto-deploy.md` | 架构、命令、证据、失败处理、禁用、限制 |
| `docs/deployment/AUTO-DEPLOY-HANDOFF.md` | 本文件 |

## 2. 当前实际状态（以命令为准）

```bash
systemctl is-enabled ila3-auto-deploy-check.timer   # enabled（只读检查，每 5 分钟）
systemctl is-enabled ila3-auto-deploy.timer         # not-found（执行器未安装）
systemctl is-active mercato.service                  # active（仍从 /home/pro/apps/mercato 服务 3000）
node scripts/auto-deploy/status.mjs                  # 汇总 current/release/gate/drills/timer
```

- **只读 checker ≠ 自动部署**：`ila3-auto-deploy-check.timer` 只写 `.mercato/auto-deploy/status.json`，不构建、不切换。
- **隔离执行器未启用**：`ila3-auto-deploy.timer` 未安装；`enable.mjs --dry-run` 当前会拒绝。
- **生产 3000 未切换**：仍由 `mercato.service` 跑开发目录；`ila3-auto-deploy-app.service` 仅模板。

## 3. 为什么不能启用（硬阻断）

`node scripts/auto-deploy/ci-gate.mjs --sha "$(git rev-parse HEAD)"` 返回 2：

```text
decision=deny reason=no-test-step-in-ci-workflow
workflow .github/workflows/build-artifact.yml hasTest=false runBlocks=5
```

仓库唯一 workflow 只有 install/build/report/upload，没有测试步骤。即使 CI 显示 success，也不满足“workflow 确实跑了测试”。此外取证期间共享工作区 HEAD 被并发提交推进（`652039c` → `fab10ba` → `090686c` → `c479f8b`），本机提交也未 push 到 origin。

**解决路径（需要 `.github/workflows/**` owner 操作，超出本执行器文件所有权）**：

1. 在 `.github/workflows/build-artifact.yml`（或新增 workflow）加入真实测试命令，例如：
   ```yaml
   - name: Test
     run: yarn test
   ```
   若要跑集成测试，确保 `yarn test:integration` 的依赖/数据库在 runner 可用。
2. push 到 `main`，等待该 workflow 对目标 SHA `completed/success`。
3. 重新执行 `ci-gate.mjs --sha <sha>`，确认 `decision=allow`。
4. 运行 `drill.mjs`（同一 SHA）确认两次演练 `passed=true`。
5. 再执行 `enable.mjs --enable --allow-production`；它会做最后一次门禁检查并安装 unit。

## 4. 关键命令

```bash
cd /home/pro/apps/mercato

# 单测
node --test scripts/auto-deploy/*.test.mjs

# 只读检查器（现有 timer 跑的）
node scripts/auto-deploy/check.mjs

# CI 门槛
node scripts/auto-deploy/ci-gate.mjs --sha <sha>

# 隔离构建（不切换）
node scripts/auto-deploy/release.mjs --sha <sha>

# 人工部署（与 timer 共用锁；生产切换默认拒绝）
node scripts/auto-deploy/deploy.mjs --manual --sha <sha>

# 自动入口
node scripts/auto-deploy/deploy.mjs --auto

# 失败演练（非生产端口）
node scripts/auto-deploy/drill.mjs

# 状态
node scripts/auto-deploy/status.mjs
```

## 5. 证据位置

```
/home/pro/.local/state/ila3-deploy/
  gates/<sha>.json           # CI 门槛结论（含 workflow 读取结果、runs）
  runs/<runId>.json          # 每次部署/拒绝的完整记录
  latest.json
  logs/*.log                 # gate/install/build/candidate/target 日志
  drills/latest.json         # 两次演练结论
  failed/*.json              # 构建失败诊断（如有）
/home/pro/releases/mercato/<sha>/release.json   # sha/源码命令/日志/产物清单/大小
```

## 6. 如何停用

```bash
# 只停自动部署触发器和部署器（不影响 3000 上的 release app）
sudo systemctl disable --now ila3-auto-deploy.timer ila3-auto-deploy.service

# 若已切到 release app，恢复旧生产单元
sudo systemctl disable --now ila3-auto-deploy-app.service
sudo systemctl enable --now mercato.service
```

只读检查器可保留；它不会部署。

## 7. 已知坑 / 注意事项

- **不要复用 `scripts/system-update.mjs`**：它用 `git reset --hard`，且旧 build 在 03:45 因 30 分钟 systemd timeout 失败。本执行器不调用它。
- **不要清空开发工作树**：执行器从 git 对象构建；脏文件只记录为 `worktreeDirty` 审计字段。
- **构建重**：6 GB heap、`nice 10`、单进程；共享机器上避免并发构建。构建日志在 `logs/`，失败诊断在 `failed/`。
- **不跑迁移**：release 只做代码生成/编译，不执行 `db:migrate`。
- **生产槽切换**：需要停 `mercato.service` 并启用 `ila3-auto-deploy-app.service`；这是高风险动作，未执行。
- **release 清理**：不会自动删除旧 `/home/pro/releases/mercato/<sha>`；人工清理后 `git worktree prune`。
- **`.env`**：从开发目录复制到 release（600），密钥轮换后需重建 release。

## 8. 下一步建议（按优先级）

1. 给 CI 加真实测试步骤并 push；这是唯一硬阻断。
2. 用同一 SHA 重跑 `ci-gate.mjs` → `drill.mjs` → `enable.mjs --dry-run`。
3. 演练通过后再决定是否做生产槽切换（停 `mercato.service`、启用 `ila3-auto-deploy-app.service`）；这一步需要单独的风险确认。
