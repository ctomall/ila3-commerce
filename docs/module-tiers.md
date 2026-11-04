# 模块套餐（T3）

## 机制

`OM_MODULE_TIER`（`core` | `business` | `extension` | `all`，默认 `all`）在
`src/modules.ts` 末尾**原地过滤** `enabledModules`。归属见 `src/lib/module-tiers.ts`：

| 套餐 | 含义 | 实测启用数 |
|---|---|---|
| `core` | 商业主干（客户/销售/商品/仓储/结账/设置/鉴权/审计…） | 27 |
| `business` | core + 行业与合规（保修、EUDR、员工排程、工作流…） | 51 |
| `extension` / `all` | 全量（集成、渠道、AI、示例） | 79 |

```bash
yarn modules:tiers                 # 各套餐的启用/禁用清单与字典影响
OM_MODULE_TIER=core yarn build     # 以 core 套餐构建（见下方警告）
```

## 实测影响（2026-11-05）

| 指标 | `core` | `all` | 结论 |
|---|---|---|---|
| 冷构建编译时间 | 71 s | 71 s | **无差异** |
| 构建产物体积 | 2.3 G | 2.3 G | **无差异** |
| `modules.generated.ts` | 5 008 行 / 66 个模块导入 | 5 008 行 / 66 个 | **无差异** |

**原因**：代码生成与打包是**按文件系统扫描模块包**的，不读 `enabledModules` 数组。
套餐只影响**运行时注册表**（导航、字典挂载、页面可见性），不影响构建期工作。

因此：

- ✅ 机制可用（运行时裁剪，5 个单测覆盖归属与包含关系）；
- ❌ 「套餐能降低构建时间/产物体积」这一预期**不成立**，不应作为选型理由；
- ❌ **运行时同样无效**（2026-11-05 受控实验，见下）。

### 受控实验：线上切 `business` 后实测（Round 24）

| 指标 | `all`（基线） | `business` | 结论 |
|---|---|---|---|
| 客户页 HTML | 907 KB / 5 428 键 | 907 KB / 5 428 键 | 无变化 |
| 主导航链接数 | 40 | 40 | 无变化 |
| `/backend/messages` | 200 | 200 | 扩展模块页仍可访问 |
| `/backend/integrations` | 200 | 200 | 同上 |
| `/backend/config/ai-assistant/models` | 200 | 200 | 同上 |

**结论：`OM_MODULE_TIER` 目前是「惰性开关」。** 运行时注册表来自构建期生成的
`.mercato/generated/modules.generated.ts`（按文件系统扫描模块包），并不读取 `enabledModules`。
要让套餐真正生效，必须把过滤逻辑接进**生成器**，而不是 `modules.ts` 的导出数组。

> 实验已回滚：`.env` 恢复原样、服务重启、客户页 200。

## 决策指南（什么时候才该切）

切换套餐 = 让某些功能在产品里**不存在**。这是产品决策，不是性能优化。判断标准：

| 问题 | 若答案为「是」 | 若为「否」 |
|---|---|---|
| 该租户会用到多渠道（Gmail/IMAP/Resend/SES/FCM/APNs）吗？ | 保持 `extension` | 可切 `business` |
| 会用到 AI 助手 / 智能体编排吗？ | 保持 `extension` | 可切 `business` |
| 会用到 Akeneo / Excel 同步、Webhook、文档协同吗？ | 保持 `extension` | 可切 `business` |
| 只卖标准商品，不需要保修/EUDR/排程吗？ | 可切 `core` | 保持 `business` |

## 切换与回滚

```bash
# 1) 选套餐
echo 'OM_MODULE_TIER=business' >> .env
# 2) 重建并重启（务必重建，注册表是构建期产物的一部分）
yarn build && sudo systemctl restart mercato
# 3) 验证：导航、字典、关键页面
yarn tokens:check && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login
# 回滚
sed -i '/OM_MODULE_TIER/d' .env && yarn build && sudo systemctl restart mercato
```

## 已知风险

- **示例模块的 API 路由**（`src/modules/example/api/organizations/route.ts`）引用了仅在
  example 模块启用时才生成的实体；关闭 example 后该路由会导致构建失败。
  切 `core`/`business` 前需先删除或条件化该路由。
- 套餐不改变数据库结构；停用的模块数据保留，重新启用即可恢复。
