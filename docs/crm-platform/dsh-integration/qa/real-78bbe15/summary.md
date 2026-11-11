# 生产 DSH 复验 · release 78bbe15（登录绑定 / 工作区清理）

- 运行 commit：`78bbe155cf3dfd9a442d8edc0604ce766e1e67ee`（v0.2.2，createdAt 2026-11-11T22:45:09.580Z）
- 实例：生产 `http://127.0.0.1:3000`，pid **3247982**，cwd `…/releases/mercato/78bbe15…`
- env：`OM_AI_ENGINE=dsh`、`OM_DSH_AGENTIC=1`、`OM_DSH_PERSIST=orm`、`OM_DSH_SINGLE_INSTANCE=1`
- 总体：**5 PASS / 0 FAIL**

## 逐项判定

| # | 检查 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | 登录即绑定 | **PASS** | 构建产物命中 `ensure-binding-on-login` **45** 个文件；admin 登录 **200**，`dsh_assistant_bindings` **5→5**（已存在 no-op）；journal 无 subscriber 错误。源码：缺失才插入，`23505` 竞争直接 return，其他异常只 `logger.warn`，不抛出（`login-binding.txt`、`source-check.txt`） |
| 2 | 工作区清理 | **PASS** | 造 `workspaces/zz-qa-<ts>/old-run`（mtime 2020）；触发普通聊天 200 且回 `PRUNE_QA_OK`；假目录 **已删除**；测试前真实 run 目录 35 个全部保留（missing=[]），本次聊天新增 1 个 run 目录；父目录已清理。结果：真实 35+fake1=36 → 真实 36+fake0=36（`workspace-prune.json`） |
| 3 | 回归抽验 | **PASS** | UI 文本：`QA78B-UI-MWCPMM4S` 气泡回显，DB run `8eb30451…` completed 同值；停止：长任务停止后 run `25a008c0…` cancelled、`finishReason:"cancelled"`、无 DSH 子进程；撤权：employee UI 长任务，admin revoke 200，UI **138 ms** 停止，run `6194534c…` cancelled、error `qa-ui-revoke-78bbe15`，binding SQL 恢复 active（revision 17）（`ui-text-stop.json/.png`、`ui-revoke.json/.png`） |
| 4 | 文档 §25/§26 | **PASS** | §26 的 45 个构建命中、登录 200、bindings 5→5、无错误日志与实测一致；§25 的假目录删除、真实目录不减少与实测一致。计数口径说明：§25 的 35→35 是“含假目录总数→含新 run 总数”的不变式；本次为 36→36（pre-existing 真实 35 不变，新 run +1，假目录 -1），非夸大（`doc-check.txt`） |
| 5 | 单元测试 | **PASS** | `jest ensure-binding-on-login.test.ts workspace-retention.test.ts --runInBand`：**2 suites / 6 tests 全 PASS**（4 subscriber + 2 retention），1.226 s（`jest.txt`） |

## 调用/路径

- 登录：`POST /api/auth/login`（admin）；计数查询 `select count(*) from dsh_assistant_bindings`。
- 清理测试：`/home/pro/.local/state/ila3-dsh/root/workspaces/zz-qa-<ts>/old-run`（`touch -d 2020-01-01`）→ `POST /api/ai_assistant/chat` → 统计两层 run 目录。
- UI：`/backend` → AI launcher → `customers.account_assistant` → composer；停止按钮；employee 长任务 + admin `POST /api/internal/dsh-bindings/revoke`。
- 单测：release 目录内 `./node_modules/.bin/jest ... --runInBand --no-cache`。

## 未通过项

无（5/5 PASS）。

## 证据文件

`summary.md`、`login-binding.txt`、`source-check.txt`、`workspace-prune.json`、`ui-text-stop.json`/`ui-text-stop.png`、`ui-revoke.json`/`ui-revoke.png`、`doc-check.txt`、`db-check.txt`、`jest.txt`
