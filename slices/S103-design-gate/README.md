# S103 · 设计系统门禁：清掉本任务新增的 56 条告警（模块内新增归零，基线 16 条留档）

> 背景：`AGENTS.md` 的 Validation 含 `yarn ds:check`，但 S85–S102 只跑了 generate/typecheck/lint/test/realdb/build，**没跑设计系统检查**。2026-11-13 补跑：仓库整体本就红（298 条，来自他人文件），本次只对自己的模块做归属，并把**本任务新增**的告警清零。
> 状态：模块内**新增 0 条**；全仓仍红且不归因于本任务；构建门禁仍 BLOCKED（S101）。

## 1. 归属：先量基线，再谈新增

```
git worktree add --detach /tmp/dsbase 00e2e4e^   # S85 之前的提交
cd /tmp/dsbase && node scripts/ds-check.mjs       # 基线
cd /home/pro/apps/mercato && node scripts/ds-check.mjs
```

| 口径 | 模块内 findings | 说明 |
| --- | --- | --- |
| 基线（`00e2e4e^`） | **16** | `InboxView.tsx` 13（6 palette + 4 arbitrary + 3 dark）、`ReplyComposer.tsx` 3（palette） |
| 修复前（S102 后） | **72** | 本任务新增 **56** |
| 修复后（本片） | **16** | 新增 **0**；剩余 16 条与基线逐条同位置 |

新增 56 条的分布（修复前）：

| 文件 | 新增 | 构成 |
| --- | --- | --- |
| `channels/ChannelsView.tsx` | 33 | 19 `raw-backend-table` + 10 `hardcoded-palette` + 3 `manual-dark-override` + 1 `arbitrary-tailwind` |
| `exceptions/ExceptionsView.tsx` | 11 | 8 palette + 3 dark |
| `inbox/InboxView.tsx` | 5 | 「账号不能完整收发」提示条的 palette + dark |
| `inbox/InternalNotes.tsx` | 4 | 3 palette + 1 dark |
| `inbox/CustomerLink.tsx` | 3 | 2 palette + 1 dark |

## 2. 怎么改的（都是仓内既有约定，没有新增依赖）

1. **palette → 状态令牌**：`border-status-success-border bg-status-success-bg text-status-success-text`、`…status-warning…`；错误文本用 `text-destructive`。语义令牌自带深色值，`dark:` 覆盖一并删除。
2. **`max-w-[18rem]` → `max-w-72`**（18rem 就是 scale 里的 72）。
3. **手写 `<table>` → 共享 `DataTable`**：从 `@open-mercato/ui/backend/DataTable` 引入，7 列（平台账号/身份/归属/状态/可收/可发/操作），chip、hint、重连/解绑按钮放进 `cell`；不传 `perspective`（该 prop 可选，未传时 perspectives 机制自动关闭），不改变页面行为。
   - 依赖前提已核对：`DataTable` 内部用 react-query，而 `src/components/AppProviders.tsx` 在应用根部已挂 `QueryProvider`，不会出现 “No QueryClient set”。
4. **基线 16 条不动**：都是收件箱分栏布局必需的 `h-[calc(100vh-9rem)]`、`min-h-[560px]`、`w-[400px]`、`max-w-[85%]` 与既有红/琥珀提示色。改它们要动布局或加忽略条目，超出本任务范围，且当前构建门禁阻塞、无法用构建验证视觉回归——留档，不静默忽略。

## 3. 证据（可复跑）

```bash
# 1) 模块归属：应为 16 条，且全部落在基线两个文件
node --input-type=module -e "
import { scanDesignSystem } from './scripts/ds-check.mjs'
const res = scanDesignSystem(process.cwd())
const ours = res.findings.filter(f => f.file.startsWith('src/modules/communications/'))
console.log(JSON.stringify({ totalFindings: res.findings.length, staleIgnores: res.staleIgnores.length, ours: ours.length }, null, 2))
"
# -> {"totalFindings":298,"staleIgnores":4,"ours":16}

# 2) 改动文件 lint / 类型 / 模块测试
npx eslint src/modules/communications/backend/communications/{channels/ChannelsView.tsx,exceptions/ExceptionsView.tsx,inbox/InboxView.tsx,inbox/InternalNotes.tsx,inbox/CustomerLink.tsx}   # exit 0
yarn typecheck   # exit 0
npx jest src/modules/communications   # 57 suites passed / 334 tests passed / 9 skipped
```

全仓 `yarn ds:check` 仍 **exit 1**：298 条 findings + 4 条 stale ignore，分布在 `src/modules/system_update/**`、`src/modules/example/**`、`src/modules/ai_model_config/**`、`vendor/**` 等他人/基线文件——本片未触碰，也不当成自己的通过。

## 4. 边界

- 未新增/修改 `.ds-check-ignore`（不靠忽略条目刷绿）。
- 未改依赖、未改构建配置；`DataTable` 是仓内已装的共享组件。
- 因构建门禁 BLOCKED（S101），本次**没有**构建或浏览器级视觉验证；只声称「设计系统扫描新增归零 + lint/typecheck/模块测试通过」。
