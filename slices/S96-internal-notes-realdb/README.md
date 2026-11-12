# S96 · 内部备注：提取读写契约 + 真库验证，并修掉一个 SQL NULL 陷阱

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F3-06；D6 §7-S87。
> 状态：**完成**；一次性隔离库，未触碰生产库。

## 1. 改动

| 文件 | 内容 |
| --- | --- |
| `lib/internal-notes.ts`（新） | `listInternalNotes`（tenant + visibility + 会话 + deletedAt + 组织作用域、升序）与 `buildInternalNoteInput`（纯函数：无发送路径、无 channelMetadata、`sendViaEmail:false`、收件人=作者） |
| `api/me/threads/[id]/notes/route.ts` | 读写改为调用上述；响应形状不变 |
| `lib/org-scope.ts`（新） | `nullInclusiveOrgWhere`：用显式 `$or` 表达“本组织或租户级”；**无组织时只给 `{organizationId: null}`**（租户级），不返回空过滤器 |
| `api/me/dead-letters/route.ts`、`api/me/threads/[id]/messages/route.ts` | 同类过滤器一并修正（见 §2） |

## 2. 真库抓到的第二个真 bug：SQL `IN (…, NULL)` 永远不匹配 NULL

第一版 `listInternalNotes` 用 `organizationId: { $in: [org, null] }`，真库跑出来**租户级备注整条消失**——SQL 里 `IN ('org', NULL)` 不会命中 NULL 行。同一写法还在两处：

- 死信列表（我在 S91b 写的）——租户级死信会消失；
- 会话消息正文投影（既有代码）——租户级消息的正文会变 null。

三处统一改成 `nullInclusiveOrgWhere`（`$or` 形式，与安装包 `channelOrgScopeWhere` 同构），并补 `org-scope.test.ts` 防回归。无组织会话的语义也对齐 hub：只读租户级，不返回空过滤器（否则无组织会话会读全租户）。

## 3. 真库场景（`__tests__/realdb/internal-notes-runner.mts` + `internal-notes-realdb.test.ts`）

隔离库 `/tmp/realdb-s96`、端口 **55437**、trust、仅 127.0.0.1：

```
PASS listing filters tenant/visibility/conversation/deleted/org and keeps ascending order
PASS an organization-less caller sees only tenant-wide notes
internal notes realdb: all scenarios passed
```

第一条断言：只返回本会话、`visibility=internal`、未删除、本组织或 NULL 组织的备注，按创建时间升序（`别的组织`/`公开消息`/`已删除`/`别的会话` 全部排除）。

## 4. 未覆盖（明确写清）

- **hub `messages.messages.compose` 的真实执行未在本片验证**：它需要 messages 整套表结构 + 容器 + 命令总线 + 守卫/事件，超出一次性隔离库的范围。本片证明的是“app 自己写的 SQL 和 compose 输入契约”，不是“命令在真库跑通”。这条仍需在真实测试库里补。
- 死信/消息正文两处修复目前只有单测断言（`$or` 形状），未逐条跑真库；风险低（与已验证的 `$or` 同构），但不写成“已真库验证”。

## 5. 证据

- 带 `P6_REALDB_URL` → 1 passed（1.09s）；不带 → skip
- 全模块无环境变量 → **55 passed / 6 skipped / 328 tests**
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0
- 介质清理：端口 55437 释放、`/tmp/realdb-s96` 删除、无残留 postgres 进程
