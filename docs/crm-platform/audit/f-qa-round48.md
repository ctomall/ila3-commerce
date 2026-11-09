# 独立 QA 复核 · 第 48 轮（两个只读 Agent）

> 触发原因：第 45–47 轮给验证体系加了约两千行（恢复演练结构比对、报告逐门证据、每员工 profile 派生与落盘、5 条变异），**期间没有任何第三方看过**。本轮请两个只读审计员分头查：A 查"比对器/派生库内部是否正确"，B 查"报告与文档是否夸大"。全程只读，未改任何文件。
>
> 两人合计报 **18 条**（A：P1×3 + P2×8；B：P1×3 + P2×4）。P0 为 0。下面逐条给处置，**修了才算修了**，没修的老实写"仍开"。

## 本轮已修（12 条）

| # | 级别 | 缺陷 | 修法 | 反向证据 |
|---|---|---|---|---|
| A-P1-1 | P1 | `--only` 子集运行的报告与全量无法区分；未选中的门直接 `continue`，不记 SKIP，`--require-no-skip` 因 skip=0 放行 | 报告标题写"子集验证结果（不是全量）"、头部写 `范围：仅 <ids>（N/22 道门）`；`--only` 与 `--require-clean`/`--require-no-skip` **同用即拒绝** | `--only patches --require-clean` → exit 1 并打印"子集运行不是发布级证据" |
| A-P1-2 | P1 | 内容比对（`rowDigest`）**从未自证会红**：四次注入全是结构差异 | 自证里加真实数据：A/B 各插 3 行 → 摘要必须相同；改 B 一行（行数不变）→ 摘要必须不同；删一行 → 行数必须不同 | 自证 10 项，含 3 项内容项；顺序上先跑内容再注入结构差异（否则加列会改 `t::text`） |
| A-P1-3 | P1 | `materializeProfile` 用未校验的 `policyVersion` 拼路径，`../..` 可逃出 root 并对解析目标 `chmod` | 身份段走 `^[a-z0-9][a-z0-9._-]{0,63}$`；落盘前 `path.resolve` 断言仍在 `profiles/<key>` 内；`profileKey` 必须 32 位 hex | 单测 `refuses a policy version that could escape the profile root`（`../../../../..`、`../etc`、`/etc`、`pv/../..` 全部抛错） |
| A-P2-4 | P2 | `git status` 读不到时 `--require-clean` 反而通过 | 未知状态在 `--require-clean` 下按"不干净"处理，报告写"**无法判断**" | 逻辑分支：`treeDirty = dirty || (unknown && REQUIRE_CLEAN)` |
| A-P2-5 | P2 | `triggers`/`views` 既未自证、生产里又恒为 0（0==0） | 自证 DDL 加 1 个视图 + 1 个触发器，并各注入一次差异 | 自证 10 项，含"丢视图 → 点名 views"与"丢触发器 → 点名 triggers" |
| A-P2-6 | P2 | 结构指纹漏字段：numeric 精度、生成列、序列参数/OWNED BY | 列补 `numeric_precision/scale`、`is_identity`、`is_generated`、`generation_expression`、`collation_name`；序列改 `pg_sequences` + `pg_depend` 带 start/increment/边界/cycle/OWNED BY | 演练 `compare.catalog` 仍与源库一致（4076 列 / 1027 索引 / 3005 约束 / 53 序列） |
| A-P2-7 | P2 | 空表让 `rowDigest` 抛错，调用方"两侧都是 0 行"的分支是死代码 | 空表返回 `{digest:null, skipped}` 交调用方判红 | 分支可达：调用方把 `digest===null` 直接计入 mismatch |
| A-P2-8 | P2 | `pg_restore` 非零退出被"stderr 任意一行含 text search"整体降级 | 逐行过滤：忽略白名单后仍有 `error` 行即失败 | 演练仍 PASS（本轮无真实错误），逻辑上不再是整段正则 |
| A-P2-9 | P2 | 跨用户拒绝被 0700 祖先决定，阳性对照放错层级，且只断言 A | `profiles/` 显式 0711（可穿越、不可列举）、员工目录 0700；控制文件移到 `profiles/control.txt`；A、B 都断言 | `probe-reads-same-level` PASS + `stranger-denied:employee`/`stranger-denied:admin` 均 Permission denied |
| A-P2-10 | P2 | `tools==runtime` 是自证循环（`grantedTools` 与 `assistantTools` 传同一份） | 新增 `ceiling-truncates`：上限取前 10 个，工具集必须只剩 10 个，其余记为 `not-in-assistant-ceiling` | 门输出该条 PASS |
| B-P1-2 | P1 | m4-harness 声称"断言零写入"，实际只打印；`psqlCount` 写死本机路径，读不到时 null 也 exit 0 | 计数为零写入进 `writeProblems`：null 或变动都失败；路径改 `path.resolve(__dirname,'..')` | 跑一次：`[m4] zero-write: confirmed`；改坏路径时实测 `FAIL 无法读取…` → exit 1 |
| B-P1-3 | P1 | 报告不记发布级开关，开关触发时汇总仍写 FAIL 0 | 头部记 `参数：…`、`发布级：是/否`；汇总行加 `发布级门禁：PASS/FAIL`；`--require-no-skip`/`--require-clean`/人工改动都进同一结论 | 报告头新增三行（flags、开始/结束工作树）；子集与发布级开关同用直接 exit 1 |

## 仍开（6 条，已登记，不当已解决）

| # | 级别 | 缺陷 | 为什么不这轮修 / 下一步 |
|---|---|---|---|
| B-P1-1 | P1 | 契约与 linter 注释声称"跨租户读 404 而非 403 已被强制"，实际无检查（D16） | **已改口径**：openapi 描述与 linter 头注释都改为"计划规则，本 linter 不校验"。真正的检查要等路由存在；D16 仍开 |
| B-P2-1 | P2 | 两个 fixture 写死 `false`，blocked 不是测量结果 | **已改标注**：matrix 里这两项显示"**未探测（写死 false）**"。真探测需要第二组织/每员工运行时 |
| B-P2-2 | P2 | `m4-harness` 那行记"通过"，但 5/12 未执行 | **已改 `why`** 与证据行，写明"可执行部分无 fail；blocked/invalid 不计入通过"。是否把该行状态改成"部分覆盖"需改门禁语义，留作决策 |
| B-P2-3 | P2 | case 1.4 的 judge 不比较 `item.ownerUserId` 与当前员工 | 当前会话列表为空，改动无法被真实数据验证；等有会话后再改，否则是"没数据也判强" |
| A-P2-11 | P2 | 门自己写 tracked 文件，"干净"只描述启动瞬间，下次 `--require-clean` 会因上次输出误红 | **部分修**：结束时再取快照，把"门产物"与"人工改动"分开记，`--require-clean` 下人工改动即失败。彻底修是把产物移出 git（需改文档站/README 引用） |
| 附注 | — | `README.md:54`、`traceability.md:76` 仍写 21/21；`backlog.md:105` 的 dump 大小过期 | 过期数字，下一轮随文档一起校准 |

## 两人都确认没问题的点（避免重复审）

- `rowDigest` 的 `maxRows` 超限返回 `digest:null`，调用方**没有**当成相等（直接计 mismatch）。
- schema 名归一化不会掩盖真实差异：真实演练两侧都是 `public`，同向替换是保等式变换。
- `--require-clean` 的快照确实在门循环之前取（跨次问题即 A-P2-11，不在本次运行内）。
- `diffFacts` 是逐类全集合相等，不是只比计数。
- 不比 CHECK 谓词文本是刻意且正当的（deparse 往返会改写等价表达式）。
- 列序用 `row_number()` 排行号，正确处理源库 attnum 空洞。
- 5 条 profile 变异锚点各自唯一；变异门不会把"没跑测试"计成击杀。
- `dsh-profile` 门在 sudo 不可用 / 角色不足时会红，不是 SKIP；`denied` 只认 `Permission denied`。
- 变异门新增的唯一性校验：这条是**我自己在第 49 轮自查发现**的（锚点重复会改成注释），已一并修掉。

## 第 50 轮追补：又关掉两条

| # | 级别 | 原缺陷 | 本轮处置 | 证据 |
|---|---|---|---|---|
| B-P2-1 | P2 | 两个 fixture 写死 `false`，blocked 不是测量结果 | 改成真探测：`second-organization` 读 `organizations` 行数（现为 1 → 无）；`dsh-profile-per-employee` 检查 `DSH_PROFILE_ROOT` 且目录存在（现无 → 缺）。matrix 的说明写明"probed"与探测方式 | matrix 第 30–31 行 |
| B-P2-3 | P2 | case 1.4 的 judge 不比较 `item.ownerUserId` 与当前员工，空列表与"全是自己的"都无法区分 | judge 改成与 `context_whoami` 解析出的真实 `userId` 比较；空列表记弱，非空必须逐个相等；`http()` 允许按需放大响应上限（200 字符装不下列表） | 本次 `PASS-WEAK #1.4 — 200 {"items":[],"nextCursor":null}`；若将来出现他人会话，该用例会红 |

改这一条时我自己写错过 URL（少写 `/api`），`1.4` 立刻从弱通过变成 404 HTML 失败——门红了才发现。**改完必须重跑，不能只看 diff。**

仍开：D16（无路由可挂）、`dsh-profile-per-employee` 运行时、m4 那行的"部分覆盖"语义、门产物写在 git 里、过期数字。
