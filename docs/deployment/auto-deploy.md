# CRM 隔离自动部署（auto-deploy）

> 状态（2026-11-09 07:15）：**只读检查器已启用；隔离发布执行器已实现，两次失败演练通过；生产自动上线未启用。**
> 第 2 道门槛现在只剩一件事：`build-artifact.yml` 已加上 `yarn typecheck` + `yarn test --silent`（本地提交 `49229b7`），门因此从 `no-test-step-in-ci-workflow` 变成 `no-successful-test-run-for-sha`——**该 SHA 还没被 push 到 `origin/main`，GitHub 上没有它的 run**。按本文件定义的门槛，执行器必须拒绝发布；这不是脚本缺陷。
>
> 演练证据（`node scripts/auto-deploy/drill.mjs`，2026-11-09 07:05–07:15）：
> - A 候选不健康（健康检查指向错误端口）→ `refused` / `candidate-unhealthy`，当前指向未变，线上仍健康；
> - B 切换后立即失效 → `rolled-back` / `post-switch-unhealthy`，回滚到 seed 并复验健康（登录 200、`/backend` 重定向链落到登录页、构建戳 commit 一致）；
> - 清理：当前链接恢复真实 release、演练进程已停、seed 目录已删。
> 记录：`/home/pro/.local/state/ila3-deploy/drills/latest.json` 与 `.mercato/auto-deploy/drills.json`。
> 只读 timer `ila3-auto-deploy-check.timer` **不是**自动部署，它只写 `.mercato/auto-deploy/status.json`。自动部署执行器是 `scripts/auto-deploy/deploy.mjs`，对应 timer `ila3-auto-deploy.timer`，当前**未安装**。

## 1. 两条路径的区别（先看这个）

| 路径 | 入口 | 是否改生产 | 是否依赖工作树干净 | 产物 |
| --- | --- | --- | --- | --- |
| 只读检查器 | `ila3-auto-deploy-check.timer` → `check.mjs` | 否 | 是，脏工作树直接 `blocked-worktree` | `.mercato/auto-deploy/status.json` |
| 隔离发布执行器 | `ila3-auto-deploy.timer` → `deploy.mjs --auto`，或人工 `--manual` | 通过 symlink + 服务重启切换 | **否**，源码从 git 对象 `git worktree add <sha>` 导出 | `/home/pro/releases/mercato/<sha>` + 运行记录 |

`check.mjs` 的 `blocked-worktree` 是**它自己的**判定，不是发布执行器的前置条件。执行器只把脏工作树记录为 `worktreeDirty` 审计字段，不会读取、复制或重置开发目录里的未提交文件；它构建的是不可变的 git commit。这样既避免了旧 `system-update.mjs` 的 `git reset --hard`，也不会覆盖协作同事的改动。

## 2. 架构

```
timer / manual
   │
   ▼
deploy.mjs  ── flock -n /home/pro/.local/state/ila3-deploy/deploy.lock
   │            （拿不到锁：立即退出 75，说明谁占用）
   ├─ 1. ci-gate.mjs       读 <sha> 的 workflow 文件 + GitHub Actions runs
   │                       必须：run 成功 AND 该 workflow 含 test 步骤
   ├─ 2. release.mjs       git worktree add --detach <sha> 到独立目录
   │                       yarn install --frozen-lockfile
   │                       yarn build（6 GB heap，nice 10）
   │                       校验 .mercato/build-info.json：commit == <sha>
   ├─ 3. health.mjs        候选端口（默认 3100）启动 next start
   │                       /login 200；/backend 3xx 且重定向链落到 /login
   │                       进程存活；build stamp commit == <sha>
   ├─ 4. switch            current -> <release>（原子 symlink）
   │                       重启 ila3-auto-deploy-app.service 或 drill PID
   ├─ 5. post-health       正式端口再次检查同一组条件
   └─ 6. rollback          失败则 current -> previous，重启旧 release，
                           再验证旧 release 健康；全程写 run record
```

### 目录

```
/home/pro/releases/mercato/
  <full-sha>/                    # git worktree + node_modules + .mercato/next + release.json
  current -> <full-sha>          # 原子切换目标
  previous -> <full-sha>         # 切换前 release，回滚目标
/home/pro/.local/state/ila3-deploy/
  deploy.lock                    # timer 与 manual 共用
  runs/<runId>.json              # 每次运行完整记录
  latest.json                    # 最近一次运行
  runs.jsonl                     # 追加式索引
  logs/<runId>-*.log             # gate/release/install/build/candidate/target 日志
  gates/<sha>.json               # CI 门槛证据
  drills/<drillRunId>.json       # 两次失败演练证据
  failed/<sha>-<runId>.json      # 构建失败诊断
  active.json                    # drill/PID 模式下当前进程
/home/pro/apps/mercato/.mercato/auto-deploy/
  status.json                    # 只读检查器
  ci-gate.json                   # 最近一次 CI 门槛
  last-run.json                  # 最近一次执行器运行（镜像）
  drills.json                    # 最近一次演练（镜像）
```

## 3. 命令

```bash
cd /home/pro/apps/mercato

# 单测（14 项）
node --test scripts/auto-deploy/*.test.mjs

# CI 门槛（只读；0=allow，2=deny，3=gate error）
node scripts/auto-deploy/ci-gate.mjs --sha "$(git rev-parse HEAD)"

# 只构建隔离 release，不切换
node scripts/auto-deploy/release.mjs --sha <full-sha>

# 单独检查一个已构建 release（候选端口 3100）
node scripts/auto-deploy/health.mjs \
  --release /home/pro/releases/mercato/<full-sha> \
  --port 3100 --sha <full-sha>

# 人工部署（与 timer 共用 flock；生产切换默认关闭）
node scripts/auto-deploy/deploy.mjs --manual --sha <full-sha>

# 自动入口（timer 调用的就是这条）
node scripts/auto-deploy/deploy.mjs --auto

# 两次失败演练（非生产端口 3100/3200）
node scripts/auto-deploy/drill.mjs

# 只读状态汇总
node scripts/auto-deploy/status.mjs

# 启用前检查（当前会拒绝；不会安装任何 unit）
node scripts/auto-deploy/enable.mjs --dry-run
```

## 4. CI 门槛（第 2 项交付）

`ci-gate.mjs` 做两件事，缺一不可：

1. **读 workflow 文件本身**：`git show <sha>:.github/workflows/*.yml`，抽取所有 `run:` 块，匹配 `yarn/npm/pnpm test`、`test:*`、`jest`、`vitest`、`playwright test`、`cypress run`，以及 `uses: *playwright/cypress/jest/vitest*` action。注释行不算。
2. **查 GitHub Actions runs**：`GET /repos/<owner>/<repo>/actions/runs?head_sha=<sha>`，要求存在 `status=completed`、`conclusion=success` 且 `path` 属于“含 test 步骤”的 workflow。

因此“build-artifact 绿了”不等于“测试通过”。当前仓库只有一个 workflow，且没有 test 步骤，所以**任何 SHA 都会被拒绝**：

```text
$ node scripts/auto-deploy/ci-gate.mjs --sha "$(git rev-parse HEAD)"
[ci-gate] decision=deny reason=no-test-step-in-ci-workflow
[ci-gate] workflow .github/workflows/build-artifact.yml hasTest=false runBlocks=5
$ echo $?
2
```

要打通门槛，必须由 `.github/workflows/**` 的 owner 在 workflow 里加入真实测试命令并 push 到 main；该路径不在本执行器的文件所有权内，执行器不会也不应该替 CI 造假。

## 5. 隔离 release（第 1 项交付）

- 源码：`git worktree add --detach /home/pro/releases/mercato/<sha> <sha>`。这是 git 对象上的干净 checkout，不是 `cp` 开发目录，也不是 `git archive`（archive 没有 `.git`，会让 `build.mjs` 的 commit stamp 为空）。
- 环境文件：只复制 `.env`、`.env.local`、`.env.production`（如存在），权限 600，记录 SHA-256，不复制 `.env.bak*`。
- 依赖：`yarn install --frozen-lockfile`。Yarn 4 提示该参数是 `--immutable` 的兼容别名，输出 `YN0050` 警告属预期。
- 构建：`nice -n 10 yarn build`，`NODE_OPTIONS=--max-old-space-size=6144`，`NEXT_PRIVATE_WORKER_THREADS=2`，`CI=1`，超时 60 分钟。
- 校验：`.mercato/build-info.json` 必须是 `status:"ok"` 且 `commit == <sha 前 8 位>`，且 `.mercato/next/BUILD_ID` 存在。
- `release.json` 记录：sha、源码命令、干净/脏审计字段、env 文件、install/build 命令与日志路径、日志尾部、build stamp、产物目录清单/大小、node_modules 大小。
- 幂等：已存在且 `release.json`/build stamp 校验通过则复用，不重复构建。

## 6. 候选健康检查（第 4 项交付）

候选从 release 目录直接 `next start -p 3100 -H 127.0.0.1`（不走 `yarn start` 的 worker/scheduler supervisor，避免候选实例消费队列）。检查项：

1. 进程存活；
2. `GET /login` == 200；
3. `GET /backend` 未登录 == 3xx，且跟随重定向链最终落到 `/login` 且 200（当前链路：`/backend` → `/api/auth/session/refresh` → `/login?redirect=/backend`）；
4. `.mercato/build-info.json` 的 commit 等于目标 SHA，`status=ok`，`BUILD_ID` 存在。

任一项失败/超时：**放弃切换**，杀候选进程组（先 SIGTERM，10 秒后 SIGKILL），记录 `candidate-unhealthy`。

## 7. 互斥与运行记录（第 3 项交付）

两个入口都调用 `deploy.mjs`，脚本启动即 `flock -n /home/pro/.local/state/ila3-deploy/deploy.lock` 重新执行自身：

- 拿不到锁：立即退出码 **75**，stderr 输出 `{"status":"locked-out","lock":...}`，不做任何构建/切换。
- 拿到锁：运行记录写 `runs/<runId>.json`（sha、entry=auto/manual、开始/结束、步骤、结果、gate/candidate/post-health/rollback、日志路径），并镜像到 `latest.json` 与 `.mercato/auto-deploy/last-run.json`。

## 8. 原子切换与回滚（第 5 项交付）

- 切换前：`previous -> old current`，然后 `current -> new release`，两次都是“临时 symlink + rename”原子替换。
- 切换后：重启 `ila3-auto-deploy-app.service`（systemd 模式）或 drill 的 PID 实例，然后在目标端口做同一组健康检查。
- 失败：`current -> previous`，重启旧 release，再验证旧 release 健康；写 `rollback.healthy=true/false`。回滚也失败则结果 `rollback-failed`，退出码 3。
- 生产保护：目标端口 3000 / systemd 模式默认拒绝，必须同时有 `--allow-production` 和 `ILA3_ALLOW_PRODUCTION=1`；若 `mercato.service` 仍占用 3000，拒绝启动第二个生产槽，除非显式 `--allow-replace-mercato`。

## 9. 失败演练（第 6 项交付）

`node scripts/auto-deploy/drill.mjs` 在 3100/3200 上跑两次，不碰 3000：

- **A：候选不健康 → 拒绝切换**。候选在 3100 启动，但健康检查故意指向 3198。执行器必须 `refused`、`error.code=candidate-unhealthy`、候选被清理、`current` 未变、3200 上的旧实例仍健康。
- **B：切换后立刻失败 → 自动回滚**。候选健康后切到新 release，`--inject-post-switch-failure` 立刻杀掉新进程；执行器必须检测到 post-switch 不健康，回滚到上一个 release，验证回滚后 3200 健康，结果 `rolled-back`。

证据：`/home/pro/.local/state/ila3-deploy/drills/latest.json`、`drills/<id>.json`、`logs/<id>.log`。

## 10. 启用 / 停用（第 9 项交付）

### 当前实际状态

- `ila3-auto-deploy-check.timer`：**enabled/active**，只读检查，每 5 分钟。
- `ila3-auto-deploy.timer` / `ila3-auto-deploy.service` / `ila3-auto-deploy-app.service`：**未安装**（`systemctl is-enabled ila3-auto-deploy.timer` 返回 not-found）。
- 生产 3000 仍由 `mercato.service` 从 `/home/pro/apps/mercato` 提供。
- 自动上线：**未开启**。原因见第 4 节；此外生产槽切换需要显式停 `mercato.service`，未执行。

### 一键停用（如果以后已启用）

```bash
# 停止自动部署触发器和部署器；不影响只读检查器
sudo systemctl disable --now ila3-auto-deploy.timer ila3-auto-deploy.service
# 如果已经切到 release app 服务，恢复旧的生产单元（按需）
sudo systemctl disable --now ila3-auto-deploy-app.service
sudo systemctl enable --now mercato.service
```

只停自动部署、保留当前正在服务的 release：

```bash
sudo systemctl disable --now ila3-auto-deploy.timer
```

### 启用条件

`enable.mjs --enable` 会拒绝，除非同时满足：

1. `gates/latest.json` 的 sha == 当前 HEAD 且 `allow=true`；
2. `drills/latest.json` 的 sha == 当前 HEAD 且两次演练 `passed=true`；
3. `current` release 的 build stamp 与 HEAD 一致；
4. 显式 `--allow-production`（或 `ILA3_ALLOW_PRODUCTION=1`）；
5. 若 `mercato.service` 仍 active，必须显式 `--replace-mercato` 做生产槽切换。

当前第 1 条不满足，所以 `enable.mjs --dry-run` 会拒绝，且**没有安装任何 unit**。

## 11. 已知限制

- **CI 无测试步骤**：这是当前唯一硬阻断。执行器不会把 build-only 的绿跑当作测试通过。
- **生产槽未切换**：`mercato.service` 仍指向开发目录 `/home/pro/apps/mercato`；`ila3-auto-deploy-app.service` 只是模板，未安装。真正上线需要一次显式的生产槽切换，属于高风险动作，未在本轮执行。
- **不跑数据库迁移**：release 构建只做代码生成/编译；不执行 `db:migrate`。迁移仍由人工按既有流程处理。
- **候选只验证 HTTP 就绪**：不启动 queue worker / scheduler，不验证后台任务；候选实例与生产共用数据库，健康检查只发 GET，不写业务数据。
- **构建资源**：单次构建 heap 6 GB、`nice 10`、单进程；共享机器上仍可能受内存/CPU 影响。失败记录在 `failed/`，不会自动重试。
- **保留策略**：每次成功部署、以及每次失败/拒绝的构建收尾时，`pruneReleases()` 会删除除 `current` 和 `previous` 指向之外的 release 目录，并对 release worktree 执行 `git worktree prune`。候选只有 `RELEASE_ROOT` 下 40 位十六进制名目录；symlink、非 sha 目录和普通文件永不被处理，且 cwd 落在该目录的存活进程会让它被跳过（记录在 `prune.skippedInUse`）。单个 release 约 4.2 GB，此前无上限积累正是根分区写满的原因（5 小时 8 个 release / 33 GB）。
- **`.env` 复制**：release 里的 `.env` 是运行时配置副本，权限 600；轮换密钥后需要重建 release 或同步更新。
- **flock 是进程级**：只覆盖本机同一路径的 `deploy.mjs`；若有人绕过脚本直接改 symlink，不在保护范围。
- **生产切换回滚**：若 `ila3-auto-deploy-app.service` 启动失败，回滚会把 symlink 指回旧 release 并重启服务；如果旧服务也起不来，结果 `rollback-failed`，需要人工介入。

## 12. 证据索引

| 交付 | 证据 |
| --- | --- |
| 单测 | `node --test scripts/auto-deploy/*.test.mjs`（14/14） |
| CI 门槛拒绝 | `/home/pro/.local/state/ila3-deploy/gates/652039c...json`、`logs/gate-head.log`、`logs/gate-origin.log` |
| 隔离构建 | `/home/pro/releases/mercato/<sha>/release.json`、`logs/<runId>-install.log`、`logs/<runId>-build.log` |
| 候选健康 | `logs/<runId>-candidate.log`、`runs/<runId>.json` 的 `candidate` |
| 互斥 | `deploy.lock` + `runs/<runId>.json` 的 `lock`；并发时退出 75 |
| 切换/回滚 | `runs/<runId>.json` 的 `postSwitch` / `rollback` |
| 失败演练 | `/home/pro/.local/state/ila3-deploy/drills/latest.json`、`logs/<drillRunId>.log` |
| 只读状态 | `node scripts/auto-deploy/status.mjs` |
