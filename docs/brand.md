# 品牌资产清单（ILA3 Commerce）

## 源文件（`public/brand/`）

| 文件 | 用途 | 说明 |
|---|---|---|
| `logo-mark.svg` | 主标记 | 16–512px 通用，深色底 + 反白字 |
| `logo-mono.svg` | 单色变体 | `currentColor`，用于水印/禁用态/打印 |
| `logo-wordmark.svg` | 横排组合标 | 标记 + 「ILA3 Commerce」文字 |
| `favicon-16.png` / `favicon-32.png` | 浏览器标签 | 由 `logo-mark.svg` 渲染 |
| `apple-touch-icon-180.png` | iOS 主屏 | 180×180 |
| `og-512.png` | 社交分享 | Open Graph 预览图 |

## 生成方式

```bash
yarn brand:assets      # = node scripts/build-brand-assets.mjs（依赖 sharp）
```

SVG 是唯一源文件；PNG 由脚本渲染并**提交进仓库**，构建不依赖该步骤。
改标识只需替换 `logo-mark.svg` → 重跑脚本 → 提交。

## 已接入点

| 位置 | 引用 |
|---|---|
| `<head>` 图标 | `favicon-16/32.png`、`/brand.svg`、`apple-touch-icon-180.png` |
| Open Graph | `/brand/og-512.png` |
| 登录页 | `/brand.svg`（上游包内硬编码路径，由 `scripts/apply-brand-patch.mjs` 改写） |
| 后台侧栏 | `/brand.svg` |

## 尚未提供

- 空状态插图（无数据/无权限/加载失败）——随 T11 三态组件一起提供；
- 登录页主视觉大图——上游登录页为单卡片布局，注入大图需改包内组件，暂缓。
