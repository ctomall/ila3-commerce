# 设计令牌三层模型（T10）

## 现状基线（2026-11-05 审计）

| 指标 | 数值 | 采集方式 |
|---|---|---|
| `globals.css` 行数 | 1 156 | — |
| 声明令牌数 | 366 | 解析 `--name:` 声明 |
| 含 `.dark` 覆盖 | 147 | 按块归属统计 |
| 构建产物中被引用的令牌 | 480（含 Tailwind 内部变量） | 扫描 `*.css` 中的 `var(--x)` |
| **产物中零引用的声明令牌** | **187** | 声明集合 − 产物引用集合 |
| 组件层违规（非语义令牌） | **0** | `scripts/check-token-layers.mjs` |

> 注意：只看源码 `var()` 会误判。Tailwind 工具类编译后才产生 `var()`，
> 所以「死令牌」必须用**构建产物**判定，源码口径（199）会高估。

## 三层定义

| 层 | 例子 | 谁可以用 |
|---|---|---|
| L1 primitive | `--color-blue-600`、`--space-4`、`--font-size-overline` | **只有 CSS 文件内部** |
| L2 semantic | `--background`、`--border`、`--muted-foreground`、`--primary`、`--radius` | 组件 / 页面 |
| L3 component | `--table-row-height`、`--z-index-modal` | 声明它的那个组件 |

当前 L2 白名单（`scripts/check-token-layers.mjs` 中的 `SEMANTIC`）：
`background / foreground / border / input / ring / card / popover / muted / accent /
primary / secondary / destructive / radius / brand-violet / brand-lime / text-disabled / sidebar*`

## 强制手段

```bash
yarn tokens:audit      # 审计：声明数、死令牌、产物引用
yarn tokens:check      # 检查组件层是否只使用语义令牌（--strict 会非零退出）
```

`tokens:check --strict` 已接入 `yarn build`：**组件新增非语义令牌会直接构建失败**。

## 迁移计划

| 步骤 | 内容 | 验收 |
|---|---|---|
| 1（已完成） | 审计 + 分层定义 + 构建闸门 | `tokens:check --strict` 通过，基线 0 |
| 2（已完成） | 清理死令牌 | 删除 23 个（30 行），构建通过、计算样式零差异 |
| 3 | L1 归并（366 → 目标 ≤ 220） | `tokens:audit` 声明数下降且产物引用不变 |

**第 2 步的前置检查**：删除前需确认令牌没被内联样式/脚本动态使用
（`grep -r "style=" src/` 与 `getComputedStyle` 调用），当前审计未覆盖该路径。

## 已知限制

- 闸门只覆盖 `src/` 下的 app 代码；`node_modules` 里的包组件不受约束（升级会回退）；
- L3（组件私有令牌）目前尚未真正使用，规则先以「不在 L2 白名单即违规」近似。


## 死令牌判定的四个盲区（实测补充）

| # | 盲区 | 现象 | 结论 |
|---|---|---|---|
| 1 | 源码 `var()` | Tailwind 工具类编译后才产生 `var()` | 必须看构建产物 |
| 2 | **Tailwind `@apply` / 主题命名空间** | 删掉 `--color-border` 后构建报 `Cannot apply unknown utility class border-border` | `--color-*` / `--radius-*` / `--font-*` 等**永不删除** |
| 3 | 动态样式（`style={{}}`、`setProperty`、`getComputedStyle`） | 当前应用代码 0 命中 | 删除前必须跑 `yarn tokens:dynamic` |
| 4 | 包内组件的运行时引用 | 未被覆盖 | 只能靠构建 + 计算样式回归发现 |

**第 2 条是踩出来的**：第一次按「产物零引用」删了 187 个，构建直接失败、服务中断，
用 `git checkout -- src/app/globals.css` 恢复后，才加入主题命名空间保护，最终只删 23 个。


## 令牌构成与「≤220」目标的修正（Round 25）

对 `globals.css` 去重后共 **343** 个唯一令牌（早期统计 366 含 `:root`/`.dark` 重复声明）：

| 类别 | 数量 | 能否归并 |
|---|---|---|
| Tailwind 主题命名空间（`--color-*` / `--radius-*` / `--font-*` / `--shadow-*` …） | **179** | ❌ 删任何一个都会让对应工具类（`bg-*`/`rounded-*`）失效 |
| 业务/组件令牌（`--status-*` 36、`--badge-*` 24、`--file-*` 18、`--chart-*` 17、`--brand-*` 12 …） | **164** | 理论可归并，但**全部 164 个仍在产物中被引用** |

结论：**「366 → ≤220」这个目标不成立**。179 个主题令牌是结构性的，
删不掉；剩下 164 个没有一个是死令牌（已在本轮之前清理过 23 个）。

**因此 T10 的验收改为**：

| 原目标 | 修正后 |
|---|---|
| 声明数 ≤ 220 | 死令牌 = 0（已达成）；主题令牌不计入约束 |
| 组件不直接引用 primitive | `tokens:check --strict` 通过，基线 0（已达成） |
| — | 新增：令牌构成可解释（本文档第 3 节） |

## 圆角（实测后定稿，2026-11-06）

实测三个页面（仪表盘 / 报价单 / 系统升级）的计算值分布：

| 半径 | 出现次数 | 用途判定 |
|---|---|---|
| `8px` | 31–39 | 控件（按钮、输入、标签）——主导 |
| `10px` | 16–40 | 控件加大版（面板内控件、菜单项） |
| `16px` | 1–3 | 面板/卡片外层 |
| `4px` | 1–2 | 内嵌元素（内层圆角 = 外层 − padding） |
| `9999px` | 3–12 | 头像、状态点、滚动条拇指（合理） |

**结论**：现有体系已符合「控件 8–10 / 卡片 12–16 / 面板 14–20」，因此不批量改类名，
只把角色固化为令牌，供新代码选用：

| 令牌 | 值 | Tailwind 工具类 |
|---|---|---|
| `--radius-control` | 8px | `rounded-control` |
| `--radius-control-lg` | 10px | `rounded-control-lg` |
| `--radius-card` | 12px | `rounded-card` |
| `--radius-panel` | 16px | `rounded-panel` |

规则：**内层圆角 = 外层圆角 − 两者间距**，且不小于 4px；标签不使用 `rounded-full`（见 B2）。
