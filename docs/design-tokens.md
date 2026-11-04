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
| 2 | 清理 187 个死令牌 | 删除后 `next build` 通过、6 页暗色截图无差异 |
| 3 | L1 归并（366 → 目标 ≤ 220） | `tokens:audit` 声明数下降且产物引用不变 |

**第 2 步的前置检查**：删除前需确认令牌没被内联样式/脚本动态使用
（`grep -r "style=" src/` 与 `getComputedStyle` 调用），当前审计未覆盖该路径。

## 已知限制

- 闸门只覆盖 `src/` 下的 app 代码；`node_modules` 里的包组件不受约束（升级会回退）；
- L3（组件私有令牌）目前尚未真正使用，规则先以「不在 L2 白名单即违规」近似。
