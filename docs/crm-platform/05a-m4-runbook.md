# M4 执行手册 · 双员工隔离 PoC

> 这份手册是**给"批准之后第一次执行"用的**，不是设计文档（设计见 `05-security-poc.md`）。
> 现在不能执行的原因只有两个：**M4 路线未定**、**每员工 DSH 运行时尚未搭**。

## 0. 前置检查（缺一项就停，不要边做边补）

| # | 检查 | 命令 | 期望 |
|---|---|---|---|
| 0.1 | 两片迁移已应用 | `psql "$DATABASE_URL" -c "\dt leadgen_*"` | 16 张表 |
| 0.2 | 服务健康 | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login` | 200 |
| 0.3 | 两个员工可登录 | `node scripts/crm-security-probe.mjs` | 14/14 as expected |
| 0.4 | 路线已选定 | 人工确认 A（关工具）或 B（改上游） | 记录在 `03-dsh-contract.md` §3.5 |
| 0.5 | 当前护栏全绿 | `node scripts/crm-verify-all.mjs --full` | 10/10 PASS |

任何一项不满足 → 停下来修，不要在 PoC 里顺手改业务代码。

## 1. 建 fixture（可回滚，逐条记录）

| # | 对象 | 做法 | 回滚 |
|---|---|---|---|
| 1.1 | 员工 A | 复用 `employee@acme.com`（已存在，117 功能点） | 无需回滚 |
| 1.2 | 员工 B | 复用 `admin@acme.com` 或新建 `poc-b@acme.com` | 新建的删用户 + 删其会话 |
| 1.3 | 助手 1（A 用） | `crm.lead_researcher`，工具集 = {读公司详情} | 删绑定 |
| 1.4 | 助手 2（B 用） | 同一 agent 定义，**独立绑定**，独立 DSH profile | 删绑定 + 删 profile 目录 |
| 1.5 | CRM 只读工具 | 一个：`GET /api/customers/companies/{id}` 包装成 tool | 删 override |

**每建一条就把 id 写进 `poc/<日期>/fixtures.md`**，否则回滚会漏。

## 2. DSH 隔离（每员工一套）

```
/var/lib/dsh/employees/<employeeId>/
├── profile/          # 独立浏览器 profile（cookie/localStorage 不共享）
├── data/             # 会话/记忆/产物根目录
├── credentials/      # 该员工自己的渠道凭据（0600）
└── logs/
```

| 规则 | 检查方式 |
|---|---|
| 不共享 profile | 两个目录里 `ls profile/Cookies` 各自存在，且 `md5sum` 不同 |
| 不共享 data | A 的目录 `grep -r "<B 的用户 id>"` 命中 0 |
| 不共享凭据 | 权限 0600，且 A 的 credentials 里没有 B 的 token |
| 启动参数 | 每个实例显式 `--profile-dir` 与 `--data-dir`，不允许默认路径 |

## 3. 逐维验证（顺序执行，每步留证据）

| 维度 | 命令/操作 | 通过判据 | 证据 |
|---|---|---|---|
| 会话 | 把 A 的 cookie 放进 B 的上下文请求 | 401 或跳登录，且不返回 A 的数据 | 状态码 + 截图 |
| 任务 | B 用 A 的 runId 调接口 | **404** | 状态码矩阵 |
| 文件 | `ls /var/lib/dsh/employees/A/data` 后 grep B 标识 | 0 命中 | 目录清单 + grep 输出 |
| 记忆 | A 的助手检索 B 的历史 | 空结果 + 审计行 | 响应 + 审计 |
| 凭据 | A 的助手用 B 的渠道发送 | 被发送身份门拒绝 | 拒绝原文 |
| 浏览器态 | 导出两 profile 的 cookie | 互不含对方会话 | 两段导出对比 |
| 插件权限 | 每用户/实例全局/高权限各一个样本 | 高权限只对授权员工可见 | 可见性矩阵 |

## 4. 对抗用例（脚本化，别手敲）

```bash
node scripts/crm-m4-harness.mjs --out docs/crm-platform/poc/$(date +%F)-m4
```

当前基线：**6 pass / 0 fail / 4 blocked / 1 invalid**。

- `1.1` 必须从 invalid 变 pass（需要 leadgen API）
- `4`–`7` 必须从 blocked 变 pass（需要 DSH 与 probe tool）

**判读规则**：`fail` 才是失败；`blocked`/`invalid` 是覆盖缺口，**不计入 M4 通过**。
另外 `1.4`（会话列表）在还没有任何会话时只能算弱证据——一旦有会话，必须再多跑一次。

## 5. 撤权时序（必须按序演示并录像/截图）

```
T+0s     revoke A 的绑定（或收回 leadgen.candidates.review）
T+0..10s 在途 Run 收到 principal.revoked → 停止调度
T+10s   A 的工具调用 → 403（agent_features_denied / tool_features_denied）
T+10s   A 尝试完成候选入库 → 拒绝（绑定非 active）
T+30s   审计可查：撤销时间、受影响 Run、被拒调用
```

## 6. 失败即停

| 现象 | 处置 |
|---|---|
| 任一对抗用例 `fail` | 停止 PoC，修完再重跑全部 |
| 隔离某一维可穿透 | 立即关停该员工的助手与 Bot 绑定，记录穿透路径 |
| 撤权 10s 内未生效 | 视为不通过；检查是否只在校验会话而未逐次鉴权 |
| 需要绕过手段才"看起来通过" | 不接受：隐藏按钮/前端拦截都不算隔离 |

## 7. 回滚

1. 撤销两个绑定（置 `revoked`），Bot 绑定置 `offboarded`。
2. 删除 `/var/lib/dsh/employees/<id>` 两个目录。
3. 删除新建用户（若 1.2 建了）。
4. 跑 `node scripts/crm-security-probe.mjs` 确认回到基线。
5. 在 `poc/<日期>/` 留一份"做了什么、删了什么"的记录。

## 8. 通过时交付什么

| 文件 | 内容 |
|---|---|
| `poc/<日期>/matrix.md` | 11 条用例状态，0 fail |
| `poc/<日期>/fixtures.md` | 建了哪些对象、id、回滚状态 |
| `poc/<日期>/isolation/` | 7 维各自的命令输出 |
| `poc/<日期>/revocation.txt` | 撤权时序的时间戳与响应 |

没有这四份，就不算 M4 通过——**截图不算，命令输出才算**。
