# OpenCode → DSH 迁移收口状态（2026-11-16）

> 本文只记录已发生的事实与证据路径；验收口径仍以 `QA-SIGNOFF.md` 为准。

## 结论

- 生产聊天/agent 入口全部由 DSH 服务；本机没有可运行的 OpenCode server。
- 回退方式已从“切回 OpenCode”改为“回滚 release”（`scripts/crm-rollback.mjs`，默认 dry run）；
  `OM_AI_ENGINE=dsh` 同时注入 systemd，回滚到旧 release 不会丢开关。
- 本次收口做完了三件事：把引擎开关固化进部署配置、把 canary 文件降级为历史、
  在编排文件里把 OpenCode 服务标注为废弃并复验真实模型链路。

## 1. 配置固化

| 项 | 位置 | 说明 |
| --- | --- | --- |
| `OM_AI_ENGINE=dsh` | ① `/home/pro/apps/mercato/.env`（部署时复制进每个 release）② `dsh-runtime.env`（systemd 注入） | 双写：systemd 那份保证回滚到任何旧 release 仍走 DSH；`.env` 那份让应用自身与开发环境可见。`.env` 不进 git，属于部署配置 |
| `OM_DSH_*`（含 run-token secret） | `/home/pro/.local/state/ila3-dsh/dsh-runtime.env`（0600, owner pro） | 由 systemd drop-in `20-dsh-runtime.conf` 注入，secret 不落 `.env` |
| 历史开关文件 | `canary.env.history-20261116` | 仅存档；systemd 不再引用 |

变更前的备份：`.env.bak-dsh-env-<ts>`（app 与当前 release 各一份）、`canary.env.bak-<ts>`、
`20-dsh-canary.conf.bak-<ts>`。

## 2. 复验证据

- 重启用时：`healthz` 200，11s。
- 真实模型公开入口探针：`PASS`，release `3f109755`，run `c3b4bc83…` 落库并 `completed`；
  证据 `evidence/public-chat-path-2026-11-16T07-45-45-683Z.json`。
- 探针校验项：HTTP 200、SSE content-type、`dsh.event` 帧、text 帧、done 帧、
  run 持久化、run 与 session 绑定、run completed。
- 入口覆盖复核（同一 release，2026-11-16T07:47Z）：
  - `GET /api/ai_assistant/health` → `{"status":"ok","engine":"dsh","healthy":true}`（health 重写生效）；
  - `GET /api/ai_assistant/ai/agents` → 200，`aiConfigured: true`，9 个 agent（agents 包装生效）；
  - `GET /api/ai_assistant/ai/conversations` → 200，返回本人会话（conversations 重写生效）；
  - `POST /api/ai_assistant/ai/chat`（agentic）→ `PASS`，run `de74b357…` 落库并 `completed`，
    证据 `evidence/agentic-chat-path-2026-11-16T07-47-47-249Z.json`。
- 容器侧：`docker ps` 无 opencode 容器；`docker compose config --services` 默认只有
  redis / meilisearch / postgres，opencode 仅在 `--profile agents` 下出现；生产由 systemd
  直接运行应用，不经过 compose。

## 3. OpenCode 残留（有意保留，非可用路径）

- 包内 `createOpenCodeClient()` / `handleOpenCodeMessageStreaming()` 仍是包路由的默认分支；
  业务 `src/` 不再直接调用，由 `src/proxy.ts` 在 `OM_AI_ENGINE=dsh` 时旁路。不改 `node_modules`。
- `docker-compose.yml`、`docker-compose.fullapp.yml` 的 `opencode` 服务已标注 `DEPRECATED`：
  生产不启动，即使启动也不会恢复旧聊天路径（代理重写优先）。
- `.env` 中 3 个空的 `OPENCODE_*` 占位已在 2026-11-16 注释掉；包内仅 `opencode-client` / `opencode-handlers` 读取 `OPENCODE_URL` / `OPENCODE_PASSWORD`，而这两个模块位于被代理旁路的包路由之下，生产不可达。

## 4. 仍存在的缺口

| 缺口 | 影响 | 处理建议 |
| --- | --- | --- |
| `answerQuestion` 在 DSH 路径返回 501 | UI agentic 路径不使用，业务无感 | 若未来要支持“向用户提问”，在 DSH 事件协议里补 question 回环 |
| `OM_DSH_SINGLE_INSTANCE=1` | 多实例部署前必须去掉，否则 pre-boot 收口可能误伤兄弟实例 | 扩容前改造 |
| 真实员工日常使用尚未开始 | `dsh_runs` 仍以演练/测试为主 | 安排一名真实员工用一周，观察长会话工具卡超时 |
| T7 包内硬编码、T8 导航合并 | 产品决策项 | 产品/IA 定夺 |

## 5. 回退

```bash
node scripts/crm-rollback.mjs            # dry run，目标 = previous
node scripts/crm-rollback.mjs --apply    # 换 symlink + 重启（实测 19.1s 恢复）
```

## 6. 发布验证（2026-11-16T08:26Z）

- 推送 `4f397102` 后 CI `build-artifact` 成功（8.7 分钟），自动部署 `deploy-20261116082308-4f397102` 结果 `deployed`，9 个步骤全 ok（含 `switch`、`candidate-health`、`queue-carryover`）。
- 新 release 的 `.env` 自动带上 `OM_AI_ENGINE=dsh`（`copyEnvFiles` 从 app 目录复制），进程环境同样可见——固化在发版路径上生效。
- 新 release 复验：公开入口探针 `PASS`，run `a0626f27…` 落库并 `completed`；
  证据 `evidence/public-chat-path-2026-11-16T08-26-50-651Z.json`。
- 外网：`/login` 200（2.7s）、`/start` 200（4.2s）；回滚点 `previous` 指向 `3f109755`。
