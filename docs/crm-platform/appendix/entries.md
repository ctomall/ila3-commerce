# 入口清单（附录）

由 `node scripts/crm-nav-baseline.mjs` 产出的服务端 payload 生成；本文件是快照，不是基线本身（基线是 `nav-*.json`）。
重跑后若入口数或标题变化，`git diff` 会直接暴露。

## superadmin（根项 102 / 含子项 152）

### 客户与销售

| 入口 | 路由 | 子项 |
|---|---|---|
| 公司 | `/backend/customers/companies` | 创建公司 |
| 商机 | `/backend/customers/deals` | 创建商机、商机地图、销售漏斗 |
| 客户相关任务 | `/backend/customer-tasks` | — |
| 日历 | `/backend/calendar` | — |
| 联系人 | `/backend/customers/people` | 创建联系人 |
| 商机设置 | `/backend/config/customers/deals` | — |
| 创建销售单据 | `/backend/sales/documents/create` | — |
| 报价单 | `/backend/sales/quotes` | — |
| 订单 | `/backend/sales/orders` | — |
| 销售渠道 | `/backend/sales/channels` | 渠道报价、创建渠道 |

### 商品与库存

| 入口 | 路由 | 子项 |
|---|---|---|
| 产品与服务 | `/backend/catalog/products` | 创建产品 |
| 价格规则 | `/backend/catalog/prices` | 创建价格规则 |
| 分类 | `/backend/catalog/categories` | 创建分类 |
| 运营看板 | `/backend/wms` | 库存、仓库、库区、库位、批次、出入库记录、库存预留 |
| 支付链接 | `/backend/checkout/pay-links` | — |
| 结账模板 | `/backend/checkout/templates` | — |
| 交易记录 | `/backend/checkout/transactions` | — |

### 履约与售后

| 入口 | 路由 | 子项 |
|---|---|---|
| 保修工单 | `/backend/warranty_claims` | 供应商政策、保修工单设置、保修登记、排障指南、新建工单 |
| EUDR 概览 | `/backend/eudr` | 产品映射、地块、声明、证据提交、风险评估 |

### 人员与排程

| 入口 | 路由 | 子项 |
|---|---|---|
| 资源类型 | `/backend/resources/resource-types` | 添加资源类型 |
| 资源 | `/backend/resources/resources` | 创建资源 |
| 团队 | `/backend/staff/teams` | 创建团队 |
| 团队成员 | `/backend/staff/team-members` | — |
| 团队角色 | `/backend/staff/team-roles` | — |
| 请假申请（管理） | `/backend/staff/leave-requests` | — |
| 我的请假 | `/backend/staff/my-leave-requests` | — |
| 我的可用性 | `/backend/staff/my-availability` | — |
| 我的工作 | `/backend/staff/time-tracking` | 项目、任务、工时记录、工时表、工时报表、工时设置 |

### 财务与规则

| 入口 | 路由 | 子项 |
|---|---|---|
| 货币 | `/backend/currencies` | 创建货币 |
| 汇率 | `/backend/exchange-rates` | 创建汇率 |
| 汇率抓取 | `/backend/config/currency-fetching` | — |
| 业务规则 | `/backend/rules` | 创建业务规则 |
| 规则集 | `/backend/sets` | 创建规则集 |
| 执行日志 | `/backend/logs` | — |

### 自动化与流程

| 入口 | 路由 | 子项 |
|---|---|---|
| 工作流定义 | `/backend/definitions` | 创建工作流定义、工作流可视化编辑器 |
| 工作流实例 | `/backend/instances` | 失败队列 |
| 工作收件箱 | `/backend/work-inbox` | — |
| 工作流事件 | `/backend/events` | — |

### 内容与通信

| 入口 | 路由 | 子项 |
|---|---|---|
| 文档 | `/backend/documents` | 文档模板 |
| 附件 | `/backend/storage/attachments` | — |
| 消息 | `/backend/messages` | — |
| 收件箱建议 | `/backend/inbox-ops` | — |
| 通信渠道 | `/backend/communication_channels/channels` | — |
| 通话记录 | `/backend/phone_calls` | — |

### 功能开关

| 入口 | 路由 | 子项 |
|---|---|---|
| 创建功能开关 | `/backend/feature-toggles/global/create` | — |

### 数据设计器

| 入口 | 路由 | 子项 |
|---|---|---|
| 创建实体 | `/backend/entities/user/create` | — |

### 身份与权限

| 入口 | 路由 | 子项 |
|---|---|---|
| 创建用户 | `/backend/users/create` | — |
| 创建角色 | `/backend/roles/create` | — |

### 组织与租户

| 入口 | 路由 | 子项 |
|---|---|---|
| 组织品牌 | `/backend/directory/branding` | — |
| 组织 | `/backend/directory/organizations` | — |
| 租户 | `/backend/directory/tenants` | — |

### 功能开关

| 入口 | 路由 | 子项 |
|---|---|---|
| 全局开关 | `/backend/feature-toggles/global` | — |
| 覆盖项 | `/backend/feature-toggles/overrides` | — |

### 外部系统

| 入口 | 路由 | 子项 |
|---|---|---|
| Webhook | `/backend/webhooks` | — |
| 集成 | `/backend/integrations` | — |
| 数据同步 | `/backend/data-sync` | — |
| 支付交易 | `/backend/payment-gateways` | — |
| 推送投递记录 | `/backend/push_notifications` | 发送推送 |

### 客户门户

| 入口 | 路由 | 子项 |
|---|---|---|
| 客户用户 | `/backend/customer_accounts/users` | — |
| 客户角色 | `/backend/customer_accounts/roles` | — |

### 数据设计器

| 入口 | 路由 | 子项 |
|---|---|---|
| 系统实体 | `/backend/entities/system` | — |
| 浏览自定义实体 | `/backend/entities/user` | — |
| 查询索引 | `/backend/query-indexes` | — |

### 模块配置

| 入口 | 路由 | 子项 |
|---|---|---|
| 销售 | `/backend/config/sales` | — |
| 商品目录 | `/backend/config/catalog` | — |
| 客户 | `/backend/config/customers` | 销售漏斗阶段 |
| 数据字典 | `/backend/config/dictionaries` | — |
| 自定义实体设置 | `/backend/config/settings` | — |
| 加密 | `/backend/config/encryption` | — |
| 翻译管理 | `/backend/config/translations` | — |
| 通知投递 | `/backend/config/notifications` | — |
| 存储 | `/backend/config/attachments` | — |
| 可用性排班 | `/backend/planner/availability-rulesets` | — |
| 工作流命令 | `/backend/config/workflows` | — |
| 定时任务 | `/backend/config/scheduled-jobs` | — |
| 仓储配置 | `/backend/config/wms` | — |
| 门户设置 | `/backend/customer_accounts/settings` | 自定义域名 |
| 搜索设置 | `/backend/config/search` | — |
| AI 智能体设置 | `/backend/config/ai-assistant/agents` | — |
| AI 设置 | `/backend/config/ai-assistant/settings` | — |
| AI 用量 | `/backend/config/ai-assistant/usage` | — |
| AI 调试台 | `/backend/config/ai-assistant/playground` | — |
| 模型配置 | `/backend/config/ai-assistant/models` | — |
| AI 助手（旧版） | `/backend/config/ai-assistant/legacy` | — |
| AI 白名单 | `/backend/config/ai-assistant/allowlist` | — |
| 审核标记 | `/backend/config/ai-assistant/moderation-flags` | — |
| 智能体列表 | `/backend/config/ai-agents` | — |
| 系统升级 | `/backend/config/system-update` | — |

### 系统

| 入口 | 路由 | 子项 |
|---|---|---|
| 系统状态 | `/backend/config/system-status` | — |
| 模块遥测 | `/backend/config/module-telemetry` | — |
| 模块应用 | `/backend/config/modules` | — |
| 缓存 | `/backend/config/cache` | — |

### 自定义

| 入口 | 路由 | 子项 |
|---|---|---|
| 自定义侧边栏 | `/backend/sidebar-customization` | — |

### 身份认证

| 入口 | 路由 | 子项 |
|---|---|---|
| 用户 | `/backend/users` | — |
| 角色 | `/backend/roles` | — |
| API 密钥 | `/backend/api-keys` | — |
| 设备 | `/backend/devices` | — |
| 用户通知偏好 | `/backend/notifications/user-preferences` | — |

### 账户

| 入口 | 路由 | 子项 |
|---|---|---|
| 我的通信渠道 | `/backend/profile/communication-channels` | — |
| 通知偏好 | `/backend/profile/notification-preferences` | — |

### 安全

| 入口 | 路由 | 子项 |
|---|---|---|
| 审计日志 | `/backend/audit-logs` | — |

### 开发者

| 入口 | 路由 | 子项 |
|---|---|---|
| API 文档 | `/backend/docs` | — |

## employee（根项 44 / 含子项 74）

### 客户与销售

| 入口 | 路由 | 子项 |
|---|---|---|
| 公司 | `/backend/customers/companies` | 创建公司 |
| 商机 | `/backend/customers/deals` | 创建商机、商机地图、销售漏斗 |
| 客户相关任务 | `/backend/customer-tasks` | — |
| 日历 | `/backend/calendar` | — |
| 联系人 | `/backend/customers/people` | 创建联系人 |
| 商机设置 | `/backend/config/customers/deals` | — |
| 创建销售单据 | `/backend/sales/documents/create` | — |
| 报价单 | `/backend/sales/quotes` | — |
| 订单 | `/backend/sales/orders` | — |
| 销售渠道 | `/backend/sales/channels` | 渠道报价、创建渠道 |

### 商品与库存

| 入口 | 路由 | 子项 |
|---|---|---|
| 产品与服务 | `/backend/catalog/products` | 创建产品 |
| 价格规则 | `/backend/catalog/prices` | 创建价格规则 |
| 分类 | `/backend/catalog/categories` | 创建分类 |
| 运营看板 | `/backend/wms` | 库存、仓库、库区、库位、批次、出入库记录、库存预留 |
| 支付链接 | `/backend/checkout/pay-links` | — |
| 结账模板 | `/backend/checkout/templates` | — |
| 交易记录 | `/backend/checkout/transactions` | — |

### 履约与售后

| 入口 | 路由 | 子项 |
|---|---|---|
| 保修工单 | `/backend/warranty_claims` | 保修登记、新建工单 |
| EUDR 概览 | `/backend/eudr` | 产品映射、地块、声明、证据提交、风险评估 |

### 人员与排程

| 入口 | 路由 | 子项 |
|---|---|---|
| 我的请假 | `/backend/staff/my-leave-requests` | — |
| 我的可用性 | `/backend/staff/my-availability` | — |
| 我的工作 | `/backend/staff/time-tracking` | 项目、任务、工时记录、工时表 |

### 自动化与流程

| 入口 | 路由 | 子项 |
|---|---|---|
| 工作流定义 | `/backend/definitions` | — |
| 工作流实例 | `/backend/instances` | 失败队列 |
| 工作收件箱 | `/backend/work-inbox` | — |

### 内容与通信

| 入口 | 路由 | 子项 |
|---|---|---|
| 文档 | `/backend/documents` | — |
| 附件 | `/backend/storage/attachments` | — |
| 消息 | `/backend/messages` | — |
| 收件箱建议 | `/backend/inbox-ops` | — |
| 通信渠道 | `/backend/communication_channels/channels` | — |
| 通话记录 | `/backend/phone_calls` | — |

### 外部系统

| 入口 | 路由 | 子项 |
|---|---|---|
| Webhook | `/backend/webhooks` | — |
| 集成 | `/backend/integrations` | — |
| 数据同步 | `/backend/data-sync` | — |
| 支付交易 | `/backend/payment-gateways` | — |

### 模块配置

| 入口 | 路由 | 子项 |
|---|---|---|
| 销售 | `/backend/config/sales` | — |
| 翻译管理 | `/backend/config/translations` | — |
| 定时任务 | `/backend/config/scheduled-jobs` | — |
| 仓储配置 | `/backend/config/wms` | — |

### 身份认证

| 入口 | 路由 | 子项 |
|---|---|---|
| 用户 | `/backend/users` | — |

### 账户

| 入口 | 路由 | 子项 |
|---|---|---|
| 我的通信渠道 | `/backend/profile/communication-channels` | — |
| 通知偏好 | `/backend/profile/notification-preferences` | — |

### 安全

| 入口 | 路由 | 子项 |
|---|---|---|
| 审计日志 | `/backend/audit-logs` | — |

### 开发者

| 入口 | 路由 | 子项 |
|---|---|---|
| API 文档 | `/backend/docs` | — |

