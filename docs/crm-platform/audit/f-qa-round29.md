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
| 变异测试没有做成常设门 | QA 用 14 个变异测出 7 个存活；已补关键断言（approve 必须到 sendable、配额多层余量、ready 状态、正文变更链路、收件人绑定），但"变异门"仍是待办 |
| 生产指纹不含 DML | 指纹是计数 + 非 leadgen 目录摘要；核心表的行级写入只能靠"禁 DML 的语句审计"约束切片，不是靠指纹 |
| 原型横幅的 "ONLY" 只覆盖 `/backend` 与匿名可达的 `/`、`/login` | `/backend/settings` 等内部页尚未逐一断言 |

## 三、结论

三份报告一共给出 6 条精确复现的 P1/P2，全部在当轮修掉并各自配了负向对照（改坏会红）；另有 5 条被明确列为"承认但不修"。修完后：单元 **14 suites / 143 tests**，全量门禁 **16/16 PASS · 0 SKIP**。
