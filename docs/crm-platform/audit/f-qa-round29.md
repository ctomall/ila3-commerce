# 独立 QA 复核（第 29 轮）· 三个只读审计 Agent

目标文件要求"独立 QA 复核"。这一轮把第 25–28 轮新增的东西交给三个**独立上下文**的只读审计 Agent（它们看不到我的叙述，只读代码与文档），其中一个被要求"找形同虚设的断言"、一个被要求"构造反例"。

三个 Agent 都没有写仓库（仅 `/tmp` 与允许的只读 GET）；三份报告都已核对，结论如下。

## 一、被抓到的真缺陷（已修）

| # | 缺陷 | 证据 | 处置 |
|---|---|---|---|
| 1 | `canSend` 只绑正文哈希，**换收件人后审批仍放行**（契约却写着"收件人变化即失效"） | 探针：`recipient swapped -> allowed:true`，sendKey 里的哈希换成了 `attacker@evil.example` | `Approval` 增加 `recipientHash`/`channel` 并参与校验；无 `recipientHash` 的旧审批直接拒绝。新增 4 条测试，含变异对照（删掉比较 → 测试红） |
| 2 | 判决链把"已验证邮箱"和"实际收件人"断开：验证 `candidate.email`，发送 `draft.recipientEmail`，中间无人比较 | 探针：候选人 marta@、草稿 attacker@，判决 `sendable` | 新增比较：两者不等 → `blocked`；`bounced`/`complained` 也接入可达性。2 条新测试 |
| 3 | `canSend` 单独使用时放行 `editing`/`ready` 草稿（只拦 superseded/blocked/sent） | 探针：`state=editing -> allowed:true` | 网关自身显式拒绝这两个状态，不再依赖调用方先拦 |
| 4 | 文档说"配额在草稿前**预留**，到 `awaiting_draft` 已占 1 单位"——**假的**：`reserve()` 是纯函数，桶一字节未变 | 探针：`awaiting_draft` 后 `reserved:0, consumed:0` | 文案与文档改为"预算检查，不占额度"；新增一条测试断言桶对象调用前后完全相同 |
| 5 | 演练的 `apply.scope` 只比表数量：**往 `users` 写两行照样 PASS** | 审计 Agent 用"额外切片做 insert into users"复现，18 相全 PASS、exit 0 | 新增**语句静态审计**（48 up/16 down 只允许 `leadgen_*` DDL，禁一切 DML）+ **非 leadgen 目录摘要**（表/列/索引/约束/序列/视图）。两条负向对照：DML → `statements` FAIL 且未建库；`alter table users`/`create table audit_*` → FAIL |
| 6 | 演练报告头无条件写 `dropped afterwards: yes`，失败路径也在撒谎 | `--db open_mercato` 被拒后报告仍写 yes | 报告只写实际发生的事（created/dropped 真实状态），dropdb 失败进失败项 |
| 7 | 演练第一动作是 `dropdb --if-exists`：会删掉同名的库，不问 | 代码审查 | 已存在即拒绝，`--reuse` 才重建；对照：预存库 → 拒绝且库仍在 |
| 8 | `CRM_LEADGEN_MIGRATION_REF=`（空串）静默回落到默认分支 | 对照：空串输出与完全不设一致 | 空串视为配置错误，exit 1 |
| 9 | 用例 2「真实后台页没有原型横幅」在**未登录被弹到登录页**时也全绿（登录页上这些元素 count 都是 0） | 审计 Agent 用匿名 context 照抄断言跑出 `WOULD_PASS=true` | 断言最终 URL 不含 `/login` 且在 `/backend`；`beforeAll` 断言 cookie 非空；匿名用例补 `/`、`/login` 无横幅 |
| 10 | `--assert-clean` 在空库/空输出上 PASS（`Number('')===0`） | 审计 Agent 用 stub psql 复现 | 打印目标库；`dictionaries>0` 下限；计数必须匹配 `^\d+$`；列表行数必须等于计数；stderr 出现 ERROR 即失败。两条 stub 对照：空库 → FAIL，空输出 → 报错 |
| 11 | 清理 SQL 的六项"断言"是裸 SELECT，psql 不会因此失败；UPDATE 命中 0 行仍 exit 0 | 审计 Agent 实测 | 改 `\set ON_ERROR_STOP on` + `DO $$ RAISE EXCEPTION $$`；对照：空转 UPDATE → `ERROR: 仍有 19 行带 CR`、psql exit 3 |
| 12 | 回滚引用已 `ON COMMIT DROP` 的临时表（文档自相矛盾） | 代码审查 | 临时表改 `on commit preserve rows`，回滚在提交后仍可用；逆操作实测把 19 条 CR 加回 |
| 13 | "18 个中文字符 + 1 个 CR"与数据不符（实为 2–7 字符） | 审计 Agent 统计 | 已改正 |
| 14 | ESLint 忽略写成 `**/test-results/**`，会误伤任何同名手写目录 | 审计 Agent 用 `isPathIgnored` 验证 | 锚定到 `.ai/qa/test-results/**` 与 `.ai/qa/playwright-report/**` |

## 二、没有被修、必须承认的（写在文档里，不装）

| 项 | 为什么还在 |
|---|---|
| 配额"预留"的持久化语义 | 需要账本层（配额表未获批）。当前只是预算检查，文档已如实写 |
| 演练会执行评审分支的**模块级代码**（导入即执行），进程有本机权限 | 演练的隔离是"另一个数据库"，不是沙箱。语句审计约束 SQL，不约束任意代码；已写进 `03b` §3.2「这条演练保证不了什么」 |
| ~~变异测试没有做成常设门~~ | **第 30 轮已补**：`scripts/crm-mutation-check.mjs` 成为第 17 道门，7 个变异全部必须被杀，存活或锚点失效都让门红 |
| 生产指纹不含 DML | 指纹是计数 + 非 leadgen 目录摘要；核心表的行级写入只能靠"禁 DML 的语句审计"约束切片，不是靠指纹 |
| 原型横幅的 "ONLY" 只覆盖 `/backend` 与匿名可达的 `/`、`/login` | `/backend/settings` 等内部页尚未逐一断言 |

## 三、结论

三份报告一共给出 6 条精确复现的 P1/P2，全部在当轮修掉并各自配了负向对照（改坏会红）；另有 5 条被明确列为"承认但不修"。修完后：单元 **14 suites / 143 tests**，全量门禁 **16/16 PASS · 0 SKIP**。

## 第 36 轮复核（五道门 + verify-all）· 已修与未修

第二个独立 Agent 构造了 20+ 个状态，证明"五道门都有 exit 0 但结论错的路径"。**已修**：

| # | 缺陷 | 修法 | 对照 |
|---|---|---|---|
| D1 [P0] | 变异门把**任何非零退出**当"测试抓到"；yarn 不在 PATH 时 7/7 全 PASS | 先断言测试文件存在；ENOENT / 编译错 / 超时一律 INVALID；只有输出含 jest 失败标记才算 killed | 无 yarn → `killed 0 · invalid 7` → exit 1；正常 → 7 killed |
| D7 [P0] | 两个变异门并发会写坏工作树 | `.mercato/mutation.lock` 独占锁（15 分钟视为过期） | 第二个实例直接 exit 1 |
| D8 [P1] | `--only` 拼错 → 0 个门运行 + exit 0 | 至少匹配 1 个门，否则报错并列可用 id | 拼错 → exit 1 |
| D9 [P1] | PASS 只看退出码，脚本打印 FAIL 但 exit 0 被记"通过" | 输出含 `RESULT: FAIL` 即判失败 | 假门 `RESULT: FAIL` + exit 0 → 计 FAIL |
| D3 [P1] | `build.mjs` 先写时间戳再构建，失败也留着 → 旧 dist + 新记录 = PASS | 时间戳带 `status`（building/ok/failed）；门拒绝非 ok；且要求产物目录存在 | 伪造 failed 戳 → exit 1 |
| D4/D5 [P1] | 拿不到 systemctl 仍宣称"进程晚于构建"；本地时间被按错误时区解析 | 缺启动时间直接判 FAIL；改用 `--timestamp=unix` 的 `@epoch` | 真实服务 → PASS；解析失败时该分支曾实测 exit 1 |
| D10 [P1] | contract 在线上不可达时跳过碰撞检查，仍宣称 "no collision" | 不可达即 FAIL；OK 行改为 `collision check NOT RUN` | 不可达 → exit 1 |
| D11 [P1] | `$ref` 请求体绕过"body 不得带 tenantId" | 解析 `$ref` 后再查 | `$ref` + tenantId → FAIL |
| D12 [P1] | restore 的 dump 在 /tmp 权限 0644，SIGKILL 后残留 | 写 0600；SIGINT/SIGTERM 清理 | 运行结束无残留 |

**未修，仍开着**（写在 `backlog` 与本节，不当已解决）：

| # | 缺陷 | 现状（本轮复核） |
|---|---|---|
| D16 | contract 注释声称"跨租户读 404 而非 403"，代码里没实现 | 仍开着。leadgen API 路由本身还没落地（M5 阻塞），404/403 语义无对象可挂；契约注释已标注为"待实现规则"，不当作已实现 |
| D20 | `build-info.json` 未跟踪未签名，改一个字段就能翻转结论 | 部分缓解、仍开着。第 9850c70 起记录带 `treeDigest`（373 个运行文件的 sha256），只改 `status`/`commit` 而不同步改内容已会红；有写权限的人仍可连摘要一起伪造，未签名的事实没变 |

**已修，逐条带反向证据**（第 37–45 轮补记，覆盖此前"未修"表里的过时条目）：

| # | 缺陷 | 修法 | 反向证据 |
|---|---|---|---|
| D2 | 内容比对只对 mtime 晚于构建的文件生效，回拨 mtime 即绕过 | 构建时记录运行树内容摘要，门重算后比对 | 回拨 mtime → 仍红（`treeDigest` 不符） |
| D6 | SIGKILL 后源码留在变异态，备份写了从不读取 | 下次运行先读备份恢复，再删 | 人为留下变异态 → 恢复后门才继续 |
| D13/D14/D15 | nav-nesting 只比 href 集合，`parent`/`title`/`group`、挂错父级、roots 漂移都不红 | 改比 `href\|parent\|title\|group` 记录，roots 数变动即红 | 改任一字段 → 红（`95a18ff`） |
| D17 | `postcss.config.*` 在运行时模式里但不被扫描 | 已在 `RUNTIME_ROOT_FILES` 并计入 `treeDigest` | 本轮实测：给 `postcss.config.mjs` 追加一行 → 门 exit 1；还原 → PASS |
| D18 | restore 只比表数与 6 个行数：丢索引/FK/sequence、值损坏都 PASS | 结构比对（4076 列 / 1027 索引 / 3005 约束 / 53 序列 / 触发器 / 视图）＋ 探针表整表内容摘要；比对器每次运行先做 4 项反向自证 | 删一个真实 UNIQUE 约束 → 点名索引与约束；行数 3→3 但改一行 → 内容摘要不同被判红 |
| D19 | `source.guard` 无条件 PASS | 改为比较演练前后源库指纹 | 源库变动 → FAIL（`e0356f3`） |
| D21/D22 | verify-all 的 PASS 行 note 恒空、报告不记录工作树脏 | PASS 行写门禁自己的摘要行；报告头记工作树状态；`--require-clean` 脏树即失败 | 本轮实测：脏树 + `--require-clean` → exit 1，报告头写"**脏**（7 项未提交…）" |

关掉之后的复核运行：`verify/verify-2026-11-09T02-09-05.md` — `--full --require-clean --require-no-skip`，21/21 通过、0 跳过、工作树干净、退出码 0、提交 `f243c3b`（此前的 `01-58-45`/`02-03-59` 两次是同参数的中间运行，后一次起于脏树因此按新规则自带"脏"标记）。每一行都带该门禁自己的观测（如 `m4-harness` 的 `pass 5 · pass-weak 2 · fail 0 · blocked 4 · invalid 1`、`restore-drill` 的 `columns 4076 / indexes 1027 / constraints 3005 / sequences 53`）。

顺带暴露的一处口径不实：`i18n-hardcoded` 门描述写着"没有绕过 i18n 的硬编码文案"，实际证据是 `advisory: 153 findings in 294 files`（0 error）。门本身没变，**描述已改成它真正证明的东西**——否则那一行就是在借一个它没做到的说法通过。
