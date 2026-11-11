# 独立 QA 证据归档（2026-11-11）

原始临时目录位于 `/tmp/reverify-loop/real-<release>/`；这里只归档摘要与关键 JSON/TXT，
不复制大体积 SSE/截图（仓库另有 `../evidence/` 保存关键 SSE/截图）。

| release | 轮次重点 | 判定 | 归档文件 |
| --- | --- | --- | --- |
| `fb8f6fc` | 工具面/真实模型/工具/双员工/撤权/文档 | 6 PASS / 1 FAIL（文档，已修） | summary、dump、db |
| `5113ec9` | 默认入口/会话过滤/回归/双员工隔离 | 5/5 PASS | summary、default、filter、isolation |
| `9983638` | 工具卡/写拒绝/并发/回归/文档 | 5/5 PASS | summary、toolcard、write-denied、concurrency |
| `78bbe15` | 登录即绑定/工作区清理/回归/单测 | 5/5 PASS | summary、login-binding、workspace-prune、jest |
| `07112a6` | UI 桥重试幂等/新轮次/回归/源码 key | 5/5 PASS | summary、retry-idempotency、key-check |

说明：QA 是独立 agent，只读生产并执行验收所需聊天/绑定时恢复；其结果不替代本目标 complete 判定。
