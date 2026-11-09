# CRM 隔离自动部署（auto-deploy）

> 状态（2026-11-09 12:22）：**发布默认路径已从“生产机现场构建”切到“CI 出完整发布包 → 可信校验 → 安全解包 → 安装”。** `deploy.mjs` 在非演练模式下默认走 `--from-artifact`；现场构建 `release.mjs` 保留为显式 `--build-locally` fallback。统一入口 `entry.mjs`（systemd 两个入口都走它）显式传入 `--from-artifact`。
>
> 本轮改动尚未 push 到 `origin/main`，因此 GitHub 上还没有“新格式”发布包的 run：现有 run `42609377937`（commit `7860993`）上传的是旧格式 `next-build-*` 目录包。CI 与生产使用同一个打包脚本（`package-release.mjs`），本地 e2e 演练验证了从打包、下载校验、解包、安装到候选健康/切换的完整链路；真机下载 GitHub 新包要等该 commit push 后产生 run。**在 CI 产出新 artifact 之前，生产仍应使用 `--build-locally`，否则会按设计拒绝。**
>
> 失败演练：`artifact-drill.mjs` 7 项全部通过（sha 不匹配 / manifest 与 run 元数据不一致 / 路径穿越 / 下载 404 / 下载超时 / 部署级 404 / 部署级超时，后两项均验证旧版本仍在运行）；原有候选失败与回滚演练仍通过。真实 2.4 GB release 的 e2e（打包 → 安装 → 候选 → 切换）也通过：tar.gz 225.5 MiB / 14,296 文件 / 33 个包内符号链接，`yarn install` 115.6 s，候选与切换后健康均通过，`source.method=ci-artifact`。证据见 §11。

## 1. 三条路径的区别（先看这个）

| 路径 | 入口 | 是否改生产 | 是否在工作树构建 | 产物 |
| --- | --- | --- | --- | --- |
| 只读检查器 | `ila3-auto-deploy-check.timer` → `check.mjs` | 否 | 否 | `.mercato/auto-deploy/status.json` |
| **CI 产物发布（默认）** | `deploy.mjs --auto` / `--manual`，默认 `--from-artifact` | 通过 symlink + 服务重启切换 | **否**，只下载 + 校验 + `yarn install` | `/home/pro/releases/mercato/<sha>` + `release.json`（`source.method=ci-artifact`） |
| 现场构建回退 | `deploy.mjs --manual --build-locally` | 同上 | 是（`git worktree` + `yarn build`） | 同上（`source.method=git-worktree`） |

`check.mjs` 的 `blocked-worktree` 是**它自己的**判定，不是发布执行器的前置条件。执行器只把脏工作树记录为 `worktreeDirty` 审计字段，不会读取、复制或重置开发目录里的未提交文件。

## 2. 架构

```
timer / manual / entry.mjs
   │
   ▼
deploy.mjs  ── flock -n /home/pro/.local/state/ila3-deploy/deploy.lock
   │            （拿不到锁：立即退出 75，说明谁占用）
   ├─ 1. ci-gate.mjs       读 <sha> 的 workflow 文件 + GitHub Actions runs
   │                       必须：run 成功 AND 该 workflow 含 test 步骤
   ├─ 2. artifact.mjs      （默认）取该 run 的 artifact 元数据
   │                       artifact.digest vs 本地重算 zip sha256
   │                       manifest 绑定 repo/run/commit/platform
   │                       安全解包 + 逐文件 sha256 + 内容摘要
   │                       yarn install --immutable（不跑 next build）
   │                       写 release.json（source.method=ci-artifact）
   │   release.mjs         （--build-locally）git worktree add + yarn install + yarn build
   ├─ 3. health.mjs        候选端口（默认 3100）启动 next start
   │                       /login 200；/backend 3xx 且重定向链落到 /login
   │                       进程存活；build stamp commit == <sha>
   ├─ 4. switch            current -> <release>（原子 symlink）
   │                       重启 ila3-auto-deploy-app.service 或 drill PID
   ├─ 5. post-health       正式端口再次检查同一组条件
   └─ 6. rollback          失败则 current -> previous，重启旧 release，
                           再验证旧 release 健康；全程写 run record
```

候选健康、切换、回滚链路与改造前完全一致；变化只在“release 目录从哪里来”。

### 目录

```
/home/pro/releases/mercato/
  <full-sha>/                    # artifact 安装或现场构建的 release
  current -> <full-sha>          # 原子切换目标
  previous -> <full-sha>         # 切换前 release，回滚目标
  .staging-<sha>-<runId>/        # 安装暂存目录；失败必删，绝不 rename 成正式目录
/home/pro/.local/state/ila3-deploy/
  deploy.lock                    # timer 与 manual 共用
  runs/<runId>.json              # 每次运行完整记录
  latest.json                    # 最近一次运行
  runs.jsonl                     # 追加式索引
  logs/<runId>-*.log             # gate/download/extract/install/candidate/target 日志
  gates/<sha>.json               # CI 门槛证据
  drills/<drillRunId>.json       # 失败演练证据
  drills/artifact-latest.json    # 产物链失败演练汇总
  drills/artifact-e2e-latest.json# 真实产物端到端演练汇总
  failures / failed/<sha>-*.json # 构建/安装失败诊断
  artifacts/<sha>/<runId>/       # 下载的 artifact zip + 校验日志（只保留最近 2 份）
  active.json                    # drill/PID 模式下当前进程
/home/pro/apps/mercato/.mercato/auto-deploy/
  status.json                    # 只读检查器
  ci-gate.json                   # 最近一次 CI 门槛
  last-run.json                  # 最近一次执行器运行（镜像）
  drills.json / artifact-drills.json / artifact-e2e-*.json  # 演练镜像
```

## 3. 命令

```bash
cd /home/pro/apps/mercato

# 单测（48 项：artifact 13 + 既有 35）
node --test scripts/auto-deploy/*.test.mjs

# CI 门槛（只读；0=allow，2=deny，3=gate error）
node scripts/auto-deploy/ci-gate.mjs --sha "$(git rev-parse HEAD)"

# CI 打包（workflow 调用的就是这条；本地也能跑，产出 dist/ 两个文件）
node scripts/auto-deploy/package-release.mjs \
  --source . --out dist \
  --repository "$(git remote get-url origin | sed -E 's#.*github\.com[:/]([^/]+/[^/]+?)(\.git)?$#\1#')" \
  --run-id 42609377937 --commit "$(git rev-parse HEAD)" \
  --checks typecheck,unit,build

# 从 CI 产物部署（默认；生产保护开关仍需显式加）
node scripts/auto-deploy/deploy.mjs --manual --from-artifact --sha <full-sha>
node scripts/auto-deploy/deploy.mjs --auto --from-artifact

# 固定某一次 run（同一 SHA 重跑时用）
node scripts/auto-deploy/deploy.mjs --manual --from-artifact --sha <sha> --artifact-run-id <run-id>

# CI 不可用时的现场构建回退（显式）
node scripts/auto-deploy/deploy.mjs --manual --build-locally --sha <full-sha>

# 只构建隔离 release，不切换（现场构建路径）
node scripts/auto-deploy/release.mjs --sha <full-sha>

# 单独检查一个已安装 release（候选端口 3100）
node scripts/auto-deploy/health.mjs --release /home/pro/releases/mercato/<sha> --port 3100 --sha <sha>

# 产物链失败演练（本地 fixture，不碰生产）
node scripts/auto-deploy/artifact-drill.mjs

# 真实 2.4GB 发布包 e2e（打包 → 安装 → 候选 → 切换；隔离 RELEASE_ROOT）
node scripts/auto-deploy/artifact-e2e.mjs

# 原有候选失败 / 切换后失败演练（非生产端口 3100/3200）
node scripts/auto-deploy/drill.mjs

# 只读状态汇总
node scripts/auto-deploy/status.mjs

# 启用前检查（当前会拒绝；不会安装任何 unit）
node scripts/auto-deploy/enable.mjs --dry-run
```

## 4. CI 门槛（第二道门）

`ci-gate.mjs` 做两件事，缺一不可：

1. **读 workflow 文件本身**：`git show <sha>:.github/workflows/*.yml`，抽取所有 `run:` 块，匹配 `yarn/npm/pnpm test`、`test:*`、`jest`、`vitest`、`playwright test`、`cypress run`，以及 `uses: *playwright/cypress/jest/vitest*` action。注释行不算。
2. **查 GitHub Actions runs**：`GET /repos/<owner>/<repo>/actions/runs?head_sha=<sha>`，要求存在 `status=completed`、`conclusion=success` 且 `path` 属于“含 test 步骤”的 workflow。

因此“build-artifact 绿了”不等于“测试通过”。门禁拒绝时 `deploy.mjs` 返回退出码 2、`result=refused`，不会下载也不碰 `current`。

## 5. CI 完整发布包（artifact 契约）

`.github/workflows/build-artifact.yml` 在 `yarn generate/typecheck/test/build` 之后运行 `package-release.mjs`，产出**一个 artifact**：

```
mercato-release-<sha> (GitHub artifact, zip)
├── release.tar.gz          # 运行时树：tracked 运行源码 + .mercato/next + .mercato/generated + build-info
└── release-manifest.json   # 元数据 + 每文件 sha256 + 内容摘要 + tar sha256
```

包内容（allowlist）：

- `.mercato/next/**`（构建产物，`cache/` 明确排除；CI 先 `rm -rf .mercato/next/cache`）
- `.mercato/generated/**`（`yarn generate` 的产物，gitignored，必须随包）
- `.mercato/build-info.json`（构建戳；commit 必须等于目标 SHA 前 8 位）
- git-tracked 运行所需文件：`package.json`、`yarn.lock`、`.yarnrc.yml`、`next.config.ts`、`tsconfig.json`、`src/**`、`public/**`、`scripts/**` 等
- 明确排除：`docs/`、`.ai/`、`docker/`、`.github/`、编辑器/Agent 目录、`.env*`、`node_modules/`、数据库导出、构建 cache

包体只和构建产物相关（本次真实 release 实测 `release.tar.gz` **225.5 MiB**、payload 949 MB、14,296 个文件），**不包含根 `node_modules/` 依赖树**（依赖由生产机 `yarn install --immutable` 按 lockfile 安装，因此包小且依赖可复现）；`.mercato/next/node_modules/` 下 Next 生成的 33 个相对符号链接是构建产物的一部分，必须保留（且校验为包内相对链接）。

`release-manifest.json` 关键字段：

```json
{
  "schema": 1,
  "sha256": "<所有 payload 文件的排序内容摘要>",
  "repository": "ctomall/ila3-commerce",
  "workflowRunId": 42609377937,
  "workflow": {"path": ".github/workflows/build-artifact.yml", "name": "build-artifact"},
  "commit": "<40-hex>",
  "runtime": {"nodeMajor": 24, "platform": "linux", "arch": "x64"},
  "checks": ["typecheck", "unit", "build"],
  "database": {"migrationRequired": false},
  "archive": {"file": "release.tar.gz", "sha256": "<tar sha256>", "bytes": 123},
  "files": [{"path": "...", "type": "file|symlink", "sha256": "...", "bytes": 1, "target": "..."}],
  "summary": {"files": 1, "symlinks": 1, "bytes": 1, "excluded": ["..."]}
}
```

manifest 放在 tar **外面**是刻意的：tar 自己的 sha256 是 manifest 的输入，放进 tar 会形成循环依赖。两者放在同一个 GitHub artifact 里，所以 API 的 artifact digest 覆盖 manifest + tar。

## 6. 可信清单与交叉校验

信任根是 **GitHub API 对该 workflow run 的 artifact digest**，不是包内自报：

1. `ci-gate` 已经证明该 SHA 有一个成功的、包含测试步骤的 workflow run；产物路径取出 `run.id`。
2. `resolveRunArtifact()` 再查 `GET /repos/<repo>/actions/runs/<id>`：`head_sha == 目标 SHA`、`status=completed`、`conclusion=success`、`path == .github/workflows/build-artifact.yml`。
3. 查 `GET /repos/<repo>/actions/runs/<id>/artifacts?name=mercato-release-<sha>`，取 `digest`（`sha256:<64hex>`）；没有 digest 直接拒绝（`artifact-digest-missing`）。
4. 下载后本地重算 zip sha256，必须等于 CI digest；同时校验 `size_in_bytes`。
5. 解 zip、读 manifest：manifest 的 `archive.sha256` 必须等于本地重算的 `release.tar.gz` sha256；manifest 的 repo/run/commit/runtime/checks/迁移标记再与本地已知值比对（`artifact-contract.mjs` 的 `validateArtifact`）。
6. 解包后逐文件重算 sha256，并用实际文件重算内容摘要，必须等于 manifest.sha256。

任何一步不一致 → 抛 `ArtifactError`，写 `failed/<sha>-<runId>.json`，清理 staging，`current` 不变，退出码 2（`refused`）。

## 7. 安全解包

`extractAndVerify()` 在解压前、解压后各做一遍检查：

- 解压前流式读取 `tar -tzf` 的每个成员名：拒绝绝对路径、盘符、`..`/`.`/空路径段、反斜杠、控制字符、超过 240 字符或单段超过 255 字符的路径；成员数上限 300,000。
- 解压到 `RELEASE_ROOT/.staging-<sha>-<runId>/`，`--no-same-owner --no-same-permissions`，不保留 setuid。
- 解压后遍历实际文件（`lstat`）：
  - 只接受普通文件和**指向包内**的相对符号链接；绝对链接、逃出 staging 的链接、设备/FIFO、硬链接（`nlink > 1`）一律拒绝；
  - 每个文件必须出现在 manifest 里（多一个 → `artifact-extra-file`），manifest 里每个文件必须存在（少一个 → `artifact-missing-file`）；
  - 类型、size、sha256、符号链接 target 全部逐一比对；
  - 用实际解出的树重算内容摘要，与 manifest.sha256 比对。
- 任一步失败：删除 staging，绝不 rename 成正式 release 目录；已下载的 zip 留在 `artifacts/` 供审计（最多保留最近 2 份）。

外层 GitHub artifact zip 也做同样检查：`unzip -Z1` 只允许 `release.tar.gz` 和 `release-manifest.json` 两个成员，解压后不允许出现其他条目。

## 8. 安装（生产不跑 next build）

`installFromArtifact()` 顺序：

1. 目标目录已存在且是有效的 `ci-artifact` release → 复用（除非 `--force`）；否则删除旧的半成品。
2. 下载/定位 zip → digest 校验 → 解外层 zip → tar sha 校验 → manifest 元数据校验。
3. 解包 + 逐文件校验（§7）。
4. 校验 `.mercato/build-info.json`：`status=ok`、`commit == <sha 前 8 位>`、`BUILD_ID` 存在。
5. `yarn install --immutable`（cwd=staging，超时 30 分钟）；失败 → `artifact-install-failed`，staging 删除。
6. 从开发目录复制 `.env`/`.env.local`/`.env.production`（若存在，权限 600，记录 sha256；包内绝不携带）。
7. 写 `release.json`：`source.method=ci-artifact`、repo/run/artifact/archive/contentDigest、install 日志、build stamp；同时保留 `release-manifest.json` 副本。
8. `rename(staging, RELEASE_ROOT/<sha>)` 原子落位，再用 `verifyRelease()` 复验；失败 → `artifact-release-invalid`。
9. 记录 `artifacts/<sha>/<runId>/` 并裁剪到最近 2 份。

之后 `deploy.mjs` 的候选健康、切换、回滚与现场构建路径完全一致。

## 9. 候选健康 / 互斥 / 切换 / 回滚（未改）

- 候选：`next start -p 3100 -H 127.0.0.1`（不启动 worker/scheduler supervisor），检查进程、`/login` 200、`/backend` 重定向链落 `/login`、build stamp commit。
- 互斥：两个入口都 `flock -n` 同一把锁；拿不到锁退出 75。
- 切换：`previous` → 旧 `current`，`current` → 新 release（临时 symlink + rename）。
- 回滚：post-switch 失败 → `current` → `previous`，重启旧 release 并复验健康；回滚失败 `result=rollback-failed`，退出码 3。
- 生产保护不变：目标端口 3000 / systemd 模式默认拒绝，需 `--allow-production` + `ILA3_ALLOW_PRODUCTION=1`；`mercato.service` 仍占用 3000 时拒绝第二生产槽，除非显式 `--allow-replace-mercato`。

## 10. 现场构建 fallback

`release.mjs` 保留原逻辑：`git worktree add --detach <sha>` → `yarn install --frozen-lockfile` → `nice -n 10 yarn build` → 校验 build stamp。只有在以下情况显式使用：

```bash
node scripts/auto-deploy/deploy.mjs --manual --build-locally --sha <full-sha> --allow-production
# 或手动：
node scripts/auto-deploy/release.mjs --sha <full-sha>
```

`deploy.mjs` 的默认决策：

- 非演练、未指定 `--release-dir` → **artifact 路径**（即使不写 `--from-artifact`）；
- `--build-locally` → 现场构建；
- `--drill` 且未显式 `--from-artifact` → 保持原有的本地构建行为（旧演练脚本不受影响）。

## 11. 失败演练（本轮新增）

`node scripts/auto-deploy/artifact-drill.mjs` 使用本地 fixture 和隔离 `RELEASE_ROOT/STATE_DIR`，不触碰生产 `current`：

| 场景 | 注入 | 期望 / 实际 |
| --- | --- | --- |
| 包 sha 不匹配 | 期望 digest 全 0 | `refused` / `artifact-digest-mismatch`，目标目录不存在 |
| manifest 与 run 不一致 | manifest run=111，期望 run=222 | `artifact-manifest-mismatch`（`workflow-run-mismatch`），目标目录不存在 |
| 解包路径穿越 | tar 成员被 `--transform` 改成 `../payload.txt` | `artifact-unsafe-path`，staging 清理，目标目录不存在 |
| 下载 404 | 本地 HTTP 返回 404 | `artifact-download-failed`（detail.status=404） |
| 下载超时 | 本地 HTTP 永不响应 + 600ms 超时 | `artifact-download-failed`（reason=timeout） |
| 部署级 404 | `deploy.mjs` 以 404 artifact URL 运行 | exit 2 / `refused`，`current` 不变，3200 旧目标健康 |
| 部署级超时 | 同上，超时 1.5s | exit 2 / `refused`，`current` 不变，3200 旧目标健康 |

证据：`/home/pro/.local/state/ila3-deploy/drills/artifact-latest.json`、`drills/<drillRunId>/`（run record、失败诊断、下载日志）、`logs/<drillRunId>.log`。

真实产物端到端（2026-11-09 12:19–12:21）：`artifact-e2e.mjs` 从真实 release `7860993` 打包（payload 949 MB → `release.tar.gz` 225.5 MiB，sha256 `5427a0b2…`，14,296 文件 / 33 符号链接），按 GitHub 的方式压成外层 zip（sha256 `8d9c558f…`），再让 `deploy.mjs --from-artifact` 在隔离 `RELEASE_ROOT/STATE_DIR` 中完成：

- 解包 + 逐文件 sha256 + 内容摘要校验通过；
- `yarn install --immutable` 115.6 s 通过（生产机没有跑 `next build`，`release.json.commands.build = "skipped (built in CI)"`）；
- 候选 3100 健康通过；`current` 切到 artifact release；post-switch 健康 313 ms 通过；
- 结果 `deployed`，`installer=ci-artifact`，`source.method=ci-artifact`，`next` 可执行文件存在，无本地 `.next` 构建输出；
- 演练用的隔离 root 与 seed 已清理；生产 `current`/`previous` 未被触碰。

证据：`drills/artifact-e2e-latest.json`、`drills/artifact-e2e-20261109121408-78609938/`、`logs/artifact-e2e-*.log`。

## 12. 启用 / 停用

### 当前实际状态

- `ila3-auto-deploy-check.timer`：**enabled/active**，只读检查，每 5 分钟。
- `ila3-auto-deploy.timer` / `ila3-auto-deploy.service` / `ila3-auto-deploy-app.service`：**未安装**。
- 生产 3000 仍由 `mercato.service` 从 `/home/pro/apps/mercato` 提供。
- 自动上线：**未开启**；且当前 HEAD 还没有新格式 CI artifact，生产切换前必须等 push 后的 build-artifact run 成功，或显式使用 `--build-locally`。

### 一键停用（如果以后已启用）

```bash
sudo systemctl disable --now ila3-auto-deploy.timer ila3-auto-deploy.service
# 如果已经切到 release app 服务，恢复旧的生产单元（按需）
sudo systemctl disable --now ila3-auto-deploy-app.service
sudo systemctl enable --now mercato.service
```

### 启用条件

`enable.mjs --enable` 会拒绝，除非同时满足：

1. `gates/latest.json` 的 sha == 当前 HEAD 且 `allow=true`；
2. `drills/latest.json` 的 sha == 当前 HEAD 且两次演练 `passed=true`；
3. `current` release 的 build stamp 与 HEAD 一致；
4. 显式 `--allow-production`（或 `ILA3_ALLOW_PRODUCTION=1`）；
5. 若 `mercato.service` 仍 active，必须显式 `--replace-mercato` 做生产槽切换。

## 13. 回退到现场构建（操作手册）

CI 不可用（run 失败、artifact 过期、GitHub 不可达、digest 缺失）时，**不要绕过校验**，改用显式现场构建：

```bash
# 1) 确认目标 SHA 仍通过 CI 门槛；不通过就不要发布
node scripts/auto-deploy/ci-gate.mjs --sha "$(git rev-parse HEAD)"

# 2) 现场构建并切换（与旧流程相同；生产保护开关照旧）
node scripts/auto-deploy/deploy.mjs --manual --build-locally --sha "$(git rev-parse HEAD)" \
  --allow-production
# 需要替换 mercato.service 占用的生产槽时才加 --allow-replace-mercato
```

回退后的 release `source.method=git-worktree`，后续默认路径仍会尝试 artifact；如果 CI 持续不可用，需要在 timer/服务 unit 的启动参数里显式加 `--build-locally`（当前 unit 模板未加）。

## 14. 已知限制

- **本 commit 尚未 push**：GitHub 上没有新格式 artifact；默认 artifact 路径会因 `artifact-not-found` 拒绝。生产发布前必须先有成功 run，或显式 `--build-locally`。旧 run 的 `next-build-*` 包格式不兼容，不会误用。
- **GitHub artifact 保留 7 天**：超过 retention 的旧 commit 只能现场构建；这是有意的供应链边界。
- **artifact 名称固定为 `mercato-release-<sha>`**：改名必须同步 `artifact.mjs` 的 `ARTIFACT_PREFIX` 与 workflow。
- **manifest 的 `runtime` 必须匹配本机**（linux/x64/Node 24）：跨平台产物会被 `runtime-mismatch` 拒绝；换 Node 大版本需要重建包。
- **依赖仍来自 registry**：包不含 node_modules，生产安装需要访问 `.yarnrc.yml` 配置的 registry（当前 npmmirror）。离线生产无法安装。
- **迁移标记**：`database.migrationRequired` 固定为 `false`，表示发布链路不执行迁移；有 schema 变更时仍需人工按既有流程执行，`deploy.mjs` 不会放行迁移。
- **环境文件**：`.env*` 不入包，安装时从开发目录复制。轮换密钥后需要重建 release 或手工同步。
- **构建产物路径**：`package-release.mjs` 从 checkout 读取 `.mercato/next` 和 `.mercato/generated`；CI 必须先 `yarn generate` + `yarn build`，否则打包直接失败（build stamp/generate 校验）。
- **候选只验证 HTTP 就绪**：不启动 queue worker/scheduler，不验证后台任务；候选与生产共用数据库，健康检查只发 GET。
- **下载缓存**：`artifacts/<sha>/<runId>/` 只保留最近 2 份（每份约 0.7–0.9 GB），超出自动删除；证据里的下载日志仍保留在 `logs/`。
- **外部依赖 GitHub API**：需要 `actions:read` 权限的 token（`/home/pro/.config/ila3/github-token`）；API 不可达时 artifact 路径拒绝，不会退回现场构建。
- **flock 是进程级**：只覆盖本机同一路径的 `deploy.mjs`；绕过脚本直接改 symlink 不在保护范围。
- **prune 只认 40 位 hex 目录**：artifact 安装的 release 目录同样是 `<sha>`，与现场构建一致；staging（`.staging-*`）与演练目录永不被当成 release 删除。

## 15. 证据索引

| 交付 | 证据 |
| --- | --- |
| 单测 | `node --test scripts/auto-deploy/*.test.mjs`（48/48） |
| CI 门槛拒绝 | `gates/<sha>.json`、`logs/` |
| CI 打包 | workflow run 的 `dist/release-manifest.json`；本地 `node scripts/auto-deploy/package-release.mjs ... --json` 输出 |
| 下载/校验/安装 | `runs/<runId>.json` 的 `release`、`release.json` 的 `artifact` 块、`logs/<runId>-artifact*.log` |
| 候选健康 | `logs/<runId>-candidate.log`、`runs/<runId>.json` 的 `candidate` |
| 切换/回滚 | `runs/<runId>.json` 的 `postSwitch` / `rollback` |
| 产物链失败演练 | `drills/artifact-latest.json`、`drills/<drillRunId>/`、`logs/<drillRunId>.log` |
| 真实产物 e2e | `drills/artifact-e2e-latest.json`、`drills/<drillRunId>/`、`logs/artifact-e2e-*.log` |
| 原有失败演练 | `drills/latest.json` |
| 只读状态 | `node scripts/auto-deploy/status.mjs` |
