# 企业模块页面与契约基线

源提交：`71c54aba96613d7b3d28061d6e809bbd4ef10215`。声明不等于运行验收；建议布局不是现状。页面API未查调用点时明确未映射。

| 范围 | 模块 | 路由 | 标题 | 声明权限 | 建议布局 | 返回父页 | 元数据证据 | 调用证据 |
|---|---|---|---|---|---|---|---|---|
| backend | auth | /backend/auth/profile | Profile | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | auth | /backend/profile/change-password | Change Password | 未声明/待验证 | inspect-existing-surface | /backend/profile | inline-declared | source-literals-only |
| backend | auth | /backend/profile | Profile | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | auth | /backend/roles/create | Create Role | auth.roles.manage | CrudForm | /backend/roles | reference-partially-resolved | source-literals-only |
| backend | auth | /backend/roles | Roles | auth.roles.list | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | auth | /backend/settings | Settings | 未声明/待验证 | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | auth | /backend/sidebar-customization | Customize sidebar | auth.sidebar.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | auth | /backend/users/create | Create User | auth.users.create | CrudForm | /backend/users | reference-partially-resolved | source-literals-only |
| backend | auth | /backend/users | Users | auth.users.list | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | auth | /backend/roles/[id]/edit | Edit Role | auth.roles.manage | CrudForm | /backend/roles | inline-declared | source-literals-only |
| backend | auth | /backend/users/[id]/edit | Edit User | auth.users.edit | CrudForm | /backend/users | inline-declared | source-literals-only |
| backend | directory | /backend/directory/branding | Organization branding | directory.organizations.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | directory | /backend/directory/organizations/create | Create Organization | directory.organizations.manage | CrudForm | /backend/directory/organizations | inline-declared | source-literals-only |
| backend | directory | /backend/directory/organizations | Organizations | directory.organizations.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | directory | /backend/directory/tenants/create | Create Tenant | directory.tenants.manage | CrudForm | /backend/directory/tenants | inline-declared | source-literals-only |
| backend | directory | /backend/directory/tenants | Tenants | directory.tenants.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | directory | /backend/directory/organizations/[id]/edit | Edit Organization | directory.organizations.manage | CrudForm | /backend/directory/organizations | inline-declared | source-literals-only |
| backend | directory | /backend/directory/tenants/[id]/edit | Edit Tenant | directory.tenants.manage | CrudForm | /backend/directory/tenants | inline-declared | source-literals-only |
| backend | customers | /backend/calendar | Calendar | customers.interactions.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | customers | /backend/config/customers/deals | Deal settings | customers.deals.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | customers | /backend/config/customers | Customers | customers.settings.manage,customers.people.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | customers | /backend/config/customers/pipeline-stages | Pipeline stages | customers.pipelines.manage | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | customers | /backend/customer-tasks | Customer related tasks | customers.interactions.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | customers | /backend/customers/companies/create | Create Company | customers.companies.manage | CrudForm | /backend/customers/companies | reference-partially-resolved | source-literals-only |
| backend | customers | /backend/customers/companies | Companies | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | customers | /backend/customers/deals/create | Create deal | customers.deals.manage | CrudForm | /backend/customers/deals | reference-partially-resolved | unmapped |
| backend | customers | /backend/customers/deals/map | Deals Map | customers.deals.view,customers.activities.view | inspect-existing-surface | /backend/customers/deals | reference-partially-resolved | unmapped |
| backend | customers | /backend/customers/deals | Deals | customers.deals.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | customers | /backend/customers/deals/pipeline | Sales Pipeline | customers.deals.view | inspect-existing-surface | /backend/customers/deals | reference-partially-resolved | source-literals-only |
| backend | customers | /backend/customers/people/create | Create Person | customers.people.manage | CrudForm | /backend/customers/people | reference-partially-resolved | source-literals-only |
| backend | customers | /backend/customers/people | People | customers.people.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | customers | /backend/customers/companies-v2/[id] | Company details | customers.companies.view | detail-with-related-records | /backend/customers/companies | inline-declared | source-literals-only |
| backend | customers | /backend/customers/companies/[id] | Company details | customers.companies.view | detail-with-related-records | /backend/customers/companies | inline-declared | source-literals-only |
| backend | customers | /backend/customers/deals/[id] | Deal details | customers.deals.manage | detail-with-related-records | /backend/customers/deals | inline-declared | unmapped |
| backend | customers | /backend/customers/people-v2/[id] | Person details | customers.people.view | detail-with-related-records | /backend/customers/people | inline-declared | source-literals-only |
| backend | customers | /backend/customers/people/[id] | Person details | customers.people.view | detail-with-related-records | /backend/customers/people | inline-declared | source-literals-only |
| backend | entities | /backend/config/encryption | Encryption | entities.definitions.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | entities | /backend/config/settings | Custom Entities | entities.definitions.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | entities | /backend/entities/system | System Entities | entities.definitions.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | entities | /backend/entities/user/create | Create Entity | entities.definitions.manage | CrudForm | /backend/entities/user | reference-partially-resolved | source-literals-only |
| backend | entities | /backend/entities/user | User Entities | entities.definitions.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | entities | /backend/entities/system/[entityId] | Edit Definitions | entities.definitions.manage | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | entities | /backend/entities/user/[entityId] | Edit Definitions | entities.definitions.manage | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | entities | /backend/entities/user/[entityId]/records/[recordId] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | unresolved-reference | source-literals-only |
| backend | entities | /backend/entities/user/[entityId]/records/create | inspect-page-component | 未声明/待验证 | CrudForm | unresolved-parent | unresolved-reference | source-literals-only |
| backend | entities | /backend/entities/user/[entityId]/records | Entity Records | entities.records.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | configs | /backend/config/cache | Cache | configs.cache.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | configs | /backend/config/module-telemetry | Module telemetry | configs.system_status.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | configs | /backend/config/system-status | System status | configs.system_status.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | query_index | /backend/query-indexes | Query Indexes | query_index.status.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | audit_logs | /backend/audit-logs | Audit Logs | audit_logs.view_self | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | attachments | /backend/config/attachments | Storage | attachments.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | attachments | /backend/storage/attachments | Attachments | attachments.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | catalog | /backend/catalog/categories/create | Create Category | catalog.categories.manage | CrudForm | /backend/catalog/categories | reference-partially-resolved | source-literals-only |
| backend | catalog | /backend/catalog/categories | Categories | catalog.categories.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | catalog | /backend/catalog/prices/create | Create price rule | catalog.pricing.manage | CrudForm | /backend/catalog/prices | reference-partially-resolved | source-literals-only |
| backend | catalog | /backend/catalog/prices | Price rules | catalog.products.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | catalog | /backend/catalog/products/create | Create product | catalog.products.manage | CrudForm | /backend/catalog/products | reference-partially-resolved | source-literals-only |
| backend | catalog | /backend/catalog/products | Products & services | catalog.products.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | catalog | /backend/config/catalog | Catalog | catalog.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | catalog | /backend/catalog/categories/[id]/edit | Edit Category | catalog.categories.manage | CrudForm | /backend/catalog/categories | inline-declared | source-literals-only |
| backend | catalog | /backend/catalog/prices/[id]/edit | Edit price rule | catalog.pricing.manage | CrudForm | /backend/catalog/prices | inline-declared | source-literals-only |
| backend | catalog | /backend/catalog/products/[id] | Product details | catalog.products.view | detail-with-related-records | /backend/catalog/products | inline-declared | source-literals-only |
| backend | catalog | /backend/catalog/products/[productId]/variants/[variantId] | inspect-page-component | catalog.variants.manage | detail-with-related-records | /backend/catalog/products | inline-declared | source-literals-only |
| backend | catalog | /backend/catalog/products/[productId]/variants/create | inspect-page-component | catalog.variants.manage | CrudForm | /backend/catalog/products | inline-declared | source-literals-only |
| backend | sales | /backend/config/sales | Sales | sales.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | sales | /backend/sales/channels/create | Create channel | sales.channels.manage | CrudForm | /backend/sales/channels | reference-partially-resolved | source-literals-only |
| backend | sales | /backend/sales/channels/offers | Sales channel offers | sales.channels.manage | inspect-existing-surface | /backend/sales/channels | reference-partially-resolved | source-literals-only |
| backend | sales | /backend/sales/channels | Sales channels | sales.channels.manage | inspect-existing-surface | /backend/sales/channels | reference-partially-resolved | source-literals-only |
| backend | sales | /backend/sales/documents/create | Create sales document | sales.orders.manage,sales.quotes.manage | CrudForm | /backend/sales/channels | inline-declared | source-literals-only |
| backend | sales | /backend/sales/orders | Orders | sales.orders.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | sales | /backend/sales/quotes | Quotes | sales.quotes.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | sales | /backend/sales/channels/[channelId]/edit | Edit channel | sales.channels.manage | CrudForm | /backend/sales/channels | inline-declared | source-literals-only |
| backend | sales | /backend/sales/channels/[channelId]/offers/[offerId]/edit | Edit channel offer | sales.channels.manage | CrudForm | /backend/sales/channels | inline-declared | unmapped |
| backend | sales | /backend/sales/channels/[channelId]/offers/create | Create channel offer | sales.channels.manage | CrudForm | /backend/sales/channels | inline-declared | unmapped |
| backend | sales | /backend/sales/documents/[id] | Sales document | sales.orders.view,sales.quotes.view | detail-with-related-records | /backend/sales/orders | inline-declared | source-literals-only |
| backend | sales | /backend/sales/orders/[id] | Order details | sales.orders.view | detail-with-related-records | /backend/sales/orders | inline-declared | unmapped |
| backend | sales | /backend/sales/quotes/[id] | Quote details | sales.quotes.view | detail-with-related-records | /backend/sales/quotes | inline-declared | unmapped |
| backend | warranty_claims | /backend/warranty_claims | Claims | warranty_claims.claim.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/create | New claim | warranty_claims.claim.create | CrudForm | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/registrations/create | New registration | warranty_claims.registration.manage | CrudForm | /backend/warranty_claims/registrations | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/registrations | Registrations | warranty_claims.registration.view | inspect-existing-surface | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/settings | Warranty claim settings | warranty_claims.settings.manage | inspect-existing-surface | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/troubleshooting-guides/create | New troubleshooting guide | warranty_claims.troubleshooting.manage | CrudForm | /backend/warranty_claims/troubleshooting-guides | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/troubleshooting-guides | Troubleshooting guides | warranty_claims.troubleshooting.manage | inspect-existing-surface | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/vendor-policies/create | New vendor policy | warranty_claims.vendor_policy.manage | CrudForm | /backend/warranty_claims/vendor-policies | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/vendor-policies | Vendor policies | warranty_claims.vendor_policy.manage | inspect-existing-surface | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/[id]/edit | Edit claim | warranty_claims.claim.manage | CrudForm | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/[id] | Claim detail | warranty_claims.claim.view | detail-with-related-records | /backend/warranty_claims | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/registrations/[id]/edit | Edit registration | warranty_claims.registration.manage | CrudForm | /backend/warranty_claims/registrations | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/troubleshooting-guides/[id]/edit | Edit troubleshooting guide | warranty_claims.troubleshooting.manage | CrudForm | /backend/warranty_claims/troubleshooting-guides | inline-declared | source-literals-only |
| backend | warranty_claims | /backend/warranty_claims/vendor-policies/[id]/edit | Edit vendor policy | warranty_claims.vendor_policy.manage | CrudForm | /backend/warranty_claims/vendor-policies | inline-declared | source-literals-only |
| backend | wms | /backend/config/wms | WMS Configuration | wms.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | wms | /backend/wms | Operational dashboard | wms.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | wms | /backend/wms/inventory | WMS Inventory | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/locations | WMS Locations | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/lots | WMS Lots | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/movements | WMS Movements | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/reservations | WMS Reservations | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/warehouses | WMS Warehouses | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/zones | WMS Zones | wms.view | inspect-existing-surface | /backend/wms | inline-declared | unmapped |
| backend | wms | /backend/wms/location/[id] | Location detail | wms.view | detail-with-related-records | /backend/wms/locations | inline-declared | unmapped |
| backend | wms | /backend/wms/lot/[id] | Lot detail | wms.view | detail-with-related-records | /backend/wms/inventory | inline-declared | unmapped |
| backend | wms | /backend/wms/sku/[id] | SKU detail | wms.view | detail-with-related-records | /backend/wms/inventory | inline-declared | unmapped |
| backend | api_keys | /backend/api-keys/create | Create API Key | api_keys.create | CrudForm | /backend/api-keys | inline-declared | source-literals-only |
| backend | api_keys | /backend/api-keys | API Keys | api_keys.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | devices | /backend/devices/create | Register device | devices.admin | CrudForm | /backend/devices | inline-declared | source-literals-only |
| backend | devices | /backend/devices | Devices | devices.admin | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | devices | /backend/devices/[id] | Edit device | devices.admin | detail-with-related-records | /backend/devices | inline-declared | source-literals-only |
| backend | dictionaries | /backend/config/dictionaries | Dictionaries | dictionaries.manage,dictionaries.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | api_docs | /backend/docs | API documentation | 未声明/待验证 | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | business_rules | /backend/logs | Logs | business_rules.view_logs | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/rules/create | Create Business Rule | business_rules.manage | CrudForm | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/rules | Business Rules | business_rules.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/sets/create | Create Rule Set | business_rules.manage_sets | CrudForm | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/sets | Rule Sets | business_rules.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/logs/[id] | Execution Log Details | business_rules.view_logs | detail-with-related-records | /backend/logs | inline-declared | source-literals-only |
| backend | business_rules | /backend/rules/[id] | Edit Business Rule | business_rules.manage | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | business_rules | /backend/sets/[id] | Edit Rule Set | business_rules.manage_sets | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | feature_toggles | /backend/feature-toggles/global/create | Create Feature Toggle | feature_toggles.manage | CrudForm | /backend/feature-toggles/global | reference-partially-resolved | source-literals-only |
| backend | feature_toggles | /backend/feature-toggles/global | Global | feature_toggles.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | feature_toggles | /backend/feature-toggles/overrides | Overrides | feature_toggles.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | feature_toggles | /backend/feature-toggles/global/[id]/edit | Edit Global | feature_toggles.manage | CrudForm | /backend/feature-toggles/global | inline-declared | source-literals-only |
| backend | feature_toggles | /backend/feature-toggles/global/[id] | Feature Toggle Overrides | feature_toggles.view | detail-with-related-records | /backend/feature-toggles/global | inline-declared | unmapped |
| backend | workflows | /backend/config/workflows | Workflow Commands | workflows.definitions.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | workflows | /backend/definitions/create | Create Workflow Definition | workflows.definitions.create | CrudForm | /backend/definitions | reference-partially-resolved | unmapped |
| backend | workflows | /backend/definitions | Workflow Definitions | workflows.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | workflows | /backend/definitions/visual-editor | Workflow Visual Editor | workflows.manage | inspect-existing-surface | /backend/definitions | reference-partially-resolved | source-literals-only |
| backend | workflows | /backend/events | Workflow Events | workflows.view_logs | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | workflows | /backend/instances/failure-queue | Failure Queue | workflows.instances.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | workflows | /backend/instances | Workflow Instances | workflows.instances.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | workflows | /backend/tasks | User Tasks | workflows.view_tasks | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | workflows | /backend/work-inbox | Work Inbox | workflows.view_tasks | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | workflows | /backend/definitions/[id] | Edit Workflow Definition | workflows.view | detail-with-related-records | /backend/definitions | inline-declared | unmapped |
| backend | workflows | /backend/events/[id] | Event Details | workflows.view_logs | detail-with-related-records | /backend/events | inline-declared | source-literals-only |
| backend | workflows | /backend/instances/[id] | Workflow Instance Details | workflows.instances.view | detail-with-related-records | /backend/instances | inline-declared | source-literals-only |
| backend | workflows | /backend/tasks/[id] | Task Details | workflows.view_tasks | detail-with-related-records | /backend/tasks | inline-declared | source-literals-only |
| backend | search | /backend/config/search | Search Settings | search.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | currencies | /backend/config/currency-fetching | Currency Rate Fetching | currencies.fetch.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | currencies | /backend/currencies/create | Create Currency | currencies.manage | CrudForm | /backend/currencies | reference-partially-resolved | source-literals-only |
| backend | currencies | /backend/currencies | Currencies | currencies.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | currencies | /backend/exchange-rates/create | Create Exchange Rate | currencies.rates.manage | CrudForm | /backend/exchange-rates | reference-partially-resolved | source-literals-only |
| backend | currencies | /backend/exchange-rates | Exchange Rates | currencies.rates.view | inspect-existing-surface | /backend/currencies | inline-declared | source-literals-only |
| backend | currencies | /backend/currencies/[id] | Edit Currency | currencies.manage | detail-with-related-records | /backend/currencies | inline-declared | source-literals-only |
| backend | currencies | /backend/exchange-rates/[id] | Edit Exchange Rate | currencies.rates.manage | detail-with-related-records | /backend/exchange-rates | inline-declared | source-literals-only |
| backend | planner | /backend/planner/availability-rulesets/create | Create schedule | planner.manage_availability | CrudForm | /backend/planner/availability-rulesets | inline-declared | source-literals-only |
| backend | planner | /backend/planner/availability-rulesets | Availability schedules | planner.manage_availability | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | planner | /backend/planner/availability-rulesets/[id] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | unresolved-reference | source-literals-only |
| backend | resources | /backend/resources/resource-types/create | Add resource type | resources.manage_resources | CrudForm | /backend/resources/resource-types | reference-partially-resolved | source-literals-only |
| backend | resources | /backend/resources/resource-types | Resource types | resources.manage_resources | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | resources | /backend/resources/resources/create | Create resource | resources.manage_resources | CrudForm | /backend/resources/resources | reference-partially-resolved | source-literals-only |
| backend | resources | /backend/resources/resources | Resources | resources.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | resources | /backend/resources/resource-types/[id]/edit | Edit resource type | resources.manage_resources | CrudForm | /backend/resources/resource-types | reference-partially-resolved | source-literals-only |
| backend | resources | /backend/resources/resources/[id] | Edit resource | resources.manage_resources | detail-with-related-records | /backend/resources/resources | inline-declared | source-literals-only |
| backend | staff | /backend/staff/leave-requests/create | New leave request | staff.leave_requests.manage | CrudForm | /backend/staff/leave-requests | inline-declared | source-literals-only |
| backend | staff | /backend/staff/leave-requests | Leave requests | staff.leave_requests.manage | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/my-availability | My availability | staff.my_availability.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/my-leave-requests/create | New leave request | staff.my_leave_requests.send | CrudForm | /backend/staff/my-leave-requests | inline-declared | source-literals-only |
| backend | staff | /backend/staff/my-leave-requests | My leave requests | staff.my_leave_requests.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/profile/create | Create profile | staff.leave_requests.send | CrudForm | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/team-members/create | Add team member | staff.manage_team | CrudForm | /backend/staff/team-members | inline-declared | source-literals-only |
| backend | staff | /backend/staff/team-members | Team members | staff.manage_team | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/team-roles/create | Add team role | staff.manage_team | CrudForm | /backend/staff/team-roles | inline-declared | source-literals-only |
| backend | staff | /backend/staff/team-roles | Team roles | staff.manage_team | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/teams/create | Create team | staff.manage_team | CrudForm | /backend/staff/teams | reference-partially-resolved | source-literals-only |
| backend | staff | /backend/staff/teams | Teams | staff.manage_team | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/board | Tasks | staff.timesheets.tasks.view | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/entries | Time entries | staff.timesheets.view | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking | My work | staff.timesheets.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/projects/create | Create Project | staff.timesheets.projects.manage | CrudForm | /backend/staff/time-tracking/projects | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/projects | Projects | staff.timesheets.projects.view | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/reports/create | New report | staff.timesheets.reports.manage | CrudForm | /backend/staff/time-tracking/reports | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/reports | Reports | staff.timesheets.reports.view | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/settings | Settings | staff.timesheets.settings.manage | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/timesheet | Timesheet | staff.timesheets.view | inspect-existing-surface | /backend/staff/time-tracking | inline-declared | source-literals-only |
| backend | staff | /backend/staff/timesheets | My Timesheets | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | staff | /backend/staff/timesheets/projects/create | Create Project | 未声明/待验证 | CrudForm | unresolved-parent | inline-declared | unmapped |
| backend | staff | /backend/staff/timesheets/projects | Projects | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | staff | /backend/staff/leave-requests/[id] | Leave request | staff.leave_requests.manage | detail-with-related-records | /backend/staff/leave-requests | inline-declared | source-literals-only |
| backend | staff | /backend/staff/my-leave-requests/[id] | Leave request | staff.my_leave_requests.view | detail-with-related-records | /backend/staff/my-leave-requests | inline-declared | source-literals-only |
| backend | staff | /backend/staff/team-members/[id] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | unresolved-reference | source-literals-only |
| backend | staff | /backend/staff/team-roles/[id]/edit | inspect-page-component | 未声明/待验证 | CrudForm | unresolved-parent | unresolved-reference | source-literals-only |
| backend | staff | /backend/staff/teams/[id]/edit | Edit team | staff.manage_team | CrudForm | /backend/staff/teams | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/projects/[id]/board | Tasks | staff.timesheets.tasks.view | detail-with-related-records | /backend/staff/time-tracking/projects | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/projects/[id]/edit | Edit Project | staff.timesheets.projects.manage | CrudForm | /backend/staff/time-tracking/projects | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/projects/[id] | Project Details | staff.timesheets.projects.view | detail-with-related-records | /backend/staff/time-tracking/projects | inline-declared | source-literals-only |
| backend | staff | /backend/staff/time-tracking/reports/[id] | Report | staff.timesheets.reports.view | detail-with-related-records | /backend/staff/time-tracking/reports | inline-declared | source-literals-only |
| backend | staff | /backend/staff/timesheets/projects/[id]/edit | Edit Project | 未声明/待验证 | CrudForm | unresolved-parent | inline-declared | unmapped |
| backend | staff | /backend/staff/timesheets/projects/[id] | Project Details | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | notifications | /backend/config/notifications | Notification Delivery | notifications.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | notifications | /backend/notifications/user-preferences | User Notification Preferences | notifications.manage_user_preferences | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | notifications | /backend/profile/notification-preferences | Notification Preferences | notifications.manage_preferences | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | integrations | /backend/integrations | Integrations | integrations.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | integrations | /backend/integrations/[id] | Integration Detail | integrations.view | detail-with-related-records | /backend/integrations | inline-declared | source-literals-only |
| backend | integrations | /backend/integrations/bundle/[id] | Bundle Configuration | integrations.view | detail-with-related-records | /backend/integrations | inline-declared | source-literals-only |
| backend | data_sync | /backend/data-sync | Data Sync | data_sync.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | data_sync | /backend/data-sync/runs/[id] | Sync Run Detail | data_sync.view | detail-with-related-records | /backend/data-sync | inline-declared | source-literals-only |
| backend | messages | /backend/messages/compose | Compose message | messages.compose | inspect-existing-surface | /backend/messages | inline-declared | unmapped |
| backend | messages | /backend/messages | Messages | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | messages | /backend/messages/[id] | Message details | 未声明/待验证 | detail-with-related-records | /backend/messages | inline-declared | unmapped |
| backend | communication_channels | /backend/communication_channels/channels | Communication Channels | communication_channels.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | communication_channels | /backend/profile/communication-channels | My communication channels | communication_channels.connect_user_channel | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | communication_channels | /backend/communication_channels/channels/[id] | Channel Detail | communication_channels.view | detail-with-related-records | /backend/communication_channels/channels | reference-partially-resolved | source-literals-only |
| backend | push_notifications | /backend/push_notifications | Push Deliveries | push_notifications.view_deliveries | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | push_notifications | /backend/push_notifications/send | Send Push | push_notifications.send_custom | inspect-existing-surface | /backend/push_notifications | reference-partially-resolved | source-literals-only |
| backend | push_notifications | /backend/push_notifications/[id] | Push Delivery | push_notifications.view_deliveries | detail-with-related-records | /backend/push_notifications | inline-declared | source-literals-only |
| backend | phone_calls | /backend/phone_calls | Phone Calls | phone_calls.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | ai_assistant | /backend/config/ai-assistant/agents | AI Agents | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/allowlist | AI Allowlist | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/legacy | AI Assistant (legacy) | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/moderation-flags | Moderation flags | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant | inspect-page-component | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/playground | AI Playground | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/settings | AI Settings | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_assistant | /backend/config/ai-assistant/usage | AI Usage | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | ai_model_config | /backend/config/ai-assistant/models | Model Configuration | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | system_update | /backend/config/system-update | System Update | 未声明/待验证 | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | dsh_approvals | /backend/config/ai-write-approvals | Write approvals | dsh_approvals.review | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | module_directory | /backend/config/modules | Module applications | configs.system_status.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | settings_home | /backend/config/home | Settings | 未声明/待验证 | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | crm_prototype | /backend/prototype/accounts/detail | 客户详情 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_prototype | /backend/prototype/accounts | 客户列表 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_prototype | /backend/prototype/candidates | 候选审核 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_prototype | /backend/prototype/drafts | 邮件草稿审批 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_prototype | /backend/prototype | 业务员首页 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_prototype | /backend/prototype/tasks | 开发任务 | customers.companies.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/channels/connect | 连接渠道 | communication_channels.connect_tenant_channel | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/channels | 渠道账号 | communication_channels.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/exceptions | 发送结果对账 | communication_channels.manage | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/inbox | 全渠道收件箱 | communication_channels.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/inbox/[thread]/before/[cursor] | inspect-page-component | communication_channels.view | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | communications | /backend/communications/inbox/[thread] | inspect-page-component | communication_channels.view | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | workbench | /backend/workbench | 工作台 | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_navigation | /backend/business | 业务 | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_navigation | /backend/manage | 管理中心 | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | crm_navigation | /backend/business/[category] | 业务分类 | 未声明/待验证 | detail-with-related-records | /backend/business | inline-declared | unmapped |
| backend | workspace_settings | /backend/config/navigation | Workspace layout | workspace_settings.manage | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | leadgen | /backend/leadgen/candidates | Lead candidates | leadgen.candidates.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | leadgen | /backend/leadgen/suppressions | Suppression list | leadgen.sends.draft | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | agent_directory | /backend/config/ai-agents | AI agents | ai_assistant.settings.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | translations | /backend/config/translations | Translations | 未声明/待验证 | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | scheduler | /backend/config/scheduled-jobs/new | Create Schedule | scheduler.jobs.manage | CrudForm | /backend/config/scheduled-jobs | inline-declared | source-literals-only |
| backend | scheduler | /backend/config/scheduled-jobs | Scheduled Jobs | scheduler.jobs.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | scheduler | /backend/config/scheduled-jobs/[id]/edit | Edit Schedule | scheduler.jobs.manage | CrudForm | /backend/config/scheduled-jobs | inline-declared | source-literals-only |
| backend | scheduler | /backend/config/scheduled-jobs/[id] | Schedule Details | scheduler.jobs.view | detail-with-related-records | /backend/config/scheduled-jobs | inline-declared | source-literals-only |
| backend | inbox_ops | /backend/inbox-ops/log | Processing Log | inbox_ops.log.view | inspect-existing-surface | /backend/inbox-ops | inline-declared | source-literals-only |
| backend | inbox_ops | /backend/inbox-ops | Proposals | inbox_ops.proposals.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | inbox_ops | /backend/inbox-ops/settings | Inbox Settings | inbox_ops.settings.manage | inspect-existing-surface | /backend/inbox-ops | inline-declared | source-literals-only |
| backend | inbox_ops | /backend/inbox-ops/proposals/[id] | Proposal | inbox_ops.proposals.view | detail-with-related-records | /backend/inbox-ops | inline-declared | source-literals-only |
| backend | payment_gateways | /backend/payment-gateways | Payment Transactions | payment_gateways.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | checkout | /backend/checkout/pay-links/create | inspect-page-component | checkout.create | CrudForm | unresolved-parent | inline-declared | unmapped |
| backend | checkout | /backend/checkout/pay-links | Pay Links | checkout.view | inspect-existing-surface | /backend/checkout | inline-declared | source-literals-only |
| backend | checkout | /backend/checkout/templates/create | inspect-page-component | checkout.create | CrudForm | unresolved-parent | inline-declared | unmapped |
| backend | checkout | /backend/checkout/templates | Templates | checkout.view | inspect-existing-surface | /backend/checkout | inline-declared | source-literals-only |
| backend | checkout | /backend/checkout/transactions | Transactions | checkout.view | inspect-existing-surface | /backend/checkout | inline-declared | source-literals-only |
| backend | checkout | /backend/checkout | Checkout | checkout.view | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| backend | checkout | /backend/checkout/pay-links/[id] | inspect-page-component | checkout.edit | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | checkout | /backend/checkout/templates/[id] | inspect-page-component | checkout.edit | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| backend | checkout | /backend/checkout/templates/[id]/preview | inspect-page-component | checkout.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | checkout | /backend/checkout/transactions/[id] | inspect-page-component | checkout.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| backend | documents | /backend/documents | Documents | documents.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | documents | /backend/documents/templates | Document templates | documents.templates.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | documents | /backend/documents/[id] | Document | documents.view | detail-with-related-records | /backend/documents | inline-declared | unmapped |
| backend | shipping_carriers | /backend/shipping-carriers/create | inspect-page-component | shipping_carriers.manage | CrudForm | unresolved-parent | inline-declared | unmapped |
| backend | eudr | /backend/eudr/evidence-submissions/create | Create evidence submission | eudr.submissions.manage | CrudForm | /backend/eudr/evidence-submissions | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/evidence-submissions | Evidence submissions | eudr.submissions.view | inspect-existing-surface | /backend/eudr | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr | EUDR Overview | eudr.statements.view | inspect-existing-surface | unresolved-parent | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/plots/create | Create plot | eudr.plots.manage | CrudForm | /backend/eudr/plots | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/plots | Plots | eudr.plots.view | inspect-existing-surface | /backend/eudr | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/product-mappings/create | Create product mapping | eudr.mappings.manage | CrudForm | /backend/eudr/product-mappings | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/product-mappings | Product mappings | eudr.mappings.view | inspect-existing-surface | /backend/eudr | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/risk-assessments/create | Create risk assessment | eudr.risk.manage | CrudForm | /backend/eudr/risk-assessments | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/risk-assessments | Risk assessments | eudr.risk.view | inspect-existing-surface | /backend/eudr | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/statements/create | Create statement | eudr.statements.manage | CrudForm | /backend/eudr/statements | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/statements | Statements | eudr.statements.view | inspect-existing-surface | /backend/eudr | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/evidence-submissions/[id] | Edit evidence submission | eudr.submissions.manage | detail-with-related-records | /backend/eudr/evidence-submissions | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/plots/[id] | Edit plot | eudr.plots.manage | detail-with-related-records | /backend/eudr/plots | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/product-mappings/[id] | Edit product mapping | eudr.mappings.manage | detail-with-related-records | /backend/eudr/product-mappings | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/risk-assessments/[id] | Edit risk assessment | eudr.risk.manage | detail-with-related-records | /backend/eudr/risk-assessments | inline-declared | source-literals-only |
| backend | eudr | /backend/eudr/statements/[id] | Edit statement | eudr.statements.manage | detail-with-related-records | /backend/eudr/statements | inline-declared | source-literals-only |
| backend | webhooks | /backend/webhooks/create | Create Webhook | webhooks.manage | CrudForm | /backend/webhooks | inline-declared | source-literals-only |
| backend | webhooks | /backend/webhooks | Webhooks | webhooks.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | webhooks | /backend/webhooks/[id] | Webhook Detail | webhooks.view | detail-with-related-records | /backend/webhooks | inline-declared | source-literals-only |
| backend | customer_accounts | /backend/customer_accounts/roles/create | Create Customer Role | customer_accounts.roles.manage | CrudForm | /backend/customer_accounts/roles | inline-declared | source-literals-only |
| backend | customer_accounts | /backend/customer_accounts/roles | Customer Roles | customer_accounts.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | customer_accounts | /backend/customer_accounts/settings/domain | Custom Domain | customer_accounts.domain.manage | inspect-existing-surface | unresolved-parent | reference-partially-resolved | source-literals-only |
| backend | customer_accounts | /backend/customer_accounts/settings | Portal Settings | customer_accounts.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | customer_accounts | /backend/customer_accounts/users | Customer Users | customer_accounts.view | inspect-existing-surface | unresolved-parent | reference-partially-resolved | unmapped |
| backend | customer_accounts | /backend/customer_accounts/roles/[id] | Customer Role Detail | customer_accounts.roles.manage | detail-with-related-records | /backend/customer_accounts/roles | inline-declared | source-literals-only |
| backend | customer_accounts | /backend/customer_accounts/users/[id] | Customer User Detail | customer_accounts.view | detail-with-related-records | /backend/customer_accounts/users | inline-declared | unmapped |
| frontend | auth | /reset/[token] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | unresolved-reference | source-literals-only |
| frontend | auth | /login | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | source-literals-only |
| frontend | auth | /reset | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | source-literals-only |
| frontend | sales | /quote/[token] | Quote | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | warranty_claims | /[orgSlug]/portal/claims/[id] | Claim detail | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | warranty_claims | /[orgSlug]/portal/claims/new | New claim | 未声明/待验证 | CrudForm | unresolved-parent | inline-declared | source-literals-only |
| frontend | warranty_claims | /[orgSlug]/portal/claims | My claims | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | content | /privacy | Privacy Policy | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| frontend | content | /terms | Terms of Service | 未声明/待验证 | inspect-existing-surface | unresolved-parent | inline-declared | unmapped |
| frontend | onboarding | /onboarding | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | unmapped |
| frontend | onboarding | /onboarding/preparing | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | unmapped |
| frontend | api_docs | /docs/api | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | source-literals-only |
| frontend | workflows | /checkout-demo | inspect-page-component | 未声明/待验证 | inspect-existing-surface | unresolved-parent | unresolved-reference | source-literals-only |
| frontend | workflows | /[orgSlug]/portal/tasks/[id] | Task | portal.tasks.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | workflows | /[orgSlug]/portal/tasks | Tasks | portal.tasks.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | staff | /[orgSlug]/portal/time-reports/[id] | Time report | portal.time_reports.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | staff | /[orgSlug]/portal/time-reports | Time reports | portal.time_reports.view | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | messages | /messages/view/[token] | Message | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | checkout | /pay/[slug]/cancel/[transactionId] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| frontend | checkout | /pay/[slug] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | checkout | /pay/[slug]/success/[transactionId] | inspect-page-component | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| frontend | portal | /[orgSlug]/portal/dashboard | Dashboard | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| frontend | portal | /[orgSlug]/portal/invite | Accept Invitation | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | portal | /[orgSlug]/portal/login | Log In | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | portal | /[orgSlug]/portal | Customer Portal | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| frontend | portal | /[orgSlug]/portal/profile | Profile | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | unmapped |
| frontend | portal | /[orgSlug]/portal/reset-password | Reset Password | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | portal | /[orgSlug]/portal/signup | Sign Up | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |
| frontend | portal | /[orgSlug]/portal/verify | Verify Email | 未声明/待验证 | detail-with-related-records | unresolved-parent | inline-declared | source-literals-only |

## 逐页源码与接口引用证据

### `/backend/auth/profile`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/auth/profile/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L38：`/api/auth/profile`，未证实运行调用
- API字面量 L130：`/api/auth/profile`，未证实运行调用
- 请求调用 L38：apiCall("/api/auth/profile")；尚未运行验证。
- 请求调用 L129：readApiResultOrThrow("/api/auth/profile")；尚未运行验证。

### `/backend/profile/change-password`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/profile/change-password/page.js`
- 导航覆盖：{"key":"profile.sections.account"}
- 现有组件导入：CrudForm, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/profile
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L37：`/api/auth/profile`，未证实运行调用
- API字面量 L129：`/api/auth/profile`，未证实运行调用
- 请求调用 L37：apiCall("/api/auth/profile")；尚未运行验证。
- 请求调用 L128：readApiResultOrThrow("/api/auth/profile")；尚未运行验证。

### `/backend/profile`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/profile/page.js`
- 导航覆盖：{"key":"profile.sections.account"}
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/roles/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/roles/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/roles
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L21：`/api/auth/roles?page=1&pageSize=1`，未证实运行调用
- 请求调用 L20：apiCall("/api/auth/roles?page=1&pageSize=1")；尚未运行验证。
- 请求调用 L105：createCrud("auth/roles")；尚未运行验证。

### `/backend/roles`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/roles/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.users"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L43：`/api/auth/roles?${params.toString()}`，动态部分待绑定
- API模板 L77：`/api/auth/roles?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L42：readApiResultOrThrow(`/api/auth/roles?${params.toString()}`)；尚未运行验证。
- 请求调用 L76：apiCall(`/api/auth/roles?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/settings/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sidebar-customization`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/sidebar-customization/page.js`
- 导航覆盖：{"key":"profile.sections.account","order":3,"context":"profile"}
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/users/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/users/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/users
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L81：`/api/dashboards/widgets/catalog`，未证实运行调用
- API字面量 L125：`/api/auth/users?page=1&pageSize=1`，未证实运行调用
- 请求调用 L81：apiCall("/api/dashboards/widgets/catalog")；尚未运行验证。
- 请求调用 L125：apiCall("/api/auth/users?page=1&pageSize=1")；尚未运行验证。
- 请求调用 L304：createCrud("auth/users")；尚未运行验证。
- 请求调用 L312：updateCrud("dashboards/users/widgets")；尚未运行验证。

### `/backend/users`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/users/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.users"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L28：`/api/directory/organizations?${search.toString()}`，动态部分待绑定
- API模板 L49：`/api/auth/roles?${search.toString()}`，动态部分待绑定
- API模板 L71：`/api/auth/roles?${search.toString()}`，动态部分待绑定
- API模板 L279：`/api/auth/users?${params2.toString()}`，动态部分待绑定
- API模板 L294：`/api/auth/users?${params2.toString()}`，动态部分待绑定
- API模板 L315：`/api/auth/users?${params}`，动态部分待绑定
- API模板 L364：`/api/auth/users?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L27：apiCall(`/api/directory/organizations?${search.toString()}`)；尚未运行验证。
- 请求调用 L49：apiCall(`/api/auth/roles?${search.toString()}`)；尚未运行验证。
- 请求调用 L71：apiCall(`/api/auth/roles?${search.toString()}`)；尚未运行验证。
- 请求调用 L314：apiCall(`/api/auth/users?${params}`)；尚未运行验证。
- 请求调用 L364：apiCall(`/api/auth/users?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/roles/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/roles/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, Alert
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/roles
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L36：`/api/auth/roles?id=${encodeURIComponent(roleId)}`，动态部分待绑定
- 请求调用 L36：apiCall(`/api/auth/roles?id=${encodeURIComponent(roleId)}`)；尚未运行验证。
- 请求调用 L202：updateCrud("auth/roles")；尚未运行验证。
- 请求调用 L204：updateCrud("auth/roles")；尚未运行验证。
- 请求调用 L207：updateCrud("auth/roles/acl")；尚未运行验证。
- 请求调用 L223：deleteCrud("auth/roles")；尚未运行验证。

### `/backend/users/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/backend/users/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/users
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L89：`/api/auth/users/resend-invite`，未证实运行调用
- API字面量 L207：`/api/auth/feature-check`，未证实运行调用
- API模板 L129：`/api/auth/roles?id=${encodeURIComponent(roleId)}&page=1&pageSize=1`，动态部分待绑定
- API模板 L164：`/api/auth/users?id=${encodeURIComponent(String(id))}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L89：apiCall("/api/auth/users/resend-invite")；尚未运行验证。
- 请求调用 L128：apiCall(`/api/auth/roles?id=${encodeURIComponent(roleId)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L163：apiCall(`/api/auth/users?id=${encodeURIComponent(String(id))}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L206：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L457：updateCrud("auth/users")；尚未运行验证。
- 请求调用 L459：updateCrud("auth/users")；尚未运行验证。
- 请求调用 L462：updateCrud("auth/users/acl")；尚未运行验证。
- 请求调用 L478：deleteCrud("auth/users")；尚未运行验证。

### `/backend/directory/branding`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/branding/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.users"}
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L19：`/api/directory/organization-branding`，未证实运行调用
- API字面量 L67：`/api/attachments`，未证实运行调用
- 请求调用 L38：readApiResultOrThrow(BRANDING_API)；尚未运行验证。
- 请求调用 L66：readApiResultOrThrow("/api/attachments")；尚未运行验证。

### `/backend/directory/organizations/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/organizations/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/directory/organizations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L65：`/api/auth/roles?page=1&pageSize=1`，未证实运行调用
- API模板 L54：`/api/directory/organizations?${params.toString()}`，动态部分待绑定
- 请求调用 L54：apiCall(`/api/directory/organizations?${params.toString()}`)；尚未运行验证。
- 请求调用 L65：apiCall("/api/auth/roles?page=1&pageSize=1")；尚未运行验证。
- 请求调用 L179：createCrud("directory/organizations")；尚未运行验证。

### `/backend/directory/organizations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/organizations/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.users"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L44：`/api/auth/feature-check`，未证实运行调用
- API模板 L76：`/api/directory/organizations?${queryParams}`，动态部分待绑定
- API模板 L163：`/api/directory/organizations?id=${encodeURIComponent(org.id)}`，动态部分待绑定
- 请求调用 L44：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L75：readApiResultOrThrow(`/api/directory/organizations?${queryParams}`)；尚未运行验证。

### `/backend/directory/tenants/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/tenants/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/directory/tenants
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 请求调用 L39：createCrud("directory/tenants")；尚未运行验证。

### `/backend/directory/tenants`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/tenants/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L57：`/api/auth/feature-check`，未证实运行调用
- API模板 L91：`/api/directory/tenants?${queryParams}`，动态部分待绑定
- API模板 L119：`/api/directory/tenants?id=${encodeURIComponent(tenant.id)}`，动态部分待绑定
- 请求调用 L57：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L90：readApiResultOrThrow(`/api/directory/tenants?${queryParams}`)；尚未运行验证。

### `/backend/directory/organizations/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/organizations/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/directory/organizations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L42：`/api/auth/roles?page=1&pageSize=1`，未证实运行调用
- API模板 L63：`/api/directory/organizations?${treeParams.toString()}`，动态部分待绑定
- API模板 L88：`/api/directory/organizations?view=manage&ids=${currentOrgId}&status=all&includeInactive=true&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L42：apiCall("/api/auth/roles?page=1&pageSize=1")；尚未运行验证。
- 请求调用 L63：apiCall(`/api/directory/organizations?${treeParams.toString()}`)；尚未运行验证。
- 请求调用 L87：apiCall(`/api/directory/organizations?view=manage&ids=${currentOrgId}&status=all&includeInactive=true&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L270：deleteCrud("directory/organizations")；尚未运行验证。
- 请求调用 L279：updateCrud("directory/organizations")；尚未运行验证。

### `/backend/directory/tenants/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/directory/backend/directory/tenants/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/directory/tenants
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L42：`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`，动态部分待绑定
- API模板 L134：`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`，动态部分待绑定
- 请求调用 L41：readApiResultOrThrow(`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`)；尚未运行验证。
- 请求调用 L129：updateCrud("directory/tenants")；尚未运行验证。
- 请求调用 L133：apiCall(`/api/directory/tenants?id=${encodeURIComponent(tenantId)}`)；尚未运行验证。

### `/backend/calendar`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/calendar/page.js`
- 导航覆盖：{"key":"crmNav.group.home","order":40}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：29文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/calendar/CalendarScreen.js:49`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/calendar/useCalendarItems.js:24`：apiCall(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/calendar/useCalendarItems.js:83`：apiCall("/api/customers/dictionaries/activity-types")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/customers/deals`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/config/customers/deals/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business","context":"settings"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L30：`/api/customers/settings/stuck-threshold`，未证实运行调用
- API字面量 L75：`/api/customers/settings/stuck-threshold`，未证实运行调用
- 请求调用 L29：readApiResultOrThrow("/api/customers/settings/stuck-threshold")；尚未运行验证。

### `/backend/config/customers`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/config/customers/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/AddressFormatSettings.js:47`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/AddressFormatSettings.js:83`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:96`：readApiResultOrThrow("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:110`：readApiResultOrThrow(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:150`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:168`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:204`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:250`：apiCall("/api/customers/pipeline-stages")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:270`：apiCall("/api/customers/pipeline-stages")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:306`：apiCall("/api/customers/pipeline-stages")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/PipelineSettings.js:343`：apiCall("/api/customers/pipeline-stages/reorder")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/DictionarySortSettings.js:108`：readApiResultOrThrow("/api/customers/settings/dictionary-sort-modes")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/DictionarySettings.js:185`：readApiResultOrThrow(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/customers/pipeline-stages`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/config/customers/pipeline-stages/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L70：`/api/customers/pipelines`，未证实运行调用
- API字面量 L129：`/api/customers/pipelines`，未证实运行调用
- API字面量 L157：`/api/customers/pipelines`，未证实运行调用
- API字面量 L199：`/api/customers/pipelines`，未证实运行调用
- API字面量 L246：`/api/customers/pipeline-stages`，未证实运行调用
- API字面量 L271：`/api/customers/pipeline-stages`，未证实运行调用
- API字面量 L313：`/api/customers/pipeline-stages`，未证实运行调用
- API字面量 L347：`/api/customers/pipeline-stages/reorder`，未证实运行调用
- API模板 L89：`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`，动态部分待绑定
- 请求调用 L70：apiCall("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L88：apiCall(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)；尚未运行验证。
- 请求调用 L129：apiCall("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L157：apiCall("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L199：apiCall("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L246：apiCall("/api/customers/pipeline-stages")；尚未运行验证。
- 请求调用 L271：apiCall("/api/customers/pipeline-stages")；尚未运行验证。
- 请求调用 L313：apiCall("/api/customers/pipeline-stages")；尚未运行验证。
- 请求调用 L347：apiCall("/api/customers/pipeline-stages/reorder")；尚未运行验证。

### `/backend/customer-tasks`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customer-tasks/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/CustomerTodosTable.js:106`：readApiResultOrThrow(`${CUSTOMER_TASKS_API_PATH}?${queryString}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customers/companies/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/customers/companies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：17文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:63`：readApiResultOrThrow(`/api/customers/${basePath}/${entityId}/roles`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:79`：readApiResultOrThrow("/api/customers/dictionaries/person-company-roles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/hooks/useEmailDuplicateCheck.js:33`：apiCall(`/api/customers/people?${params.join("&")}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/utils/phoneDuplicates.js:12`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/AddressTiles.js:144`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useAddressTypes.js:36`：apiCall("/api/customers/dictionaries/address-types")，未运行验证。
- 请求调用 L64：createCrud("customers/companies")；尚未运行验证。
- 请求调用 L105：createCrud("customers/addresses")；尚未运行验证。

### `/backend/customers/companies`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:65`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:110`：readApiResultOrThrow(`/api/staff/team-members/assignable?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:141`：readApiResultOrThrow("/api/auth/profile")，未运行验证。
- API模板 L323：`/api/customers/companies?${queryParams}`，动态部分待绑定
- API模板 L372：`/api/customers/companies?id=${encodeURIComponent(company.id)}`，动态部分待绑定
- API模板 L407：`/api/customers/companies?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L323：apiCall(`/api/customers/companies?${queryParams}`)；尚未运行验证。

### `/backend/customers/deals/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/customers/deals
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：28文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/create/CreateDealForm.js:136`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:97`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:112`：apiCall(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:419`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:442`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:466`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:489`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/create/useDealPipelines.js:18`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/create/useDealPipelines.js:38`：apiCall(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customers/deals/map`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/deals
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：19文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/components/DealsMapView.js:170`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/components/DealsMapView.js:181`：apiCall("/api/customers/pipeline-stages")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/components/DealsMapView.js:242`：readApiResultOrThrow(`/api/customers/deals/map?${buildParams(page).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/components/DealsMapView.js:372`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/map/components/DealsMapView.js:401`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:65`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:110`：readApiResultOrThrow(`/api/staff/team-members/assignable?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:141`：readApiResultOrThrow("/api/auth/profile")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customers/deals`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：13文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/DealsKpiStrip.js:94`：apiCall("/api/customers/deals/summary")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:65`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:110`：readApiResultOrThrow(`/api/staff/team-members/assignable?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:141`：readApiResultOrThrow("/api/auth/profile")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/reassignDealOwner.js:4`：apiCall(BULK_UPDATE_OWNER_ENDPOINT)，未运行验证。
- API字面量 L261：`/api/customers/pipelines`，未证实运行调用
- API模板 L321：`/api/customers/deals?${queryParams}`，动态部分待绑定
- 请求调用 L261：apiCall("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L321：apiCall(`/api/customers/deals?${queryParams}`)；尚未运行验证。
- 请求调用 L410：deleteCrud("customers/deals")；尚未运行验证。
- 请求调用 L537：deleteCrud("customers/deals")；尚未运行验证。

### `/backend/customers/deals/pipeline`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/pipeline/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Alert, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/deals
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：34文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/pipeline/components/QuickDealDialog.js:256`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/pipeline/components/AddStageDialog.js:271`：createCrud("customers/pipeline-stages")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/pipeline/components/ActivityComposerDialog.js:143`：createCrud("customers/interactions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:65`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:110`：readApiResultOrThrow(`/api/staff/team-members/assignable?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:141`：readApiResultOrThrow("/api/auth/profile")，未运行验证。
- API字面量 L334：`/api/customers/pipelines`，未证实运行调用
- API字面量 L410：`/api/customers/companies?page=1&pageSize=100&sortField=display_name&sortDir=asc`，未证实运行调用
- API字面量 L873：`/api/customers/deals`，未证实运行调用
- API字面量 L992：`/api/customers/deals/bulk-update-stage`，未证实运行调用
- API字面量 L1383：`/api/customers/deals`，未证实运行调用
- API字面量 L1551：`/api/customers/deals/bulk-update-stage`，未证实运行调用
- API字面量 L1623：`/api/customers/deals/bulk-update-owner`，未证实运行调用
- API字面量 L1815：`/api/customers/deals`，未证实运行调用
- API模板 L430：`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(selectedPipelineId)}`，动态部分待绑定
- API模板 L491：`/api/customers/deals/aggregate?${params.toString()}`，动态部分待绑定
- API模板 L570：`/api/customers/deals?${params.toString()}`，动态部分待绑定
- API模板 L708：`/api/customers/deals?${params.toString()}`，动态部分待绑定
- API模板 L1971：`/api/customers/people?${params.toString()}`，动态部分待绑定
- API模板 L1998：`/api/customers/companies?${params.toString()}`，动态部分待绑定
- 请求调用 L333：readApiResultOrThrow("/api/customers/pipelines")；尚未运行验证。
- 请求调用 L409：apiCall("/api/customers/companies?page=1&pageSize=100&sortField=display_name&sortDir=asc")；尚未运行验证。
- 请求调用 L429：readApiResultOrThrow(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(selectedPipelineId)}`)；尚未运行验证。
- 请求调用 L490：apiCall(`/api/customers/deals/aggregate?${params.toString()}`)；尚未运行验证。
- 请求调用 L569：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)；尚未运行验证。
- 请求调用 L707：apiCall(`/api/customers/deals?${params.toString()}`)；尚未运行验证。
- 请求调用 L1461：deleteCrud("customers/deals")；尚未运行验证。
- 请求调用 L1724：deleteCrud("customers/deals")；尚未运行验证。
- 请求调用 L1971：apiCall(`/api/customers/people?${params.toString()}`)；尚未运行验证。
- 请求调用 L1997：apiCall(`/api/customers/companies?${params.toString()}`)；尚未运行验证。

### `/backend/customers/people/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/customers/people
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：17文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:63`：readApiResultOrThrow(`/api/customers/${basePath}/${entityId}/roles`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:79`：readApiResultOrThrow("/api/customers/dictionaries/person-company-roles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/hooks/useEmailDuplicateCheck.js:33`：apiCall(`/api/customers/people?${params.join("&")}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/utils/phoneDuplicates.js:12`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/AddressTiles.js:144`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useAddressTypes.js:36`：apiCall("/api/customers/dictionaries/address-types")，未运行验证。
- 请求调用 L66：createCrud("customers/people")；尚未运行验证。
- 请求调用 L107：createCrud("customers/addresses")；尚未运行验证。

### `/backend/customers/people`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:65`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:110`：readApiResultOrThrow(`/api/staff/team-members/assignable?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/lib/assignableStaff.js:141`：readApiResultOrThrow("/api/auth/profile")，未运行验证。
- API模板 L334：`/api/customers/people?${queryParams}`，动态部分待绑定
- API模板 L383：`/api/customers/people?id=${encodeURIComponent(person.id)}`，动态部分待绑定
- API模板 L418：`/api/customers/people?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L334：apiCall(`/api/customers/people?${queryParams}`)；尚未运行验证。

### `/backend/customers/companies-v2/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies-v2/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage, LoadingMessage, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/companies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:298`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:437`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:447`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:462`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:472`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:548`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:620`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/CompanyPeopleSection.js:167`：readApiResultOrThrow(`/api/customers/companies/${encodeURIComponent(companyId)}/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ScheduleActivityDialog.js:311`：readApiResultOrThrow(`/api/customers/interactions/conflicts?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:185`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: PAGE_SIZE,             offset: pageIndex * PAGE_SIZE,             sorting,             includeTotal: true           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:197`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:209`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: yesterdayStart,             before: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:78`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:193`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:216`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesCard.js:90`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityHistorySection.js:139`：readApiResultOrThrow(`/api/customers/interactions/counts?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityHistorySection.js:188`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityHistorySection.js:204`：readApiResultOrThrow(`/api/customers/activities?entityId=${encodeURIComponent(entityId)}&page=${legacyPage}&pageSize=20&sortField=occurredAt&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/CreatePersonDialog.js:81`：createCrud("customers/people")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:63`：readApiResultOrThrow(`/api/customers/${basePath}/${entityId}/roles`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/RolesSection.js:79`：readApiResultOrThrow("/api/customers/dictionaries/person-company-roles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/personAdapter.js:32`：readApiResultOrThrow(`/api/customers/people/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/personAdapter.js:136`：readApiResultOrThrow(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/personAdapter.js:156`：readApiResultOrThrow(`/api/customers/people?${params.toString()}`)，未运行验证。
- API模板 L124：`/api/customers/companies/${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L123：readApiResultOrThrow(`/api/customers/companies/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L301：deleteCrud("customers/companies")；尚未运行验证。
- 请求调用 L337：updateCrud("customers/companies")；尚未运行验证。

### `/backend/customers/companies/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/companies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:150`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:174`：readApiResultOrThrow(`/api/customers/activities?${legacyParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/TagsSection.js:24`：readApiResultOrThrow(`/api/customers/tags?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:298`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:437`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:447`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:462`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:472`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:548`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:620`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:26`：readApiResultOrThrow(`/api/customers/addresses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:122`：apiCall("/api/customers/dictionaries/address-types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:156`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/CompanyPeopleSection.js:167`：readApiResultOrThrow(`/api/customers/companies/${encodeURIComponent(companyId)}/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:17`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:31`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityTimelineFilters.js:40`：readApiResultOrThrow(`/api/customers/interactions/counts?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/authorUserLookup.js:18`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:78`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:193`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:216`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/usePersonTasks.js:140`：readApiResultOrThrow(`/api/customers/todos?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useInteractions.js:63`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/hooks/useEmailDuplicateCheck.js:33`：apiCall(`/api/customers/people?${params.join("&")}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/utils/phoneDuplicates.js:12`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/CreatePersonDialog.js:81`：createCrud("customers/people")，未运行验证。
- API字面量 L249：`/api/customers/companies`，未证实运行调用
- API字面量 L345：`/api/customers/companies`，未证实运行调用
- API模板 L216：`/api/customers/companies/${encodeURIComponent(companyId2)}?${search.toString()}`，动态部分待绑定
- API模板 L420：`/api/customers/companies?id=${encodeURIComponent(currentCompanyId)}`，动态部分待绑定
- 请求调用 L215：readApiResultOrThrow(`/api/customers/companies/${encodeURIComponent(companyId2)}?${search.toString()}`)；尚未运行验证。

### `/backend/customers/deals/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：EmptyState, Page, PageBody, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/deals
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:150`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:174`：readApiResultOrThrow(`/api/customers/activities?${legacyParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:185`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: PAGE_SIZE,             offset: pageIndex * PAGE_SIZE,             sorting,             includeTotal: true           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:197`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:209`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: yesterdayStart,             before: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:97`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:112`：apiCall(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:419`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:442`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:466`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:489`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ScheduleActivityDialog.js:311`：readApiResultOrThrow(`/api/customers/interactions/conflicts?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:17`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:31`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealActivities.js:12`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealAssociations.js:41`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(currentDealId)}/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealAssociations.js:63`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(currentDealId)}/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealAssociations.js:84`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealAssociations.js:122`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealClosure.js:26`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(currentDealId)}/stats`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealClosure.js:41`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealClosure.js:73`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealData.js:10`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealFormHandlers.js:34`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealFormHandlers.js:58`：deleteCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/[id]/hooks/useDealPipeline.js:27`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityTimelineFilters.js:40`：readApiResultOrThrow(`/api/customers/interactions/counts?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/authorUserLookup.js:18`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customers/people-v2/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people-v2/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/people
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:150`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:174`：readApiResultOrThrow(`/api/customers/activities?${legacyParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailThreadsTab.js:77`：apiCall(`/api/customers/people/${encodeURIComponent(personId)}/email-threads`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailThreadsTab.js:100`：apiCall("/api/communication_channels/me/channels")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailThreadsTab.js:118`：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channelId)}/poll-now`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailThreadsTab.js:170`：apiCall(`/api/customers/people/${encodeURIComponent(personId)}/emails`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesCard.js:90`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:298`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:437`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:447`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:462`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:472`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:548`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:620`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ScheduleActivityDialog.js:311`：readApiResultOrThrow(`/api/customers/interactions/conflicts?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:185`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: PAGE_SIZE,             offset: pageIndex * PAGE_SIZE,             sorting,             includeTotal: true           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:197`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ChangelogTab.js:209`：readApiResultOrThrow(buildQueryUrl({             entityId,             entityType,             dateRange: filters.dateRange,             filters,             limit: 1,             sorting,             includeTotal: true,             after: yesterdayStart,             before: todayStart           }))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:26`：readApiResultOrThrow(`/api/customers/addresses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:122`：apiCall("/api/customers/dictionaries/address-types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:156`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonCompaniesSection.js:118`：readApiResultOrThrow(`/api/customers/people/${encodeURIComponent(personId)}/companies/enriched?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityTimelineFilters.js:40`：readApiResultOrThrow(`/api/customers/interactions/counts?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/authorUserLookup.js:18`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailShareControl.js:36`：apiCall(`/api/customers/people/${encodeURIComponent(personId)}/email-share`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonEmailShareControl.js:73`：apiCall(`/api/customers/people/${encodeURIComponent(personId)}/email-share`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesDayStrip.js:164`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:78`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:193`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:216`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/usePersonTasks.js:140`：readApiResultOrThrow(`/api/customers/todos?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useInteractions.js:63`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- API模板 L119：`/api/customers/people/${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L118：readApiResultOrThrow(`/api/customers/people/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L306：updateCrud("customers/people")；尚未运行验证。
- 请求调用 L333：deleteCrud("customers/people")；尚未运行验证。

### `/backend/customers/people/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customers/backend/customers/people/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customers/people
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:150`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivitiesSection.js:174`：readApiResultOrThrow(`/api/customers/activities?${legacyParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/TagsSection.js:24`：readApiResultOrThrow(`/api/customers/tags?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:298`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:437`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:447`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:462`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(dealId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:472`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:548`：createCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealsSection.js:620`：updateCrud("customers/deals")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:26`：readApiResultOrThrow(`/api/customers/addresses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:122`：apiCall("/api/customers/dictionaries/address-types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/AddressesSection.js:156`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/PersonHighlights.js:87`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:17`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/notesAdapter.js:31`：readApiResultOrThrow(`/api/customers/comments?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/ActivityTimelineFilters.js:40`：readApiResultOrThrow(`/api/customers/interactions/counts?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/authorUserLookup.js:18`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:78`：readApiResultOrThrow(`/api/customers/deals/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:193`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/linking/adapters/dealAdapter.js:216`：readApiResultOrThrow(`/api/customers/deals?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCurrencyDictionary.js:10`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useCustomerDictionary.js:17`：readApiResultOrThrow(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/usePersonTasks.js:140`：readApiResultOrThrow(`/api/customers/todos?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/hooks/useInteractions.js:63`：readApiResultOrThrow(`/api/customers/interactions?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:145`：apiCall(`/api/customers/dictionaries/${kind}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:383`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/formConfig.js:396`：readApiResultOrThrow("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/backend/hooks/useEmailDuplicateCheck.js:33`：apiCall(`/api/customers/people?${params.join("&")}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/utils/phoneDuplicates.js:12`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:97`：apiCall("/api/customers/pipelines")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:112`：apiCall(`/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:419`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:442`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:466`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customers/components/detail/DealForm.js:489`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- API字面量 L248：`/api/customers/people`，未证实运行调用
- API字面量 L364：`/api/customers/people`，未证实运行调用
- API模板 L218：`/api/customers/people/${encodeURIComponent(id)}?include=todos`，动态部分待绑定
- API模板 L317：`/api/customers/people?id=${encodeURIComponent(personId)}`，动态部分待绑定
- 请求调用 L217：readApiResultOrThrow(`/api/customers/people/${encodeURIComponent(id)}?include=todos`)；尚未运行验证。

### `/backend/config/encryption`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/config/encryption/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/components/EncryptionManager.js:119`：readApiResultOrThrow("/api/entities/entities")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/components/EncryptionManager.js:164`：readApiResultOrThrow(`/api/entities/encryption?entityId=${encodeURIComponent(selectedEntityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/components/EncryptionManager.js:209`：apiCall("/api/entities/encryption")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/config/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced","title":"自定义实体设置"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/components/EntitySettingsManager.js:29`：readApiResultOrThrow("/api/entities/entity-settings")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/entities/system`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/system/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/entities/user/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：CrudForm, LoadingMessage, Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/entities/user
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L25：`/api/entities/entity-settings`，未证实运行调用
- API字面量 L107：`/api/entities/entities`，未证实运行调用
- 请求调用 L24：readApiResultOrThrow("/api/entities/entity-settings")；尚未运行验证。
- 请求调用 L106：readApiResultOrThrow("/api/entities/entities")；尚未运行验证。
- 请求调用 L114：createCrud("entities/entities")；尚未运行验证。

### `/backend/entities/user`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/entities/system/[entityId]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/system/[entityId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:149`：readApiResultOrThrow("/api/entities/entities")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:177`：readApiResultOrThrow(`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:226`：apiCall("/api/entities/definitions.restore")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:234`：readApiResultOrThrow(`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:271`：apiCall("/api/entities/definitions.batch")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:295`：apiCall("/api/entities/definitions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:358`：apiCall("/api/entities/definitions.batch")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:495`：apiCall("/api/entities/entities")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:516`：apiCall("/api/entities/definitions.batch")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js:577`：apiCall("/api/entities/entities")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/entities/user/[entityId]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：CrudForm, Page, PageBody, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L150：`/api/entities/entities`，未证实运行调用
- API字面量 L226：`/api/entities/definitions.restore`，未证实运行调用
- API字面量 L271：`/api/entities/definitions.batch`，未证实运行调用
- API字面量 L295：`/api/entities/definitions`，未证实运行调用
- API字面量 L358：`/api/entities/definitions.batch`，未证实运行调用
- API字面量 L495：`/api/entities/entities`，未证实运行调用
- API字面量 L516：`/api/entities/definitions.batch`，未证实运行调用
- API字面量 L577：`/api/entities/entities`，未证实运行调用
- API模板 L178：`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`，动态部分待绑定
- API模板 L235：`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`，动态部分待绑定
- 请求调用 L149：readApiResultOrThrow("/api/entities/entities")；尚未运行验证。
- 请求调用 L177：readApiResultOrThrow(`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`)；尚未运行验证。
- 请求调用 L226：apiCall("/api/entities/definitions.restore")；尚未运行验证。
- 请求调用 L234：readApiResultOrThrow(`/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`)；尚未运行验证。
- 请求调用 L271：apiCall("/api/entities/definitions.batch")；尚未运行验证。
- 请求调用 L295：apiCall("/api/entities/definitions")；尚未运行验证。
- 请求调用 L358：apiCall("/api/entities/definitions.batch")；尚未运行验证。
- 请求调用 L495：apiCall("/api/entities/entities")；尚未运行验证。
- 请求调用 L516：apiCall("/api/entities/definitions.batch")；尚未运行验证。
- 请求调用 L577：apiCall("/api/entities/entities")；尚未运行验证。

### `/backend/entities/user/[entityId]/records/[recordId]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/records/[recordId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L50：`/api/entities/records?entityId=${encodeURIComponent(entityId)}&page=1&pageSize=1&sortField=id&sortDir=asc&id=${encodeURIComponent(recordId)}`，动态部分待绑定
- API模板 L99：`/api/entities/records?entityId=${encodeURIComponent(entityId)}&recordId=${encodeURIComponent(recordId)}`，动态部分待绑定
- 请求调用 L13：updateCrud("entities/records")；尚未运行验证。
- 请求调用 L49：readApiResultOrThrow(`/api/entities/records?entityId=${encodeURIComponent(entityId)}&page=1&pageSize=1&sortField=id&sortDir=asc&id=${encodeURIComponent(recordId)}`)；尚未运行验证。
- 请求调用 L98：apiCall(`/api/entities/records?entityId=${encodeURIComponent(entityId)}&recordId=${encodeURIComponent(recordId)}`)；尚未运行验证。

### `/backend/entities/user/[entityId]/records/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/records/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：CrudForm, ErrorMessage, LoadingMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L13：createCrud("entities/records")；尚未运行验证。

### `/backend/entities/user/[entityId]/records`

- 源文件：`node_modules/@open-mercato/core/dist/modules/entities/backend/entities/user/[entityId]/records/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L116：`/api/entities/records?${params2.toString()}`，动态部分待绑定
- API模板 L196：`/api/entities/records?${qp.toString()}`，动态部分待绑定
- API模板 L351：`/api/entities/records?entityId=${encodeURIComponent(entityId)}&recordId=${encodeURIComponent(recordId)}`，动态部分待绑定
- API模板 L367：`/api/entities/records?entityId=${encodeURIComponent(entityId)}&page=${page}&pageSize=${pageSize}`，动态部分待绑定
- 请求调用 L115：readApiResultOrThrow(`/api/entities/records?${params2.toString()}`)；尚未运行验证。
- 请求调用 L350：apiCall(`/api/entities/records?entityId=${encodeURIComponent(entityId)}&recordId=${encodeURIComponent(recordId)}`)；尚未运行验证。
- 请求调用 L366：readApiResultOrThrow(`/api/entities/records?entityId=${encodeURIComponent(entityId)}&page=${page}&pageSize=${pageSize}`)；尚未运行验证。

### `/backend/config/cache`

- 源文件：`node_modules/@open-mercato/core/dist/modules/configs/backend/config/cache/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/CachePanel.js:39`：readApiResultOrThrow(API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/CachePanel.js:56`：readApiResultOrThrow("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/CachePanel.js:98`：readApiResultOrThrow(API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/CachePanel.js:138`：readApiResultOrThrow(API_PATH)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/module-telemetry`

- 源文件：`node_modules/@open-mercato/core/dist/modules/configs/backend/config/module-telemetry/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/ModuleTelemetryPanel.js:639`：readApiResultOrThrow(API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/ModuleTelemetryPanel.js:685`：readApiResultOrThrow(API_PATH)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/system-status`

- 源文件：`node_modules/@open-mercato/core/dist/modules/configs/backend/config/system-status/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/configs/components/SystemStatusPanel.js:74`：readApiResultOrThrow(API_PATH)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/query-indexes`

- 源文件：`node_modules/@open-mercato/core/dist/modules/query_index/backend/query-indexes/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/query_index/components/QueryIndexesTable.js:208`：readApiResultOrThrow(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/audit-logs`

- 源文件：`node_modules/@open-mercato/core/dist/modules/audit_logs/backend/audit-logs/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.diagnostics"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- API模板 L40：`/api/audit_logs/audit-logs/actions?${params.toString()}`，动态部分待绑定
- API模板 L50：`/api/audit_logs/audit-logs/access?${params.toString()}`，动态部分待绑定
- 请求调用 L39：readApiResultOrThrow(`/api/audit_logs/audit-logs/actions?${params.toString()}`)；尚未运行验证。
- 请求调用 L49：readApiResultOrThrow(`/api/audit_logs/audit-logs/access?${params.toString()}`)；尚未运行验证。

### `/backend/config/attachments`

- 源文件：`node_modules/@open-mercato/core/dist/modules/attachments/backend/config/attachments/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentPartitionSettings.js:78`：readApiResultOrThrow("/api/attachments/partitions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentPartitionSettings.js:191`：apiCall("/api/attachments/partitions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentPartitionSettings.js:232`：apiCall(`/api/attachments/partitions?id=${encodeURIComponent(entry.id)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/storage/attachments`

- 源文件：`node_modules/@open-mercato/core/dist/modules/attachments/backend/storage/attachments/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentLibrary.js:510`：apiCall("/api/attachments")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentLibrary.js:627`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentLibrary.js:655`：apiCall(`/api/attachments/library?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentLibrary.js:823`：apiCall(`/api/attachments/library/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/attachments/components/AttachmentLibrary.js:849`：apiCall(`/api/attachments/library/${encodeURIComponent(deleteTarget.id)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/catalog/categories/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/categories/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/categories
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/categories/CategorySelect.js:11`：readApiResultOrThrow(`/api/catalog/categories?${search.toString()}`)，未运行验证。
- 请求调用 L34：createCrud("catalog/categories")；尚未运行验证。

### `/backend/catalog/categories`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/categories/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/categories/CategoriesDataTable.js:38`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/categories/CategoriesDataTable.js:68`：readApiResultOrThrow(`/api/catalog/categories?${queryParams}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/catalog/prices/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/prices/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/prices
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/prices/PriceScopeSelectors.js:19`：readApiResultOrThrow(`${path}?${search.toString()}`)，未运行验证。
- 请求调用 L60：createCrud("catalog/prices")；尚未运行验证。

### `/backend/catalog/prices`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/prices/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/prices/PricesDataTable.js:49`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/prices/PricesDataTable.js:78`：readApiResultOrThrow(`/api/catalog/prices?${queryParams}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/prices/useBatchLabels.js:16`：readApiResultOrThrow(`${path}?ids=${encodeURIComponent(key)}&pageSize=${Math.min(100, idCount)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/catalog/products/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/products
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L210：`/api/catalog/price-kinds?pageSize=100`，未证实运行调用
- API字面量 L231：`/api/sales/tax-rates?pageSize=100`，未证实运行调用
- API字面量 L622：`/api/attachments/transfer`，未证实运行调用
- API模板 L646：`/api/inbox_ops/proposals/${inboxDraft.proposalId}/actions/${inboxDraft.actionId}/complete`，动态部分待绑定
- API模板 L691：`/api/catalog/variants?id=${encodeURIComponent(variantId)}`，动态部分待绑定
- API模板 L698：`/api/catalog/products?id=${encodeURIComponent(productId)}`，动态部分待绑定
- 请求调用 L210：readApiResultOrThrow("/api/catalog/price-kinds?pageSize=100")；尚未运行验证。
- 请求调用 L231：readApiResultOrThrow("/api/sales/tax-rates?pageSize=100")；尚未运行验证。
- 请求调用 L550：createCrud("catalog/products")；尚未运行验证。
- 请求调用 L565：createCrud("catalog/product-unit-conversions")；尚未运行验证。
- 请求调用 L586：createCrud("catalog/variants")；尚未运行验证。
- 请求调用 L618：createCrud("catalog/prices")；尚未运行验证。
- 请求调用 L621：apiCall("/api/attachments/transfer")；尚未运行验证。
- 请求调用 L645：apiCall(`/api/inbox_ops/proposals/${inboxDraft.proposalId}/actions/${inboxDraft.actionId}/complete`)；尚未运行验证。
- 请求调用 L691：apiCall(`/api/catalog/variants?id=${encodeURIComponent(variantId)}`)；尚未运行验证。
- 请求调用 L698：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}`)；尚未运行验证。

### `/backend/catalog/products`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/products/ProductsDataTable.js:126`：readApiResultOrThrow(`/api/sales/channels?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/products/ProductsDataTable.js:151`：readApiResultOrThrow(`/api/catalog/categories?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/products/ProductsDataTable.js:177`：readApiResultOrThrow(`/api/catalog/tags?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/products/ProductsDataTable.js:430`：apiCall(`/api/catalog/products?${queryParams}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/products/ProductsDataTable.js:473`：deleteCrud("catalog/products")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/catalog`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/config/catalog/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/PriceKindSettings.js:89`：readApiResultOrThrow(`/api/catalog/price-kinds?pageSize=${PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/PriceKindSettings.js:151`：apiCall(path)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/PriceKindSettings.js:192`：apiCall("/api/catalog/price-kinds")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/UnitPriceDisplaySettings.js:21`：readApiResultOrThrow("/api/catalog/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/UnitPriceDisplaySettings.js:42`：apiCall("/api/catalog/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/lib/currencyOptions.js:5`：readApiResultOrThrow(`${CURRENCY_OPTIONS_URL}?limit=${CURRENCY_OPTIONS_LIMIT}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/catalog/categories/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/categories/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/categories
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/categories/CategorySelect.js:11`：readApiResultOrThrow(`/api/catalog/categories?${search.toString()}`)，未运行验证。
- API模板 L63：`/api/catalog/categories?view=manage&ids=${encodeURIComponent(categoryId)}&status=all&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L43：updateCrud("catalog/categories")；尚未运行验证。
- 请求调用 L62：apiCall(`/api/catalog/categories?view=manage&ids=${encodeURIComponent(categoryId)}&status=all&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L221：deleteCrud("catalog/categories")；尚未运行验证。

### `/backend/catalog/prices/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/prices/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/prices
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/components/prices/PriceScopeSelectors.js:19`：readApiResultOrThrow(`${path}?${search.toString()}`)，未运行验证。
- API模板 L65：`/api/catalog/prices?ids=${encodeURIComponent(priceId)}&pageSize=1`，动态部分待绑定
- 请求调用 L64：apiCall(`/api/catalog/prices?ids=${encodeURIComponent(priceId)}&pageSize=1`)；尚未运行验证。
- 请求调用 L152：updateCrud("catalog/prices")；尚未运行验证。
- 请求调用 L155：deleteCrud("catalog/prices")；尚未运行验证。

### `/backend/catalog/products/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/catalog/products
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/optionSchemaClient.js:7`：apiCall(`/api/catalog/option-schemas?id=${encodeURIComponent(id)}&page=1&pageSize=1`)，未运行验证。
- API字面量 L370：`/api/sales/tax-rates?pageSize=100`，未证实运行调用
- API字面量 L548：`/api/catalog/price-kinds?pageSize=100`，未证实运行调用
- API字面量 L1503：`/api/catalog/option-schemas?page=1&pageSize=100`，未证实运行调用
- API字面量 L1843：`/api/auth/feature-check`，未证实运行调用
- API模板 L220：`/api/sales/tax-rates?id=${encodeURIComponent(taxRateId)}&pageSize=1`，动态部分待绑定
- API模板 L239：`/api/catalog/variants?productId=${encodeURIComponent(id)}&page=1&pageSize=100`，动态部分待绑定
- API模板 L242：`/api/catalog/prices?productId=${encodeURIComponent(id)}&page=1&pageSize=100`，动态部分待绑定
- API模板 L301：`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product_variant)}&recordId=${encodeURIComponent(variant.id)}`，动态部分待绑定
- API模板 L350：`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product)}&recordId=${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L415：`/api/catalog/products?id=${encodeURIComponent(productId)}&page=1&pageSize=1&withDeleted=false`，动态部分待绑定
- API模板 L446：`/api/catalog/product-unit-conversions?productId=${encodeURIComponent(productId)}&page=1&pageSize=100`，动态部分待绑定
- 请求调用 L219：readApiResultOrThrow(`/api/sales/tax-rates?id=${encodeURIComponent(taxRateId)}&pageSize=1`)；尚未运行验证。
- 请求调用 L238：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(id)}&page=1&pageSize=100`)；尚未运行验证。
- 请求调用 L241：apiCall(`/api/catalog/prices?productId=${encodeURIComponent(id)}&page=1&pageSize=100`)；尚未运行验证。
- 请求调用 L300：apiCall(`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product_variant)}&recordId=${encodeURIComponent(variant.id)}`)；尚未运行验证。
- 请求调用 L349：apiCall(`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product)}&recordId=${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L370：readApiResultOrThrow("/api/sales/tax-rates?pageSize=100")；尚未运行验证。
- 请求调用 L414：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&page=1&pageSize=1&withDeleted=false`)；尚未运行验证。
- 请求调用 L445：apiCall(`/api/catalog/product-unit-conversions?productId=${encodeURIComponent(productId)}&page=1&pageSize=100`)；尚未运行验证。
- 请求调用 L548：readApiResultOrThrow("/api/catalog/price-kinds?pageSize=100")；尚未运行验证。
- 请求调用 L1040：deleteCrud("catalog/offers")；尚未运行验证。
- 请求调用 L1058：updateCrud("catalog/products")；尚未运行验证。
- 请求调用 L1086：deleteCrud("catalog/product-unit-conversions")；尚未运行验证。
- 请求调用 L1100：updateCrud("catalog/product-unit-conversions")；尚未运行验证。
- 请求调用 L1117：createCrud("catalog/product-unit-conversions")；尚未运行验证。
- 请求调用 L1502：apiCall("/api/catalog/option-schemas?page=1&pageSize=100")；尚未运行验证。
- 请求调用 L1526：deleteCrud("catalog/option-schemas")；尚未运行验证。
- 请求调用 L1582：updateCrud("catalog/option-schemas")；尚未运行验证。
- 请求调用 L1585：createCrud("catalog/option-schemas")；尚未运行验证。
- 请求调用 L1842：readApiResultOrThrow("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L1906：deleteCrud("catalog/variants")；尚未运行验证。
- 请求调用 L1947：createCrud("catalog/variants")；尚未运行验证。

### `/backend/catalog/products/[productId]/variants/[variantId]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/[variantId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/catalog/products
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/optionSchemaClient.js:7`：apiCall(`/api/catalog/option-schemas?id=${encodeURIComponent(id)}&page=1&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:53`：readApiResultOrThrow("/api/catalog/price-kinds?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:71`：readApiResultOrThrow("/api/sales/tax-rates?pageSize=200")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:107`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&page=1&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:298`：createCrud("catalog/variants")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:333`：apiCall("/api/attachments/transfer")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js:381`：createCrud("catalog/prices")，未运行验证。
- API字面量 L104：`/api/catalog/price-kinds?pageSize=100`，未证实运行调用
- API字面量 L122：`/api/sales/tax-rates?pageSize=200`，未证实运行调用
- API模板 L91：`/api/sales/tax-rates?id=${encodeURIComponent(taxRateId)}&pageSize=1`，动态部分待绑定
- API模板 L163：`/api/catalog/variants?id=${encodeURIComponent(variantId)}&page=1&pageSize=1`，动态部分待绑定
- API模板 L184：`/api/catalog/products?id=${encodeURIComponent(resolvedProductId)}&page=1&pageSize=1`，动态部分待绑定
- API模板 L532：`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product_variant)}&recordId=${encodeURIComponent(variantId)}`，动态部分待绑定
- API模板 L549：`/api/catalog/prices?variantId=${encodeURIComponent(variantId)}&page=${page}&pageSize=${pageSize}`，动态部分待绑定
- 请求调用 L90：readApiResultOrThrow(`/api/sales/tax-rates?id=${encodeURIComponent(taxRateId)}&pageSize=1`)；尚未运行验证。
- 请求调用 L103：readApiResultOrThrow("/api/catalog/price-kinds?pageSize=100")；尚未运行验证。
- 请求调用 L121：readApiResultOrThrow("/api/sales/tax-rates?pageSize=200")；尚未运行验证。
- 请求调用 L162：apiCall(`/api/catalog/variants?id=${encodeURIComponent(variantId)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L183：apiCall(`/api/catalog/products?id=${encodeURIComponent(resolvedProductId)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L454：updateCrud("catalog/variants")；尚未运行验证。
- 请求调用 L472：deleteCrud("catalog/variants")；尚未运行验证。
- 请求调用 L531：apiCall(`/api/attachments?entityId=${encodeURIComponent(E.catalog.catalog_product_variant)}&recordId=${encodeURIComponent(variantId)}`)；尚未运行验证。
- 请求调用 L548：apiCall(`/api/catalog/prices?variantId=${encodeURIComponent(variantId)}&page=${page}&pageSize=${pageSize}`)；尚未运行验证。
- 请求调用 L591：deleteCrud("catalog/prices")；尚未运行验证。
- 请求调用 L614：updateCrud("catalog/prices")；尚未运行验证。
- 请求调用 L617：createCrud("catalog/prices")；尚未运行验证。

### `/backend/catalog/products/[productId]/variants/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/[productId]/variants/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/catalog/products
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/catalog/backend/catalog/products/optionSchemaClient.js:7`：apiCall(`/api/catalog/option-schemas?id=${encodeURIComponent(id)}&page=1&pageSize=1`)，未运行验证。
- API字面量 L54：`/api/catalog/price-kinds?pageSize=100`，未证实运行调用
- API字面量 L72：`/api/sales/tax-rates?pageSize=200`，未证实运行调用
- API字面量 L334：`/api/attachments/transfer`，未证实运行调用
- API模板 L108：`/api/catalog/products?id=${encodeURIComponent(productId)}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L53：readApiResultOrThrow("/api/catalog/price-kinds?pageSize=100")；尚未运行验证。
- 请求调用 L71：readApiResultOrThrow("/api/sales/tax-rates?pageSize=200")；尚未运行验证。
- 请求调用 L107：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L298：createCrud("catalog/variants")；尚未运行验证。
- 请求调用 L333：apiCall("/api/attachments/transfer")；尚未运行验证。
- 请求调用 L381：createCrud("catalog/prices")；尚未运行验证。

### `/backend/config/sales`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/config/sales/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：14文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/StatusSettings.js:102`：readApiResultOrThrow(apiPaths[kind])，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/StatusSettings.js:194`：apiCall(apiPaths[kind])，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/StatusSettings.js:224`：apiCall(path)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/StatusSettings.js:251`：apiCall(path)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/TaxRatesSettings.js:117`：readApiResultOrThrow("/api/sales/tax-rates?pageSize=200")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/TaxRatesSettings.js:178`：apiCall("/api/sales/tax-rates")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/TaxRatesSettings.js:207`：apiCall("/api/sales/tax-rates")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/DocumentNumberSettings.js:87`：apiCall("/api/sales/settings/document-numbers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/OrderEditingSettings.js:69`：apiCall("/api/sales/settings/order-editing")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/OrderEditingSettings.js:114`：apiCall("/api/sales/settings/order-editing")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/ShippingMethodsSettings.js:351`：readApiResultOrThrow("/api/sales/shipping-methods?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/ShippingMethodsSettings.js:431`：apiCall("/api/sales/shipping-methods")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/ShippingMethodsSettings.js:503`：apiCall(path)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/PaymentMethodsSettings.js:167`：readApiResultOrThrow("/api/sales/payment-methods?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/PaymentMethodsSettings.js:234`：apiCall("/api/sales/payment-methods")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/PaymentMethodsSettings.js:267`：apiCall(path)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/AdjustmentKindSettings.js:141`：readApiResultOrThrow(`/api/sales/adjustment-kinds?pageSize=${PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/AdjustmentKindSettings.js:203`：apiCall("/api/sales/adjustment-kinds")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/AdjustmentKindSettings.js:241`：apiCall("/api/sales/adjustment-kinds")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/channels/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 请求调用 L42：createCrud("sales/channels")；尚未运行验证。

### `/backend/sales/channels/offers`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/offers/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L74：`/api/sales/channels?${params.toString()}`，动态部分待绑定
- API模板 L102：`/api/sales/channels?${params.toString()}`，动态部分待绑定
- API模板 L201：`/api/catalog/offers?${params.toString()}`，动态部分待绑定
- 请求调用 L73：readApiResultOrThrow(`/api/sales/channels?${params.toString()}`)；尚未运行验证。
- 请求调用 L101：readApiResultOrThrow(`/api/sales/channels?${params.toString()}`)；尚未运行验证。
- 请求调用 L200：readApiResultOrThrow(`/api/catalog/offers?${params.toString()}`)；尚未运行验证。
- 请求调用 L243：deleteCrud("catalog/offers")；尚未运行验证。

### `/backend/sales/channels`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- API模板 L97：`/api/sales/channels?${params.toString()}`，动态部分待绑定
- 请求调用 L96：readApiResultOrThrow(`/api/sales/channels?${params.toString()}`)；尚未运行验证。
- 请求调用 L128：deleteCrud("sales/channels")；尚未运行验证。

### `/backend/sales/documents/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:94`：createCrud("customers/people")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:135`：createCrud("customers/addresses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:168`：createCrud("customers/companies")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:348`：apiCall("/api/sales/document-numbers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:695`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:696`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:717`：apiCall(`${endpoint}?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:739`：apiCall(`/api/sales/channels?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:766`：apiCall("/api/catalog/price-kinds?isPromotion=false&isActive=true&pageSize=1")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:804`：apiCall(`/api/customers/addresses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:903`：apiCall("/api/customers/settings/address-format")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:1270`：createCrud("customers/addresses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:1287`：createCrud("customers/addresses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentForm.js:1307`：createCrud(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:339`：apiCall("/api/sales/tax-rates?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:358`：apiCall(`/api/sales/tax-rates?id=${encodeURIComponent(taxRateId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:380`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:402`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:436`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:497`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:517`：apiCall(`/api/catalog/product-unit-conversions?productId=${encodeURIComponent(productId)}&pageSize=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:569`：apiCall(`/api/catalog/prices?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/LineItemDialog.js:709`：apiCall(`/api/sales/order-line-statuses?${params.toString()}`)，未运行验证。
- API字面量 L50：`/api/sales/order-lines`，未证实运行调用
- API字面量 L50：`/api/sales/quote-lines`，未证实运行调用
- API模板 L78：`/api/inbox_ops/proposals/${inboxDraft.proposalId}/actions/${inboxDraft.actionId}/complete`，动态部分待绑定
- 请求调用 L69：apiCall(lineEndpoint)；尚未运行验证。
- 请求调用 L77：apiCall(`/api/inbox_ops/proposals/${inboxDraft.proposalId}/actions/${inboxDraft.actionId}/complete`)；尚未运行验证。

### `/backend/sales/orders`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/orders/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:118`：apiCall(`/api/sales/channels?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:154`：apiCall(`/api/sales/tags?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:173`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:174`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:195`：apiCall(`/api/sales/order-statuses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:427`：apiCall(`/api/sales/${resource}?${queryParams}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:493`：deleteCrud(`sales/${resource}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/quotes`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/quotes/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:118`：apiCall(`/api/sales/channels?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:154`：apiCall(`/api/sales/tags?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:173`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:174`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:195`：apiCall(`/api/sales/order-statuses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:427`：apiCall(`/api/sales/${resource}?${queryParams}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/components/documents/SalesDocumentsTable.js:493`：deleteCrud(`sales/${resource}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/channels/[channelId]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/[channelId]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L48：`/api/sales/channels?id=${encodeURIComponent(channelId)}&pageSize=1`，动态部分待绑定
- 请求调用 L47：readApiResultOrThrow(`/api/sales/channels?id=${encodeURIComponent(channelId)}&pageSize=1`)；尚未运行验证。
- 请求调用 L83：updateCrud("sales/channels")；尚未运行验证。
- 请求调用 L91：deleteCrud("sales/channels")；尚未运行验证。

### `/backend/sales/channels/[channelId]/offers/[offerId]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/[channelId]/offers/[offerId]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/channels/[channelId]/offers/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/channels/[channelId]/offers/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/sales/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/documents/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/sales/orders
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L1613：`/api/auth/feature-check`，未证实运行调用
- API字面量 L1896：`/api/customers/companies`，未证实运行调用
- API字面量 L1896：`/api/customers/people`，未证实运行调用
- API字面量 L2126：`/api/sales/settings/order-editing`，未证实运行调用
- API字面量 L2170：`/api/sales/order-adjustments`，未证实运行调用
- API字面量 L2170：`/api/sales/quote-adjustments`，未证实运行调用
- API字面量 L2497：`/api/sales/orders`，未证实运行调用
- API字面量 L2497：`/api/sales/quotes`，未证实运行调用
- API字面量 L2940：`/api/sales/document-numbers`，未证实运行调用
- API字面量 L3011：`/api/sales/quotes/convert`，未证实运行调用
- API字面量 L3040：`/api/sales/quotes/send`，未证实运行调用
- API字面量 L3065：`/api/sales/orders`，未证实运行调用
- API字面量 L3065：`/api/sales/quotes`，未证实运行调用
- API字面量 L3344：`/api/sales/notes`，未证实运行调用
- API字面量 L3367：`/api/sales/notes`，未证实运行调用
- API字面量 L3647：`/api/sales/orders`，未证实运行调用
- API字面量 L3647：`/api/sales/quotes`，未证实运行调用
- API字面量 L3711：`/api/sales/tags`，未证实运行调用
- API字面量 L3730：`/api/sales/orders`，未证实运行调用
- API字面量 L3730：`/api/sales/quotes`，未证实运行调用
- API模板 L710：`/api/sales/${kind === "order" ? "orders" : "quotes"}?${params.toString()}`，动态部分待绑定
- API模板 L1713：`/api/customers/people?${params2.toString()}`，动态部分待绑定
- API模板 L1714：`/api/customers/companies?${params2.toString()}`，动态部分待绑定
- API模板 L1746：`/api/sales/channels?${params2.toString()}`，动态部分待绑定
- API模板 L1780：`/api/sales/shipping-methods?${params2.toString()}`，动态部分待绑定
- API模板 L1833：`/api/sales/payment-methods?${params2.toString()}`，动态部分待绑定
- API模板 L1882：`/api/sales/payments?${params2.toString()}`，动态部分待绑定
- API模板 L1923：`/api/sales/channels?${params2.toString()}`，动态部分待绑定
- API模板 L1989：`/api/sales/order-statuses?${params2.toString()}`，动态部分待绑定
- API模板 L3332：`/api/sales/notes?${params2.toString()}`，动态部分待绑定
- API模板 L3379：`/api/sales/notes?id=${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L3687：`/api/sales/tags?${params2.toString()}`，动态部分待绑定
- 请求调用 L709：readApiResultOrThrow(`/api/sales/${kind === "order" ? "orders" : "quotes"}?${params.toString()}`)；尚未运行验证。
- 请求调用 L1612：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L1713：apiCall(`/api/customers/people?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1714：apiCall(`/api/customers/companies?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1745：apiCall(`/api/sales/channels?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1779：apiCall(`/api/sales/shipping-methods?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1832：apiCall(`/api/sales/payment-methods?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1881：apiCall(`/api/sales/payments?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1898：apiCall(`${endpoint}?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1922：apiCall(`/api/sales/channels?${params2.toString()}`)；尚未运行验证。
- 请求调用 L1988：apiCall(`/api/sales/order-statuses?${params2.toString()}`)；尚未运行验证。
- 请求调用 L2126：apiCall("/api/sales/settings/order-editing")；尚未运行验证。
- 请求调用 L2171：apiCall(`${resourcePath}?${params2.toString()}`)；尚未运行验证。
- 请求调用 L2940：apiCall(`/api/sales/document-numbers`)；尚未运行验证。
- 请求调用 L3331：readApiResultOrThrow(`/api/sales/notes?${params2.toString()}`)；尚未运行验证。
- 请求调用 L3686：readApiResultOrThrow(`/api/sales/tags?${params2.toString()}`)；尚未运行验证。

### `/backend/sales/orders/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/orders/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/sales/orders
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:709`：readApiResultOrThrow(`/api/sales/${kind === "order" ? "orders" : "quotes"}?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1612`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1713`：apiCall(`/api/customers/people?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1714`：apiCall(`/api/customers/companies?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1745`：apiCall(`/api/sales/channels?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1779`：apiCall(`/api/sales/shipping-methods?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1832`：apiCall(`/api/sales/payment-methods?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1881`：apiCall(`/api/sales/payments?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1898`：apiCall(`${endpoint}?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1922`：apiCall(`/api/sales/channels?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1988`：apiCall(`/api/sales/order-statuses?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2126`：apiCall("/api/sales/settings/order-editing")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2171`：apiCall(`${resourcePath}?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2940`：apiCall(`/api/sales/document-numbers`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:3331`：readApiResultOrThrow(`/api/sales/notes?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:3686`：readApiResultOrThrow(`/api/sales/tags?${params2.toString()}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/sales/quotes/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/backend/sales/quotes/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/sales/quotes
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:709`：readApiResultOrThrow(`/api/sales/${kind === "order" ? "orders" : "quotes"}?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1612`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1713`：apiCall(`/api/customers/people?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1714`：apiCall(`/api/customers/companies?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1745`：apiCall(`/api/sales/channels?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1779`：apiCall(`/api/sales/shipping-methods?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1832`：apiCall(`/api/sales/payment-methods?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1881`：apiCall(`/api/sales/payments?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1898`：apiCall(`${endpoint}?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1922`：apiCall(`/api/sales/channels?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:1988`：apiCall(`/api/sales/order-statuses?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2126`：apiCall("/api/sales/settings/order-editing")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2171`：apiCall(`${resourcePath}?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:2940`：apiCall(`/api/sales/document-numbers`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:3331`：readApiResultOrThrow(`/api/sales/notes?${params2.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/sales/backend/sales/documents/[id]/page.js:3686`：readApiResultOrThrow(`/api/sales/tags?${params2.toString()}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/warranty_claims`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：8文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/useUserDisplayNames.js:32`：readApiResultOrThrow(`/api/warranty_claims/assignees?ids=${batch.map(encodeURIComponent).join(",")}`)，未运行验证。
- API字面量 L407：`/api/warranty_claims/stats`，未证实运行调用
- API字面量 L618：`/api/warranty_claims/transition`，未证实运行调用
- API字面量 L649：`/api/warranty_claims/assign`，未证实运行调用
- API字面量 L668：`/api/warranty_claims/transition`，未证实运行调用
- API字面量 L689：`/api/warranty_claims/transition`，未证实运行调用
- API字面量 L998：`/api/warranty_claims/assign`，未证实运行调用
- API字面量 L1011：`/api/warranty_claims/transition`，未证实运行调用
- API字面量 L1078：`/api/warranty_claims/assign`，未证实运行调用
- API模板 L369：`/api/warranty_claims?${queryString}`，动态部分待绑定
- API模板 L435：`/api/warranty_claims?${params.toString()}`，动态部分待绑定
- 请求调用 L369：apiCall(`/api/warranty_claims?${queryString}`)；尚未运行验证。
- 请求调用 L406：readApiResultOrThrow("/api/warranty_claims/stats")；尚未运行验证。
- 请求调用 L434：apiCall(`/api/warranty_claims?${params.toString()}`)；尚未运行验证。
- 请求调用 L574：apiCall(endpoint)；尚未运行验证。

### `/backend/warranty_claims/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, DataTable, EmptyState
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:78`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:92`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:102`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:27`：apiCall(`/api/sales/orders?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:42`：apiCall(`/api/sales/orders?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:54`：apiCall(`/api/sales/returns?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:67`：apiCall(`/api/sales/returns?${new URLSearchParams({ ids: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/EntitlementLookupBadge.js:66`：apiCall(`/api/warranty_claims/entitlement?${debouncedQuery}`)，未运行验证。
- API字面量 L941：`/api/dictionaries`，未证实运行调用
- API字面量 L997：`/api/warranty_claims/settings-general`，未证实运行调用
- API模板 L117：`/api/warranty_claims/troubleshooting-guides?${listParams.toString()}`，动态部分待绑定
- API模板 L131：`/api/warranty_claims/troubleshooting-guides?${detailParams.toString()}`，动态部分待绑定
- API模板 L225：`/api/sales/order-lines?orderId=${encodedOrderId}&page=${page}&pageSize=${ORDER_LINE_PAGE_SIZE}`，动态部分待绑定
- API模板 L543：`/api/sales/orders?id=${encodedOrderId}&pageSize=1`，动态部分待绑定
- API模板 L951：`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`，动态部分待绑定
- API模板 L968：`/api/customers/people?${params.toString()}`，动态部分待绑定
- API模板 L969：`/api/customers/companies?${params.toString()}`，动态部分待绑定
- 请求调用 L116：apiCall(`/api/warranty_claims/troubleshooting-guides?${listParams.toString()}`)；尚未运行验证。
- 请求调用 L130：apiCall(`/api/warranty_claims/troubleshooting-guides?${detailParams.toString()}`)；尚未运行验证。
- 请求调用 L224：apiCall(`/api/sales/order-lines?orderId=${encodedOrderId}&page=${page}&pageSize=${ORDER_LINE_PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L543：apiCall(`/api/sales/orders?id=${encodedOrderId}&pageSize=1`)；尚未运行验证。
- 请求调用 L940：readApiResultOrThrow("/api/dictionaries")；尚未运行验证。
- 请求调用 L950：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)；尚未运行验证。
- 请求调用 L968：apiCall(`/api/customers/people?${params.toString()}`)；尚未运行验证。
- 请求调用 L969：apiCall(`/api/customers/companies?${params.toString()}`)；尚未运行验证。
- 请求调用 L997：apiCall("/api/warranty_claims/settings-general")；尚未运行验证。
- 请求调用 L1236：createCrud("warranty_claims")；尚未运行验证。

### `/backend/warranty_claims/registrations/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/registrations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:43`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:44`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:116`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:117`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:27`：apiCall(`/api/sales/orders?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:42`：apiCall(`/api/sales/orders?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:54`：apiCall(`/api/sales/returns?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:67`：apiCall(`/api/sales/returns?${new URLSearchParams({ ids: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:78`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:92`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:102`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- 请求调用 L37：createCrud("warranty_claims/registrations")；尚未运行验证。

### `/backend/warranty_claims/registrations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:43`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:44`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:116`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:117`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:27`：apiCall(`/api/sales/orders?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:42`：apiCall(`/api/sales/orders?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:54`：apiCall(`/api/sales/returns?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:67`：apiCall(`/api/sales/returns?${new URLSearchParams({ ids: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:78`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:92`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:102`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- API模板 L51：`/api/customers/people?ids=${idsParam}&pageSize=100`，动态部分待绑定
- API模板 L56：`/api/customers/companies?ids=${idsParam}&pageSize=100`，动态部分待绑定
- API模板 L169：`/api/warranty_claims/registrations?${listQueryString}`，动态部分待绑定
- API模板 L205：`/api/warranty_claims/registrations?${params.toString()}`，动态部分待绑定
- 请求调用 L50：readApiResultOrThrow(`/api/customers/people?ids=${idsParam}&pageSize=100`)；尚未运行验证。
- 请求调用 L55：readApiResultOrThrow(`/api/customers/companies?ids=${idsParam}&pageSize=100`)；尚未运行验证。
- 请求调用 L168：apiCall(`/api/warranty_claims/registrations?${listQueryString}`)；尚未运行验证。
- 请求调用 L204：apiCall(`/api/warranty_claims/registrations?${params.toString()}`)；尚未运行验证。
- 请求调用 L223：deleteCrud("warranty_claims/registrations")；尚未运行验证。

### `/backend/warranty_claims/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business","context":"settings"}
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- API字面量 L851：`/api/warranty_claims/settings-general`，未证实运行调用
- API字面量 L994：`/api/warranty_claims/settings-general`，未证实运行调用
- API字面量 L1043：`/api/dictionaries`，未证实运行调用
- API模板 L884：`/api/warranty_claims/assignees?ids=${encodeURIComponent(userId)}`，动态部分待绑定
- API模板 L1058：`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries`，动态部分待绑定
- API模板 L1146：`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries/${encodeURIComponent(entry.id)}`，动态部分待绑定
- API模板 L1186：`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries`，动态部分待绑定
- API模板 L1209：`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries/${encodeURIComponent(entry.id)}`，动态部分待绑定
- 请求调用 L851：apiCall("/api/warranty_claims/settings-general")；尚未运行验证。
- 请求调用 L883：apiCall(`/api/warranty_claims/assignees?ids=${encodeURIComponent(userId)}`)；尚未运行验证。
- 请求调用 L994：apiCall("/api/warranty_claims/settings-general")；尚未运行验证。
- 请求调用 L1042：readApiResultOrThrow("/api/dictionaries")；尚未运行验证。
- 请求调用 L1057：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries`)；尚未运行验证。
- 请求调用 L1146：apiCall(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries/${encodeURIComponent(entry.id)}`)；尚未运行验证。
- 请求调用 L1186：apiCall(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries`)；尚未运行验证。
- 请求调用 L1209：apiCall(`/api/dictionaries/${encodeURIComponent(dictionaryId)}/entries/${encodeURIComponent(entry.id)}`)；尚未运行验证。

### `/backend/warranty_claims/troubleshooting-guides/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/troubleshooting-guides/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/troubleshooting-guides
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- 请求调用 L38：createCrud("warranty_claims/troubleshooting-guides")；尚未运行验证。

### `/backend/warranty_claims/troubleshooting-guides`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/troubleshooting-guides/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- API模板 L115：`/api/warranty_claims/troubleshooting-guides?${listQueryString}`，动态部分待绑定
- API模板 L155：`/api/warranty_claims/troubleshooting-guides?${params.toString()}`，动态部分待绑定
- 请求调用 L114：apiCall(`/api/warranty_claims/troubleshooting-guides?${listQueryString}`)；尚未运行验证。
- 请求调用 L154：apiCall(`/api/warranty_claims/troubleshooting-guides?${params.toString()}`)；尚未运行验证。
- 请求调用 L173：deleteCrud("warranty_claims/troubleshooting-guides")；尚未运行验证。

### `/backend/warranty_claims/vendor-policies/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/vendor-policies/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/vendor-policies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- 请求调用 L36：createCrud("warranty_claims/vendor-policies")；尚未运行验证。

### `/backend/warranty_claims/vendor-policies`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/vendor-policies/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- API模板 L119：`/api/warranty_claims/vendor-policies?${listQueryString}`，动态部分待绑定
- API模板 L155：`/api/warranty_claims/vendor-policies?${params.toString()}`，动态部分待绑定
- 请求调用 L118：apiCall(`/api/warranty_claims/vendor-policies?${listQueryString}`)；尚未运行验证。
- 请求调用 L154：apiCall(`/api/warranty_claims/vendor-policies?${params.toString()}`)；尚未运行验证。
- 请求调用 L174：deleteCrud("warranty_claims/vendor-policies")；尚未运行验证。

### `/backend/warranty_claims/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage, EmptyState, Alert
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:27`：apiCall(`/api/sales/orders?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:42`：apiCall(`/api/sales/orders?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:54`：apiCall(`/api/sales/returns?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:67`：apiCall(`/api/sales/returns?${new URLSearchParams({ ids: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- API字面量 L134：`/api/dictionaries`，未证实运行调用
- API模板 L87：`/api/sales/credit-memos?${searchParams.toString()}`，动态部分待绑定
- API模板 L101：`/api/sales/credit-memos?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`，动态部分待绑定
- API模板 L144：`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`，动态部分待绑定
- API模板 L161：`/api/customers/people?${paramsForSearch.toString()}`，动态部分待绑定
- API模板 L162：`/api/customers/companies?${paramsForSearch.toString()}`，动态部分待绑定
- API模板 L178：`/api/warranty_claims?ids=${encodeURIComponent(id)}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L86：apiCall(`/api/sales/credit-memos?${searchParams.toString()}`)；尚未运行验证。
- 请求调用 L100：apiCall(`/api/sales/credit-memos?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)；尚未运行验证。
- 请求调用 L133：readApiResultOrThrow("/api/dictionaries")；尚未运行验证。
- 请求调用 L143：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)；尚未运行验证。
- 请求调用 L161：apiCall(`/api/customers/people?${paramsForSearch.toString()}`)；尚未运行验证。
- 请求调用 L162：apiCall(`/api/customers/companies?${paramsForSearch.toString()}`)；尚未运行验证。
- 请求调用 L177：readApiResultOrThrow(`/api/warranty_claims?ids=${encodeURIComponent(id)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L406：updateCrud("warranty_claims")；尚未运行验证。
- 请求调用 L413：deleteCrud("warranty_claims")；尚未运行验证。

### `/backend/warranty_claims/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, LoadingMessage, ErrorMessage, CrudForm, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/warranty_claims
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：18文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:78`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:92`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:102`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/AiAssessButtons.js:134`：readApiResultOrThrow(`/api/attachments?entityId=${encodeURIComponent(LINE_ATTACHMENT_ENTITY_ID)}&recordId=${encodeURIComponent(line.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/AiAssessButtons.js:178`：apiCall("/api/warranty_claims/ai/assess")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/useUserDisplayNames.js:32`：readApiResultOrThrow(`/api/warranty_claims/assignees?ids=${batch.map(encodeURIComponent).join(",")}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/ReceivingPanel.js:79`：apiCall("/api/warranty_claims/receiving")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/ReturnLabelPanel.js:62`：apiCall("/api/warranty_claims/return-label")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/VendorRecoverySuggestionsPanel.js:49`：readApiResultOrThrow(`/api/warranty_claims/vendor-recovery-suggestions?claimId=${encodeURIComponent(claim.id)}`)，未运行验证。
- API字面量 L520：`/api/warranty_claims/settings-general`，未证实运行调用
- API字面量 L532：`/api/auth/feature-check`，未证实运行调用
- API字面量 L605：`/api/dictionaries`，未证实运行调用
- API字面量 L658：`/api/warranty_claims/stats`，未证实运行调用
- API字面量 L840：`/api/warranty_claims/sales-return`，未证实运行调用
- API字面量 L872：`/api/warranty_claims/replacement-order`，未证实运行调用
- API字面量 L904：`/api/warranty_claims/credit-memo`，未证实运行调用
- API字面量 L942：`/api/warranty_claims/assign`，未证实运行调用
- API字面量 L1017：`/api/warranty_claims/submit`，未证实运行调用
- API字面量 L1017：`/api/warranty_claims/transition`，未证实运行调用
- API字面量 L1037：`/api/warranty_claims/vendor-recovery`，未证实运行调用
- API字面量 L1173：`/api/warranty_claims/events`，未证实运行调用
- API字面量 L1208：`/api/warranty_claims/ai/draft-reply`，未证实运行调用
- API字面量 L2086：`/api/warranty_claims/vendor-recovery`，未证实运行调用
- API模板 L615：`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`，动态部分待绑定
- API模板 L635：`/api/warranty_claims?ids=${encodeURIComponent(id)}&page=1&pageSize=1`，动态部分待绑定
- API模板 L640：`/api/warranty_claims/lines?claimId=${encodeURIComponent(id)}&page=1&pageSize=100`，动态部分待绑定
- API模板 L645：`/api/warranty_claims/events?claimId=${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L650：`/api/warranty_claims/risk?claimId=${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L663：`/api/attachments?entityId=${encodeURIComponent("warranty_claims:warranty_claim")}&recordId=${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L733：`/api/customers/people?ids=${idsParam}&pageSize=1`，动态部分待绑定
- API模板 L739：`/api/customers/companies?ids=${idsParam}&pageSize=1`，动态部分待绑定
- API模板 L977：`/api/warranty_claims/ai/suggest?claimId=${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L520：apiCall("/api/warranty_claims/settings-general")；尚未运行验证。
- 请求调用 L531：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L604：readApiResultOrThrow("/api/dictionaries")；尚未运行验证。
- 请求调用 L614：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)；尚未运行验证。
- 请求调用 L634：readApiResultOrThrow(`/api/warranty_claims?ids=${encodeURIComponent(id)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L639：readApiResultOrThrow(`/api/warranty_claims/lines?claimId=${encodeURIComponent(id)}&page=1&pageSize=100`)；尚未运行验证。
- 请求调用 L644：readApiResultOrThrow(`/api/warranty_claims/events?claimId=${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L649：readApiResultOrThrow(`/api/warranty_claims/risk?claimId=${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L657：readApiResultOrThrow("/api/warranty_claims/stats")；尚未运行验证。
- 请求调用 L662：readApiResultOrThrow(`/api/attachments?entityId=${encodeURIComponent("warranty_claims:warranty_claim")}&recordId=${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L732：apiCall(`/api/customers/people?ids=${idsParam}&pageSize=1`)；尚未运行验证。
- 请求调用 L738：apiCall(`/api/customers/companies?ids=${idsParam}&pageSize=1`)；尚未运行验证。
- 请求调用 L812：apiCall(endpoint)；尚未运行验证。
- 请求调用 L840：apiCall("/api/warranty_claims/sales-return")；尚未运行验证。
- 请求调用 L872：apiCall("/api/warranty_claims/replacement-order")；尚未运行验证。
- 请求调用 L904：apiCall("/api/warranty_claims/credit-memo")；尚未运行验证。
- 请求调用 L942：apiCall("/api/warranty_claims/assign")；尚未运行验证。
- 请求调用 L976：readApiResultOrThrow(`/api/warranty_claims/ai/suggest?claimId=${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L998：updateCrud("warranty_claims/lines")；尚未运行验证。
- 请求调用 L1078：deleteCrud("warranty_claims")；尚未运行验证。
- 请求调用 L1173：apiCall("/api/warranty_claims/events")；尚未运行验证。
- 请求调用 L1208：apiCall("/api/warranty_claims/ai/draft-reply")；尚未运行验证。
- 请求调用 L1244：updateCrud("warranty_claims/lines")；尚未运行验证。
- 请求调用 L2024：updateCrud("warranty_claims/lines")；尚未运行验证。
- 请求调用 L2029：createCrud("warranty_claims/lines")；尚未运行验证。
- 请求调用 L2038：deleteCrud("warranty_claims/lines")；尚未运行验证。

### `/backend/warranty_claims/registrations/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/registrations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:43`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:44`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:116`：apiCall(`/api/customers/people?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/registrations/registrationForm.js:117`：apiCall(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:27`：apiCall(`/api/sales/orders?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:42`：apiCall(`/api/sales/orders?${new URLSearchParams({ id: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:54`：apiCall(`/api/sales/returns?${searchParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/orderLookup.js:67`：apiCall(`/api/sales/returns?${new URLSearchParams({ ids: value, page: "1", pageSize: "1" }).toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:78`：apiCall(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:92`：apiCall(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/productLookup.js:102`：apiCall(`/api/catalog/variants?productId=${encodeURIComponent(productId)}&pageSize=50`)，未运行验证。
- API模板 L34：`/api/warranty_claims/registrations?ids=${encodeURIComponent(id)}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L33：readApiResultOrThrow(`/api/warranty_claims/registrations?ids=${encodeURIComponent(id)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L92：updateCrud("warranty_claims/registrations")；尚未运行验证。
- 请求调用 L99：deleteCrud("warranty_claims/registrations")；尚未运行验证。

### `/backend/warranty_claims/troubleshooting-guides/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/troubleshooting-guides/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/troubleshooting-guides
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- API模板 L35：`/api/warranty_claims/troubleshooting-guides?ids=${encodeURIComponent(id)}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L34：readApiResultOrThrow(`/api/warranty_claims/troubleshooting-guides?ids=${encodeURIComponent(id)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L93：updateCrud("warranty_claims/troubleshooting-guides")；尚未运行验证。
- 请求调用 L104：deleteCrud("warranty_claims/troubleshooting-guides")；尚未运行验证。

### `/backend/warranty_claims/vendor-policies/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/warranty_claims/vendor-policies/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/warranty_claims/vendor-policies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:19`：readApiResultOrThrow("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/warranty_claims/backend/components/claimReasonOptions.js:29`：readApiResultOrThrow(`/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`)，未运行验证。
- API模板 L35：`/api/warranty_claims/vendor-policies?ids=${encodeURIComponent(id)}&page=1&pageSize=1`，动态部分待绑定
- 请求调用 L34：readApiResultOrThrow(`/api/warranty_claims/vendor-policies?ids=${encodeURIComponent(id)}&page=1&pageSize=1`)；尚未运行验证。
- 请求调用 L93：updateCrud("warranty_claims/vendor-policies")；尚未运行验证。
- 请求调用 L100：deleteCrud("warranty_claims/vendor-policies")；尚未运行验证。

### `/backend/config/wms`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/config/wms/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:113`：apiCall(`/api/catalog/products?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:172`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:230`：apiCall(`/api/wms/warehouses?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:351`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:461`：apiCall("/api/wms/zones")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:498`：apiCall(`/api/wms/zones?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:624`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:681`：apiCall(`/api/wms/locations?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:809`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:935`：apiCall("/api/wms/inventory-profiles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:972`：apiCall(`/api/wms/inventory-profiles?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/LocationEditDialog.js:88`：apiCall("/api/wms/locations")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WarehouseEditDialog.js:98`：apiCall("/api/wms/warehouses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsOperationalDashboardPage.js:287`：apiCall(`/api/wms/warehouses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsOperationalDashboardPage.js:299`：apiCall(`/api/wms/locations?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsOperationalDashboardPage.js:312`：apiCall(`/api/wms/dashboard/operational?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ChangeLotStatusDialog.js:121`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/MoveInventoryDialog.js:441`：apiCall("/api/wms/inventory/move")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/inventory`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/inventory/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：19文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:180`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:560`：apiCall("/api/wms/inventory/allocate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:252`：apiCall("/api/wms/inventory/import/validate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:336`：apiCall("/api/wms/inventory/import/apply")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/MoveInventoryDialog.js:441`：apiCall("/api/wms/inventory/move")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReleaseReservationDialog.js:160`：apiCall("/api/wms/inventory/release")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReserveInventoryDialog.js:214`：apiCall("/api/wms/inventory/reserve")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/locations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/locations/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:113`：apiCall(`/api/catalog/products?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:172`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:230`：apiCall(`/api/wms/warehouses?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:351`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:461`：apiCall("/api/wms/zones")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:498`：apiCall(`/api/wms/zones?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:624`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:681`：apiCall(`/api/wms/locations?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:809`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:935`：apiCall("/api/wms/inventory-profiles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:972`：apiCall(`/api/wms/inventory-profiles?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/LocationEditDialog.js:88`：apiCall("/api/wms/locations")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WarehouseEditDialog.js:98`：apiCall("/api/wms/warehouses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/lots`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/lots/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotsListPage.js:82`：apiCall(`/api/wms/lots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ChangeLotStatusDialog.js:121`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:252`：apiCall("/api/wms/inventory/import/validate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:336`：apiCall("/api/wms/inventory/import/apply")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/MoveInventoryDialog.js:441`：apiCall("/api/wms/inventory/move")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/movements`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/movements/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：19文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:180`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:560`：apiCall("/api/wms/inventory/allocate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:252`：apiCall("/api/wms/inventory/import/validate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:336`：apiCall("/api/wms/inventory/import/apply")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/MoveInventoryDialog.js:441`：apiCall("/api/wms/inventory/move")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReleaseReservationDialog.js:160`：apiCall("/api/wms/inventory/release")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReserveInventoryDialog.js:214`：apiCall("/api/wms/inventory/reserve")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/reservations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/reservations/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：19文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:180`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsInventoryConsolePage.js:560`：apiCall("/api/wms/inventory/allocate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:252`：apiCall("/api/wms/inventory/import/validate")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ImportInventoryDialog.js:336`：apiCall("/api/wms/inventory/import/apply")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/MoveInventoryDialog.js:441`：apiCall("/api/wms/inventory/move")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReleaseReservationDialog.js:160`：apiCall("/api/wms/inventory/release")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReserveInventoryDialog.js:214`：apiCall("/api/wms/inventory/reserve")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/warehouses`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/warehouses/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:113`：apiCall(`/api/catalog/products?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:172`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:230`：apiCall(`/api/wms/warehouses?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:351`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:461`：apiCall("/api/wms/zones")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:498`：apiCall(`/api/wms/zones?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:624`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:681`：apiCall(`/api/wms/locations?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:809`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:935`：apiCall("/api/wms/inventory-profiles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:972`：apiCall(`/api/wms/inventory-profiles?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/LocationEditDialog.js:88`：apiCall("/api/wms/locations")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WarehouseEditDialog.js:98`：apiCall("/api/wms/warehouses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/zones`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/zones/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:113`：apiCall(`/api/catalog/products?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:172`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:230`：apiCall(`/api/wms/warehouses?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:351`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:461`：apiCall("/api/wms/zones")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:498`：apiCall(`/api/wms/zones?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:624`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:681`：apiCall(`/api/wms/locations?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:809`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:935`：apiCall("/api/wms/inventory-profiles")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsConfigurationPage.js:972`：apiCall(`/api/wms/inventory-profiles?id=${encodeURIComponent(row.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/LocationEditDialog.js:88`：apiCall("/api/wms/locations")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WarehouseEditDialog.js:98`：apiCall("/api/wms/warehouses")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/location/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/location/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms/locations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:315`：apiCall(`/api/wms/locations?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:329`：apiCall(`/api/wms/locations?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:345`：apiCall(`/api/wms/inventory/balances?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:367`：apiCall(`/api/wms/inventory-profiles?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:379`：apiCall(`/api/wms/lots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLocationDetailPage.js:399`：apiCall(`/api/wms/inventory/movements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/LocationEditDialog.js:88`：apiCall("/api/wms/locations")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:22`：apiCall(`/api/wms/warehouses?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/wmsLookupLoaders.js:35`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/lot/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/lot/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms/inventory
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:373`：apiCall(`/api/wms/lots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:390`：apiCall(`/api/catalog/variants?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:408`：apiCall(`/api/wms/inventory-profiles?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:421`：apiCall(`/api/wms/warehouses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:440`：apiCall(`/api/wms/inventory/balances?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsLotDetailPage.js:461`：apiCall(`/api/wms/inventory/movements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ChangeLotStatusDialog.js:121`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/wms/sku/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/wms/backend/wms/sku/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/wms/inventory
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:299`：apiCall(`/api/catalog/variants?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:317`：apiCall(`/api/wms/inventory-profiles?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:330`：apiCall(`/api/wms/warehouses?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:349`：apiCall(`/api/wms/inventory/balances?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:367`：apiCall(`/api/wms/lots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/WmsSkuDetailPage.js:386`：apiCall(`/api/wms/inventory/movements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/AdjustInventoryDialog.js:387`：apiCall("/api/wms/inventory/adjust")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/CycleCountWizardDialog.js:796`：apiCall("/api/wms/inventory/cycle-count")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/ReceiveInventoryDialog.js:293`：apiCall("/api/wms/inventory/receive")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/useWmsInventoryMutationAccess.js:18`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:15`：apiCall(`${endpoint}?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:23`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:87`：apiCall(`/api/catalog/variants?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:98`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:114`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:138`：apiCall("/api/wms/lots")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:219`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:247`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:280`：apiCall(`/api/wms/zones?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:330`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:352`：apiCall(`/api/auth/users?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:386`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:448`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:482`：apiCall(`/api/wms/lots?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:508`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:558`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:600`：apiCall(`/api/wms/inventory-profiles?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:613`：apiCall(`/api/wms/locations?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:636`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/wms/components/backend/inventoryMutationLoaders.js:667`：apiCall(`/api/wms/inventory/balances?${params}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/api-keys/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/api_keys/backend/api-keys/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/api-keys
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L30：`/api/directory/organization-switcher`，未证实运行调用
- 请求调用 L29：apiCall("/api/directory/organization-switcher")；尚未运行验证。
- 请求调用 L144：createCrud("api_keys/keys")；尚未运行验证。

### `/backend/api-keys`

- 源文件：`node_modules/@open-mercato/core/dist/modules/api_keys/backend/api-keys/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L50：`/api/api_keys/keys?${params.toString()}`，动态部分待绑定
- API模板 L91：`/api/api_keys/keys?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L49：apiCall(`/api/api_keys/keys?${params.toString()}`)；尚未运行验证。
- 请求调用 L90：apiCall(`/api/api_keys/keys?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/devices/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/devices/backend/devices/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/devices
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/devices/backend/devices/userOptions.js:14`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 请求调用 L67：createCrud("devices/admin/devices")；尚未运行验证。

### `/backend/devices`

- 源文件：`node_modules/@open-mercato/core/dist/modules/devices/backend/devices/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.notifications"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/devices/backend/devices/userOptions.js:14`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- API模板 L93：`/api/devices/admin/devices?${params.toString()}`，动态部分待绑定
- API模板 L129：`/api/devices/admin/devices/${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L93：apiCall(`/api/devices/admin/devices?${params.toString()}`)；尚未运行验证。
- 请求调用 L128：apiCall(`/api/devices/admin/devices/${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/devices/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/devices/backend/devices/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/devices
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/devices/backend/devices/userOptions.js:14`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- API模板 L29：`/api/devices/admin/devices/${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L28：apiCall(`/api/devices/admin/devices/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L106：updateCrud(`devices/admin/devices/${encodeURIComponent(id)}`)；尚未运行验证。

### `/backend/config/dictionaries`

- 源文件：`node_modules/@open-mercato/core/dist/modules/dictionaries/backend/config/dictionaries/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：8文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionariesManager.js:69`：apiCall("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionariesManager.js:194`：apiCall("/api/dictionaries")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionariesManager.js:219`：apiCall(`/api/dictionaries/${dictionaryId}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionariesManager.js:279`：apiCall(`/api/dictionaries/${dictionary.id}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionaryEntriesEditor.js:135`：apiCall(`/api/dictionaries/${dictionaryId}/entries/${entryId}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionaryEntriesEditor.js:164`：apiCall(`/api/dictionaries/${dictionaryId}/entries`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/dictionaries/components/DictionaryEntriesEditor.js:222`：apiCall(`/api/dictionaries/${dictionaryId}/entries/${entry.id}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/docs`

- 源文件：`node_modules/@open-mercato/core/dist/modules/api_docs/backend/docs/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/logs`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/logs/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.diagnostics","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L33：`/api/business_rules/logs?${params.toString()}`，动态部分待绑定
- 请求调用 L32：apiCall(`/api/business_rules/logs?${params.toString()}`)；尚未运行验证。

### `/backend/rules/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/rules/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/business_rules/components/ActionBuilder.js:34`：apiCall("/api/business_rules/openmercato-call-options")，未运行验证。
- API字面量 L38：`/api/business_rules/rules`，未证实运行调用

### `/backend/rules`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/rules/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L81：`/api/business_rules/rules`，未证实运行调用
- API模板 L43：`/api/business_rules/rules?${params.toString()}`，动态部分待绑定
- API模板 L66：`/api/business_rules/rules?id=${id}`，动态部分待绑定
- 请求调用 L42：apiCall(`/api/business_rules/rules?${params.toString()}`)；尚未运行验证。
- 请求调用 L66：apiCall(`/api/business_rules/rules?id=${id}`)；尚未运行验证。
- 请求调用 L81：apiCall("/api/business_rules/rules")；尚未运行验证。

### `/backend/sets/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/sets/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L27：`/api/business_rules/sets`，未证实运行调用

### `/backend/sets`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/sets/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L77：`/api/business_rules/sets`，未证实运行调用
- API模板 L39：`/api/business_rules/sets?${params.toString()}`，动态部分待绑定
- API模板 L62：`/api/business_rules/sets?id=${id}`，动态部分待绑定
- 请求调用 L38：apiCall(`/api/business_rules/sets?${params.toString()}`)；尚未运行验证。
- 请求调用 L62：apiCall(`/api/business_rules/sets?id=${id}`)；尚未运行验证。
- 请求调用 L77：apiCall("/api/business_rules/sets")；尚未运行验证。

### `/backend/logs/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/logs/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/logs
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L20：`/api/business_rules/logs/${logId}`，动态部分待绑定

### `/backend/rules/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/rules/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/business_rules/components/ActionBuilder.js:34`：apiCall("/api/business_rules/openmercato-call-options")，未运行验证。
- API字面量 L57：`/api/business_rules/rules`，未证实运行调用
- API模板 L35：`/api/business_rules/rules/${ruleId}`，动态部分待绑定

### `/backend/sets/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/business_rules/backend/sets/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L54：`/api/business_rules/sets`，未证实运行调用
- API模板 L40：`/api/business_rules/sets/${setId}`，动态部分待绑定
- API模板 L70：`/api/business_rules/sets/${setId}/members`，动态部分待绑定
- API模板 L92：`/api/business_rules/sets/${setId}/members`，动态部分待绑定
- API模板 L113：`/api/business_rules/sets/${setId}/members?memberId=${memberId}`，动态部分待绑定
- 请求调用 L70：apiCall(`/api/business_rules/sets/${setId}/members`)；尚未运行验证。
- 请求调用 L92：apiCall(`/api/business_rules/sets/${setId}/members`)；尚未运行验证。
- 请求调用 L113：apiCall(`/api/business_rules/sets/${setId}/members?memberId=${memberId}`)；尚未运行验证。

### `/backend/feature-toggles/global/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/feature_toggles/backend/feature-toggles/global/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/feature-toggles/global
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 请求调用 L40：createCrud("feature_toggles/global")；尚未运行验证。

### `/backend/feature-toggles/global`

- 源文件：`node_modules/@open-mercato/core/dist/modules/feature_toggles/backend/feature-toggles/global/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/feature_toggles/components/FeatureTogglesTable.js:58`：apiCall(`/api/feature_toggles/global${queryParams ? `?${queryParams}` : ""}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/feature_toggles/components/FeatureTogglesTable.js:105`：deleteCrud("feature_toggles/global")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/feature-toggles/overrides`

- 源文件：`node_modules/@open-mercato/core/dist/modules/feature_toggles/backend/feature-toggles/overrides/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.advanced"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/feature_toggles/components/OverridesTable.js:33`：apiCall(`/api/feature_toggles/overrides?${queryParams}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/feature-toggles/global/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/feature_toggles/backend/feature-toggles/global/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/feature-toggles/global
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 请求调用 L61：updateCrud("feature_toggles/global")；尚未运行验证。

### `/backend/feature-toggles/global/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/feature_toggles/backend/feature-toggles/global/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/feature-toggles/global
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/workflows`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/config/workflows/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/settings/CommandSettingsPageClient.js:50`：readApiResultOrThrow("/api/workflows/command-settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/settings/CommandSettingsPageClient.js:82`：apiCall("/api/workflows/command-settings")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/definitions/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/definitions/create/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules","context":"settings","hidden":true}
- 现有组件导入：Page, PageBody, LoadingMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/definitions
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/definitions`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/definitions/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/TemplateGalleryDialog.js:37`：apiCall("/api/workflows/templates")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/DefinitionMetricsCells.js:25`：apiCall(`/api/workflows/metrics/definitions?${params.toString()}`)，未运行验证。
- API字面量 L145：`/api/workflows/definitions`，未证实运行调用
- API模板 L68：`/api/workflows/definitions?${params.toString()}`，动态部分待绑定
- API模板 L100：`/api/workflows/definitions/${deleteTarget.id}`，动态部分待绑定
- API模板 L121：`/api/workflows/definitions/${id}`，动态部分待绑定
- 请求调用 L67：apiCall(`/api/workflows/definitions?${params.toString()}`)；尚未运行验证。
- 请求调用 L100：apiCall(`/api/workflows/definitions/${deleteTarget.id}`)；尚未运行验证。
- 请求调用 L121：apiCall(`/api/workflows/definitions/${id}`)；尚未运行验证。
- 请求调用 L145：apiCall("/api/workflows/definitions")；尚未运行验证。

### `/backend/definitions/visual-editor`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/definitions/visual-editor/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.rules","context":"settings","hidden":true}
- 现有组件导入：Page, LoadingMessage, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/definitions
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/run/useLastRunOverlay.js:25`：apiCall(`/api/workflows/instances?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/run/useLastRunOverlay.js:35`：apiCall(`/api/workflows/instances/${instanceId}/steps?limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/run/useLastRunOverlay.js:46`：apiCall(`/api/workflows/instances/${instanceId}/events?eventType=TRANSITION_EXECUTED&limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/run/useLastRunOverlay.js:57`：apiCall(`/api/workflows/instances/${instanceId}/events?limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/NodeEditDialog.js:263`：apiCall("/api/agent_orchestrator/agents")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/NodeEditDialog.js:325`：apiCall(`/api/workflows/definitions?workflowId=${encodeURIComponent(subWorkflowId)}&limit=1${versionQuery}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/WorkflowAiDraftDialog.js:42`：apiCall("/api/workflows/definitions/generate")，未运行验证。
- API字面量 L1566：`/api/workflows/definitions`，未证实运行调用
- API字面量 L2064：`/api/workflows/instances`，未证实运行调用
- API字面量 L2134：`/api/workflows/templates`，未证实运行调用
- API模板 L160：`/api/workflows/definitions?workflowId=${encodeURIComponent(workflowId)}&limit=1`，动态部分待绑定
- API模板 L383：`/api/workflows/definitions/${definitionId}`，动态部分待绑定
- API模板 L443：`/api/workflows/definitions/${definitionId}/draft`，动态部分待绑定
- API模板 L498：`/api/workflows/definitions/${definitionId}/draft`，动态部分待绑定
- API模板 L569：`/api/workflows/definitions/${definitionId}/draft`，动态部分待绑定
- API模板 L1559：`/api/workflows/definitions/${definitionId}`，动态部分待绑定
- API模板 L1605：`/api/workflows/definitions/${definitionId}/draft`，动态部分待绑定
- API模板 L1909：`/api/workflows/definitions/${definitionId}`，动态部分待绑定
- API模板 L1954：`/api/workflows/definitions/${definitionId}/publish`，动态部分待绑定
- API模板 L1969：`/api/workflows/definitions/${mintedVersion.id}`，动态部分待绑定
- API模板 L2006：`/api/workflows/definitions/${definitionId}/customize`，动态部分待绑定
- API模板 L2033：`/api/workflows/definitions/${definitionId}/reset-to-code`，动态部分待绑定
- 请求调用 L159：apiCall(`/api/workflows/definitions?workflowId=${encodeURIComponent(workflowId)}&limit=1`)；尚未运行验证。
- 请求调用 L383：apiCall(`/api/workflows/definitions/${definitionId}`)；尚未运行验证。
- 请求调用 L442：apiCall(`/api/workflows/definitions/${definitionId}/draft`)；尚未运行验证。
- 请求调用 L497：apiCall(`/api/workflows/definitions/${definitionId}/draft`)；尚未运行验证。
- 请求调用 L569：apiCall(`/api/workflows/definitions/${definitionId}/draft`)；尚未运行验证。
- 请求调用 L1559：apiCall(`/api/workflows/definitions/${definitionId}`)；尚未运行验证。
- 请求调用 L1566：apiCall("/api/workflows/definitions")；尚未运行验证。
- 请求调用 L1605：apiCall(`/api/workflows/definitions/${definitionId}/draft`)；尚未运行验证。
- 请求调用 L1909：apiCall(`/api/workflows/definitions/${definitionId}`)；尚未运行验证。
- 请求调用 L1953：apiCall(`/api/workflows/definitions/${definitionId}/publish`)；尚未运行验证。
- 请求调用 L1968：apiCall(`/api/workflows/definitions/${mintedVersion.id}`)；尚未运行验证。
- 请求调用 L2005：apiCall(`/api/workflows/definitions/${definitionId}/customize`)；尚未运行验证。
- 请求调用 L2032：apiCall(`/api/workflows/definitions/${definitionId}/reset-to-code`)；尚未运行验证。
- 请求调用 L2134：apiCall("/api/workflows/templates")；尚未运行验证。

### `/backend/events`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/events/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.diagnostics","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L34：`/api/workflows/events?${params.toString()}`，动态部分待绑定
- 请求调用 L33：apiCall(`/api/workflows/events?${params.toString()}`)；尚未运行验证。

### `/backend/instances/failure-queue`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/instances/failure-queue/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.diagnostics","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- API字面量 L56：`/api/workflows/instances/bulk-replay`，未证实运行调用
- API模板 L35：`/api/workflows/instances/failure-queue?${params.toString()}`，动态部分待绑定
- 请求调用 L34：apiCall(`/api/workflows/instances/failure-queue?${params.toString()}`)；尚未运行验证。
- 请求调用 L56：apiCall("/api/workflows/instances/bulk-replay")；尚未运行验证。

### `/backend/instances`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/instances/page.js`
- 导航覆盖：{"key":"crmNav.group.automation"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L62：`/api/workflows/instances?${params.toString()}`，动态部分待绑定
- API模板 L93：`/api/workflows/instances?${params.toString()}`，动态部分待绑定
- API模板 L135：`/api/workflows/instances/${id}/cancel`，动态部分待绑定
- API模板 L153：`/api/workflows/instances/${id}/retry`，动态部分待绑定
- 请求调用 L61：apiCall(`/api/workflows/instances?${params.toString()}`)；尚未运行验证。
- 请求调用 L93：apiCall(`/api/workflows/instances?${params.toString()}`)；尚未运行验证。
- 请求调用 L135：apiCall(`/api/workflows/instances/${id}/cancel`)；尚未运行验证。
- 请求调用 L153：apiCall(`/api/workflows/instances/${id}/retry`)；尚未运行验证。

### `/backend/tasks`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/tasks/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/work-inbox`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/work-inbox/page.js`
- 导航覆盖：{"key":"crmNav.group.home","order":30}
- 现有组件导入：Page, PageBody, DataTable, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：8文件；截断：false（静态证据）
- API字面量 L112：`/api/workflows/work-inbox/next`，未证实运行调用
- API模板 L49：`/api/workflows/work-inbox?${params.toString()}`，动态部分待绑定
- API模板 L83：`/api/workflows/tasks/${row.id}/claim`，动态部分待绑定
- API模板 L100：`/api/workflows/tasks/${row.id}/unclaim`，动态部分待绑定
- 请求调用 L49：apiCall(`/api/workflows/work-inbox?${params.toString()}`)；尚未运行验证。
- 请求调用 L83：apiCall(`/api/workflows/tasks/${row.id}/claim`)；尚未运行验证。
- 请求调用 L100：apiCall(`/api/workflows/tasks/${row.id}/unclaim`)；尚未运行验证。
- 请求调用 L111：apiCall("/api/workflows/work-inbox/next")；尚未运行验证。

### `/backend/definitions/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/definitions/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/definitions
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/events/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/events/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/events
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L21：`/api/workflows/events/${eventId}`，动态部分待绑定

### `/backend/instances/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/instances/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Alert, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/instances
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：35文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/workflows/components/run/useAgentLabels.js:11`：apiCall("/api/agent_orchestrator/agents")，未运行验证。
- API模板 L72：`/api/workflows/instances/${id}`，动态部分待绑定
- API模板 L89：`/api/workflows/events?workflowInstanceId=${instance.id}&sortField=occurredAt&sortDir=desc&pageSize=100`，动态部分待绑定
- API模板 L102：`/api/workflows/instances/${instance.id}/steps?limit=100`，动态部分待绑定
- API模板 L114：`/api/workflows/instances/${instance.id}/would-do?limit=100`，动态部分待绑定
- API模板 L130：`/api/workflows/instances/${instance.id}/step-through`，动态部分待绑定
- API模板 L163：`/api/workflows/definitions/${instance.definitionId}`，动态部分待绑定
- API模板 L177：`/api/workflows/instances?parentInstanceId=${encodeURIComponent(instance.id)}&limit=100`，动态部分待绑定
- API模板 L298：`/api/workflows/instances/${instance.id}/cancel`，动态部分待绑定
- API模板 L317：`/api/workflows/instances/${instance.id}/retry`，动态部分待绑定
- API模板 L398：`/api/workflows/instances/${id}/rerun-step`，动态部分待绑定
- 请求调用 L397：apiCall(`/api/workflows/instances/${id}/rerun-step`)；尚未运行验证。

### `/backend/tasks/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/backend/tasks/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/tasks
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：20文件；截断：false（静态证据）
- API字面量 L257：`/api/workflows/work-inbox/next`，未证实运行调用
- API模板 L72：`/api/workflows/tasks/${params.id}`，动态部分待绑定
- API模板 L142：`/api/workflows/tasks/${params.id}/complete`，动态部分待绑定
- API模板 L181：`/api/workflows/tasks/${params.id}/claim`，动态部分待绑定
- API模板 L202：`/api/workflows/tasks/${params.id}/unclaim`，动态部分待绑定
- API模板 L227：`/api/workflows/tasks/${params.id}/reassign`，动态部分待绑定
- 请求调用 L71：apiCall(`/api/workflows/tasks/${params.id}`)；尚未运行验证。
- 请求调用 L142：apiCall(`/api/workflows/tasks/${params.id}/complete`)；尚未运行验证。
- 请求调用 L181：apiCall(`/api/workflows/tasks/${params.id}/claim`)；尚未运行验证。
- 请求调用 L202：apiCall(`/api/workflows/tasks/${params.id}/unclaim`)；尚未运行验证。
- 请求调用 L227：apiCall(`/api/workflows/tasks/${params.id}/reassign`)；尚未运行验证。
- 请求调用 L257：apiCall("/api/workflows/work-inbox/next")；尚未运行验证。

### `/backend/config/search`

- 源文件：`node_modules/@open-mercato/search/dist/modules/search/backend/config/search/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:37`：readApiResultOrThrow("/api/search/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:70`：readApiResultOrThrow("/api/search/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:91`：readApiResultOrThrow("/api/search/embeddings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:117`：readApiResultOrThrow("/api/search/embeddings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:148`：fetch("/api/search/settings/global-search")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:168`：fetch("/api/search/settings/fulltext")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:184`：fetch("/api/search/settings/vector-store")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/SearchSettingsPageClient.js:211`：fetch("/api/search/settings/global-search")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/FulltextSearchSection.js:32`：fetch("/api/query_index/status")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/FulltextSearchSection.js:81`：fetch("/api/search/reindex")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/VectorSearchSection.js:108`：fetch("/api/query_index/status")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/VectorSearchSection.js:151`：readApiResultOrThrow("/api/search/embeddings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/VectorSearchSection.js:228`：readApiResultOrThrow("/api/search/embeddings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/search/dist/modules/search/frontend/components/sections/VectorSearchSection.js:262`：readApiResultOrThrow("/api/search/embeddings/reindex")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/currency-fetching`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/config/currency-fetching/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:37`：apiCall("/api/currencies/fetch-configs")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:65`：apiCall("/api/currencies/fetch-configs")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:77`：apiCall("/api/currencies/fetch-configs")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:101`：apiCall("/api/currencies/fetch-configs")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:147`：apiCall("/api/currencies/fetch-configs")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/currencies/components/CurrencyFetchingConfig.js:187`：apiCall("/api/currencies/fetch-rates")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/currencies/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/currencies/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/currencies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L119：createCrud("currencies/currencies")；尚未运行验证。

### `/backend/currencies`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/currencies/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L89：`/api/currencies/currencies`，未证实运行调用
- API字面量 L132：`/api/currencies/currencies`，未证实运行调用
- API模板 L54：`/api/currencies/currencies?${params.toString()}`，动态部分待绑定
- 请求调用 L53：apiCall(`/api/currencies/currencies?${params.toString()}`)；尚未运行验证。
- 请求调用 L89：apiCall("/api/currencies/currencies")；尚未运行验证。
- 请求调用 L132：apiCall(`/api/currencies/currencies`)；尚未运行验证。

### `/backend/exchange-rates/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/exchange-rates/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/exchange-rates
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 请求调用 L47：createCrud("currencies/exchange-rates")；尚未运行验证。

### `/backend/exchange-rates`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/exchange-rates/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/currencies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L97：`/api/currencies/exchange-rates`，未证实运行调用
- API模板 L57：`/api/currencies/exchange-rates?${params.toString()}`，动态部分待绑定
- 请求调用 L56：apiCall(`/api/currencies/exchange-rates?${params.toString()}`)；尚未运行验证。
- 请求调用 L97：apiCall(`/api/currencies/exchange-rates`)；尚未运行验证。

### `/backend/currencies/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/currencies/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/currencies
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L135：`/api/currencies/currencies`，未证实运行调用
- API模板 L36：`/api/currencies/currencies?id=${params?.id}`，动态部分待绑定
- 请求调用 L36：apiCall(`/api/currencies/currencies?id=${params?.id}`)；尚未运行验证。
- 请求调用 L135：apiCall("/api/currencies/currencies")；尚未运行验证。
- 请求调用 L258：updateCrud("currencies/currencies")；尚未运行验证。

### `/backend/exchange-rates/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/currencies/backend/exchange-rates/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/exchange-rates
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L42：`/api/currencies/exchange-rates?id=${params?.id}`，动态部分待绑定
- 请求调用 L42：apiCall(`/api/currencies/exchange-rates?id=${params?.id}`)；尚未运行验证。
- 请求调用 L114：updateCrud("currencies/exchange-rates")；尚未运行验证。

### `/backend/planner/availability-rulesets/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/planner/backend/planner/availability-rulesets/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/planner/availability-rulesets
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L16：createCrud("planner/availability-rule-sets")；尚未运行验证。

### `/backend/planner/availability-rulesets`

- 源文件：`node_modules/@open-mercato/core/dist/modules/planner/backend/planner/availability-rulesets/page.js`
- 导航覆盖：{"key":"planner.nav.group","order":70,"context":"main"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L91：`/api/planner/availability-rule-sets?${params.toString()}`，动态部分待绑定
- 请求调用 L90：readApiResultOrThrow(`/api/planner/availability-rule-sets?${params.toString()}`)；尚未运行验证。
- 请求调用 L126：deleteCrud("planner/availability-rule-sets")；尚未运行验证。

### `/backend/planner/availability-rulesets/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/planner/backend/planner/availability-rulesets/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L42：`/api/planner/availability-rule-sets?${params2.toString()}`，动态部分待绑定
- 请求调用 L41：readApiResultOrThrow(`/api/planner/availability-rule-sets?${params2.toString()}`)；尚未运行验证。
- 请求调用 L82：updateCrud("planner/availability-rule-sets")；尚未运行验证。
- 请求调用 L90：deleteCrud("planner/availability-rule-sets")；尚未运行验证。

### `/backend/resources/resource-types/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resource-types/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/resources/resource-types
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L15：createCrud("resources/resource-types")；尚未运行验证。

### `/backend/resources/resource-types`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resource-types/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L179：`/api/resources/resource-types?${params.toString()}`，动态部分待绑定
- 请求调用 L178：readApiResultOrThrow(`/api/resources/resource-types?${params.toString()}`)；尚未运行验证。
- 请求调用 L219：deleteCrud("resources/resource-types")；尚未运行验证。

### `/backend/resources/resources/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resources/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/resources/resources
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L33：createCrud("resources/resources")；尚未运行验证。

### `/backend/resources/resources`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resources/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L77：`/api/auth/feature-check`，未证实运行调用
- API模板 L100：`/api/resources/resource-types?${params.toString()}`，动态部分待绑定
- API模板 L131：`/api/resources/tags?${params.toString()}`，动态部分待绑定
- API模板 L263：`/api/resources/resources?${params.toString()}`，动态部分待绑定
- 请求调用 L77：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L100：apiCall(`/api/resources/resource-types?${params.toString()}`)；尚未运行验证。
- 请求调用 L131：apiCall(`/api/resources/tags?${params.toString()}`)；尚未运行验证。
- 请求调用 L263：apiCall(`/api/resources/resources?${params.toString()}`)；尚未运行验证。
- 请求调用 L302：deleteCrud("resources/resources")；尚未运行验证。

### `/backend/resources/resource-types/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resource-types/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/resources/resource-types
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L35：`/api/resources/resource-types?ids=${encodeURIComponent(resourceTypeId)}&page=1&pageSize=1&withResourceCounts=true`，动态部分待绑定
- 请求调用 L34：readApiResultOrThrow(`/api/resources/resource-types?ids=${encodeURIComponent(resourceTypeId)}&page=1&pageSize=1&withResourceCounts=true`)；尚未运行验证。
- 请求调用 L74：updateCrud("resources/resource-types")；尚未运行验证。
- 请求调用 L86：deleteCrud("resources/resource-types")；尚未运行验证。

### `/backend/resources/resources/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/resources/backend/resources/resources/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/resources/resources
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L301：`/api/resources/tags`，未证实运行调用
- API字面量 L324：`/api/resources/resources/tags/assign`，未证实运行调用
- API字面量 L340：`/api/resources/resources/tags/unassign`，未证实运行调用
- API模板 L275：`/api/resources/tags?${params2.toString()}`，动态部分待绑定
- API模板 L392：`/api/resources/resources?${params2.toString()}`，动态部分待绑定
- 请求调用 L257：updateCrud("resources/resources")；尚未运行验证。
- 请求调用 L274：readApiResultOrThrow(`/api/resources/tags?${params2.toString()}`)；尚未运行验证。
- 请求调用 L392：readApiResultOrThrow(`/api/resources/resources?${params2.toString()}`)；尚未运行验证。
- 请求调用 L443：deleteCrud("resources/resources")；尚未运行验证。
- 请求调用 L455：updateCrud("resources/resources")；尚未运行验证。

### `/backend/staff/leave-requests/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/leave-requests/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/leave-requests
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L19：createCrud("staff/leave-requests")；尚未运行验证。

### `/backend/staff/leave-requests`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/leave-requests/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling","order":30,"title":"团队请假"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L92：`/api/staff/leave-requests?${params.toString()}`，动态部分待绑定
- 请求调用 L91：readApiResultOrThrow(`/api/staff/leave-requests?${params.toString()}`)；尚未运行验证。

### `/backend/staff/my-availability`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/my-availability/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling","order":10}
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L26：`/api/staff/team-members/self`，未证实运行调用
- API字面量 L27：`/api/auth/feature-check`，未证实运行调用
- 请求调用 L26：apiCall("/api/staff/team-members/self")；尚未运行验证。
- 请求调用 L27：apiCall("/api/auth/feature-check")；尚未运行验证。

### `/backend/staff/my-leave-requests/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/my-leave-requests/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/my-leave-requests
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L26：`/api/staff/team-members/self`，未证实运行调用
- 请求调用 L25：readApiResultOrThrow("/api/staff/team-members/self")；尚未运行验证。
- 请求调用 L53：createCrud("staff/leave-requests")；尚未运行验证。

### `/backend/staff/my-leave-requests`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/my-leave-requests/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling","order":20,"title":"我的请假"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L87：`/api/staff/leave-requests?${params.toString()}`，动态部分待绑定
- 请求调用 L86：readApiResultOrThrow(`/api/staff/leave-requests?${params.toString()}`)；尚未运行验证。

### `/backend/staff/profile/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/profile/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L22：`/api/staff/team-members/self`，未证实运行调用
- API字面量 L47：`/api/staff/team-members/self`，未证实运行调用
- 请求调用 L22：apiCall("/api/staff/team-members/self")；尚未运行验证。

### `/backend/staff/team-members/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-members/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/team-members
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L22：createCrud("staff/team-members")；尚未运行验证。

### `/backend/staff/team-members`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-members/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L187：`/api/staff/team-members?${params.toString()}`，动态部分待绑定
- API模板 L218：`/api/staff/teams?${teamParams.toString()}`，动态部分待绑定
- API模板 L219：`/api/staff/team-roles?${roleParams.toString()}`，动态部分待绑定
- 请求调用 L186：readApiResultOrThrow(`/api/staff/team-members?${params.toString()}`)；尚未运行验证。
- 请求调用 L218：apiCall(`/api/staff/teams?${teamParams.toString()}`)；尚未运行验证。
- 请求调用 L219：apiCall(`/api/staff/team-roles?${roleParams.toString()}`)；尚未运行验证。
- 请求调用 L314：deleteCrud("staff/team-members")；尚未运行验证。

### `/backend/staff/team-roles/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-roles/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/team-roles
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L24：`/api/staff/teams?${params.toString()}`，动态部分待绑定
- 请求调用 L24：apiCall(`/api/staff/teams?${params.toString()}`)；尚未运行验证。
- 请求调用 L44：createCrud("staff/team-roles")；尚未运行验证。

### `/backend/staff/team-roles`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-roles/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L148：`/api/staff/team-roles?${params.toString()}`，动态部分待绑定
- API模板 L172：`/api/staff/teams?${params.toString()}`，动态部分待绑定
- 请求调用 L147：readApiResultOrThrow(`/api/staff/team-roles?${params.toString()}`)；尚未运行验证。
- 请求调用 L172：apiCall(`/api/staff/teams?${params.toString()}`)；尚未运行验证。
- 请求调用 L225：deleteCrud("staff/team-roles")；尚未运行验证。

### `/backend/staff/teams/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/teams/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/teams
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L15：createCrud("staff/teams")；尚未运行验证。

### `/backend/staff/teams`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/teams/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L137：`/api/staff/teams?${params.toString()}`，动态部分待绑定
- 请求调用 L136：readApiResultOrThrow(`/api/staff/teams?${params.toString()}`)；尚未运行验证。
- 请求调用 L178：deleteCrud("staff/teams")；尚未运行验证。

### `/backend/staff/time-tracking/board`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/board/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, EmptyState, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：22文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:37`：apiCall(`/api/staff/timesheets/tasks?${params(page)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:52`：apiCall(`/api/staff/timesheets/task-statuses?timeProjectId=${encodeURIComponent(timeProjectId)}&page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:67`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:85`：apiCall(`/api/staff/team-members?ids=${ids.map(encodeURIComponent).join(",")}&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:107`：apiCall(`/api/staff/timesheets/tags?ids=${ids.map(encodeURIComponent).join(",")}&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:130`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:149`：apiCall(`/api/staff/team-members?page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=displayName&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/KanbanBoard.js:224`：apiCall(`/api/staff/timesheets/time-entries?staffMemberId=${encodeURIComponent(selfStaffMemberId)}&running=true&pageSize=${BOARD_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/KanbanBoard.js:615`：apiCall(`/api/staff/timesheets/time-entries`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:87`：apiCall(`/api/staff/timesheets/time-entries?projectId=${encodeURIComponent(projectId)}&page=${page}&pageSize=${ENTRY_PAGE_SIZE}&sortField=date&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:131`：apiCall(`/api/staff/timesheets/tasks?id=${encodeURIComponent(taskId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:166`：apiCall(`/api/staff/timesheets/task-statuses?timeProjectId=${encodeURIComponent(projectId)}&page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:180`：apiCall(`/api/staff/timesheets/tasks?parentTaskId=${encodeURIComponent(taskId)}&page=1&pageSize=${CHILD_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:194`：apiCall(`/api/staff/timesheets/tasks/${encodeURIComponent(taskId)}/comments?page=1&pageSize=${COMMENT_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:212`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:222`：apiCall(`/api/staff/team-members?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&isActive=true`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:244`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:263`：apiCall(`/api/staff/timesheets/time-entries?staffMemberId=${encodeURIComponent(selfStaffMemberId)}&running=true&pageSize=${ENTRY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:469`：apiCall("/api/staff/timesheets/time-entries")，未运行验证。
- API字面量 L33：`/api/staff/timesheets/time-projects?page=1&pageSize=100&sortField=name&sortDir=asc`，未证实运行调用
- 请求调用 L32：apiCall("/api/staff/timesheets/time-projects?page=1&pageSize=100&sortField=name&sortDir=asc")；尚未运行验证。

### `/backend/staff/time-tracking/entries`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/entries/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：20文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:145`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:158`：apiCall(`/api/staff/timesheets/tasks?ids=${encodeURIComponent(id)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:223`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:233`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:246`：apiCall(`/api/staff/timesheets/tasks?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=title&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:272`：apiCall(`/api/staff/timesheets/time-projects?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=name&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:285`：apiCall(`/api/staff/timesheets/task-statuses?page=1&pageSize=${DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:309`：apiCall(`/api/staff/timesheets/time-entries?page=1&pageSize=100&sortField=date&sortDir=desc&staffMemberId=${encodeURIComponent(staffMemberId)}&from=${since}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:327`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:342`：apiCall(`/api/staff/timesheets/time-entries?ids=${encodeURIComponent(entryId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:506`：apiCall(`/api/staff/timesheets/time-entries/overlaps?${params.toString()}`)，未运行验证。
- API字面量 L247：`/api/staff/team-members/self`，未证实运行调用
- API字面量 L248：`/api/staff/timesheets/time-projects?page=1&pageSize=100`，未证实运行调用
- API字面量 L249：`/api/staff/timesheets/tags?page=1&pageSize=100`，未证实运行调用
- API字面量 L250：`/api/staff/team-members?page=1&pageSize=100`，未证实运行调用
- API模板 L63：`/api/${ENTRIES_API_PATH}`，动态部分待绑定
- API模板 L82：`/api/staff/timesheets/tasks?${params.toString()}`，动态部分待绑定
- API模板 L100：`/api/staff/timesheets/time-projects?${params.toString()}`，动态部分待绑定
- 请求调用 L82：readApiResultOrThrow(`/api/staff/timesheets/tasks?${params.toString()}`)；尚未运行验证。
- 请求调用 L99：readApiResultOrThrow(`/api/staff/timesheets/time-projects?${params.toString()}`)；尚未运行验证。
- 请求调用 L241：apiCall(url)；尚未运行验证。
- 请求调用 L400：readApiResultOrThrow(`${ENTRIES_API}?${params.toString()}`)；尚未运行验证。
- 请求调用 L470：updateCrud(ENTRIES_API_PATH)；尚未运行验证。
- 请求调用 L499：deleteCrud(ENTRIES_API_PATH)；尚未运行验证。

### `/backend/staff/time-tracking`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/page.js`
- 导航覆盖：{"key":"crmNav.group.home","order":20}
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：25文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:145`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:158`：apiCall(`/api/staff/timesheets/tasks?ids=${encodeURIComponent(id)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:223`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:233`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:246`：apiCall(`/api/staff/timesheets/tasks?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=title&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:272`：apiCall(`/api/staff/timesheets/time-projects?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=name&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:285`：apiCall(`/api/staff/timesheets/task-statuses?page=1&pageSize=${DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:309`：apiCall(`/api/staff/timesheets/time-entries?page=1&pageSize=100&sortField=date&sortDir=desc&staffMemberId=${encodeURIComponent(staffMemberId)}&from=${since}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:327`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:342`：apiCall(`/api/staff/timesheets/time-entries?ids=${encodeURIComponent(entryId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:506`：apiCall(`/api/staff/timesheets/time-entries/overlaps?${params.toString()}`)，未运行验证。
- API字面量 L46：`/api/staff/timesheets/my-work`，未证实运行调用
- API字面量 L111：`/api/staff/timesheets/tags?page=1&pageSize=100`，未证实运行调用
- API字面量 L132：`/api/staff/timesheets/tags`，未证实运行调用
- 请求调用 L111：apiCall("/api/staff/timesheets/tags?page=1&pageSize=100")；尚未运行验证。
- 请求调用 L132：createCrud("/api/staff/timesheets/tags")；尚未运行验证。
- 请求调用 L154：readApiResultOrThrow(MY_WORK_ENDPOINT)；尚未运行验证。
- 请求调用 L293：createCrud(ENTRIES_API_PATH)；尚未运行验证。
- 请求调用 L322：createCrud(`${ENTRIES_API_PATH}/copy-day`)；尚未运行验证。

### `/backend/staff/time-tracking/projects/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/projects/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/time-tracking/projects
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：13文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:44`：apiCall(`/api/customers/${resource}?${search.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:112`：createCrud(`customers/${resource}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCodeField.js:22`：apiCall(`/api/staff/timesheets/time-projects?page=${page}&pageSize=${PAGE_SIZE}&sortField=code&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:35`：apiCall(`${CURRENCY_OPTIONS_URL}?limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:98`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/change-currency`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:119`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/employees?pageSize=100&status=active`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:127`：apiCall(`/api/staff/team-members?ids=${memberIds.join(",")}&pageSize=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:177`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- API字面量 L75：`/api/staff/team-members/self`，未证实运行调用
- 请求调用 L67：createCrud("staff/timesheets/time-projects")；尚未运行验证。
- 请求调用 L75：apiCall("/api/staff/team-members/self")；尚未运行验证。
- 请求调用 L78：createCrud("staff/timesheets/time-projects/" + newId + "/employees")；尚未运行验证。

### `/backend/staff/time-tracking/projects`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/projects/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：17文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-projects-ui/AssignMembersDialog.js:57`：readApiResultOrThrow(`/api/staff/team-members?${params.toString()}`)，未运行验证。
- API字面量 L361：`/api/staff/timesheets/projects/kpis`，未证实运行调用
- API模板 L400：`/api/staff/timesheets/time-projects?${params.toString()}`，动态部分待绑定
- 请求调用 L360：readApiResultOrThrow("/api/staff/timesheets/projects/kpis")；尚未运行验证。
- 请求调用 L399：readApiResultOrThrow(`/api/staff/timesheets/time-projects?${params.toString()}`)；尚未运行验证。
- 请求调用 L524：deleteCrud("staff/timesheets/time-projects")；尚未运行验证。
- 请求调用 L558：createCrud(`staff/timesheets/time-projects/${row.id}/employees`)；尚未运行验证。

### `/backend/staff/time-tracking/reports/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/reports/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Alert, Card, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/time-tracking/reports
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:44`：apiCall(`/api/customers/${resource}?${search.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:112`：createCrud(`customers/${resource}`)，未运行验证。
- API字面量 L56：`/api/staff/timesheets/time-projects`，未证实运行调用
- API字面量 L57：`/api/staff/timesheets/reports/preview`，未证实运行调用
- API模板 L296：`/api/${REPORTS_API_PATH}`，动态部分待绑定
- 请求调用 L141：readApiResultOrThrow(`${PROJECTS_API}?${params.toString()}`)；尚未运行验证。
- 请求调用 L166：apiCall(PREVIEW_API)；尚未运行验证。
- 请求调用 L295：apiCall(`/api/${REPORTS_API_PATH}`)；尚未运行验证。

### `/backend/staff/time-tracking/reports`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/reports/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- API字面量 L23：`/api/staff/timesheets/reports`，未证实运行调用
- 请求调用 L69：readApiResultOrThrow(`${REPORTS_API}?${params.toString()}`)；尚未运行验证。

### `/backend/staff/time-tracking/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business","context":"settings"}
- 现有组件导入：Page, PageBody, Alert, Card, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- API字面量 L39：`/api/staff/timesheets/settings`，未证实运行调用
- API字面量 L40：`/api/staff/timesheets/settings/rounding-impact`，未证实运行调用
- API字面量 L41：`/api/staff/timesheets/settings/reapply-rounding`，未证实运行调用
- 请求调用 L71：apiCall(SETTINGS_API)；尚未运行验证。
- 请求调用 L99：apiCall(`${IMPACT_API}?unitMinutes=${roundingUnit}&direction=${roundingDirection}`)；尚未运行验证。
- 请求调用 L150：apiCall(SETTINGS_API)；尚未运行验证。
- 请求调用 L192：apiCall(REAPPLY_API)；尚未运行验证。

### `/backend/staff/time-tracking/timesheet`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/timesheet/page.js`
- 导航覆盖：{"key":"crmNav.group.scheduling"}
- 现有组件导入：Page, PageBody, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：40文件；截断：true（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/CreateProjectDialog.js:46`：createCrud("staff/timesheets/time-projects")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/CreateProjectDialog.js:58`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/CreateProjectDialog.js:61`：createCrud("staff/timesheets/time-projects/" + newId + "/employees")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:145`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:158`：apiCall(`/api/staff/timesheets/tasks?ids=${encodeURIComponent(id)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:223`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:233`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:246`：apiCall(`/api/staff/timesheets/tasks?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=title&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:272`：apiCall(`/api/staff/timesheets/time-projects?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=name&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:285`：apiCall(`/api/staff/timesheets/task-statuses?page=1&pageSize=${DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:309`：apiCall(`/api/staff/timesheets/time-entries?page=1&pageSize=100&sortField=date&sortDir=desc&staffMemberId=${encodeURIComponent(staffMemberId)}&from=${since}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:327`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:342`：apiCall(`/api/staff/timesheets/time-entries?ids=${encodeURIComponent(entryId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TimeEntryDialog.js:506`：apiCall(`/api/staff/timesheets/time-entries/overlaps?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/timesheet/GridView.js:292`：deleteCrud(ENTRIES_API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/timesheet/GridView.js:305`：updateCrud(ENTRIES_API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/timesheet/GridView.js:321`：createCrud(ENTRIES_API_PATH)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/useActiveTimesheetTimer.js:30`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/useActiveTimesheetTimer.js:37`：apiCall(`/api/staff/timesheets/time-projects?ids=${encodeURIComponent(projectId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/timesheets-ui/useActiveTimesheetTimer.js:54`：apiCall(`/api/staff/timesheets/time-entries?staffMemberId=${encodeURIComponent(memberId)}&running=true&pageSize=50`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:44`：apiCall(`/api/customers/${resource}?${search.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:112`：createCrud(`customers/${resource}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCodeField.js:22`：apiCall(`/api/staff/timesheets/time-projects?page=${page}&pageSize=${PAGE_SIZE}&sortField=code&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:35`：apiCall(`${CURRENCY_OPTIONS_URL}?limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:98`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/change-currency`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:119`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/employees?pageSize=100&status=active`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:127`：apiCall(`/api/staff/team-members?ids=${memberIds.join(",")}&pageSize=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:177`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- API字面量 L181：`/api/staff/team-members/self`，未证实运行调用
- API字面量 L236：`/api/staff/timesheets/settings`，未证实运行调用
- API模板 L102：`/api/${ENTRIES_API_PATH}?${params.toString()}`，动态部分待绑定
- API模板 L192：`/api/staff/timesheets/my-projects?pageSize=${PAGE_SIZE}`，动态部分待绑定
- API模板 L221：`/api/staff/timesheets/time-projects?ids=${projectIds.join(",")}&pageSize=${PAGE_SIZE}`，动态部分待绑定
- API模板 L226：`/api/staff/timesheets/tasks?pageSize=${PAGE_SIZE}`，动态部分待绑定
- API模板 L231：`/api/staff/timesheets/tasks?ids=${taskIds.join(",")}&pageSize=${PAGE_SIZE}`，动态部分待绑定
- API模板 L432：`/api/staff/timesheets/my-projects/${project.id}`，动态部分待绑定
- 请求调用 L101：readApiResultOrThrow(`/api/${ENTRIES_API_PATH}?${params.toString()}`)；尚未运行验证。
- 请求调用 L180：readApiResultOrThrow("/api/staff/team-members/self")；尚未运行验证。
- 请求调用 L191：readApiResultOrThrow(`/api/staff/timesheets/my-projects?pageSize=${PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L220：readApiResultOrThrow(`/api/staff/timesheets/time-projects?ids=${projectIds.join(",")}&pageSize=${PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L225：readApiResultOrThrow(`/api/staff/timesheets/tasks?pageSize=${PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L230：readApiResultOrThrow(`/api/staff/timesheets/tasks?ids=${taskIds.join(",")}&pageSize=${PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L235：readApiResultOrThrow("/api/staff/timesheets/settings")；尚未运行验证。
- 请求调用 L387：createCrud(ENTRIES_API_PATH)；尚未运行验证。
- 请求调用 L409：createCrud(`${ENTRIES_API_PATH}/${entry.id}/duplicate`)；尚未运行验证。

### `/backend/staff/timesheets`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/timesheets/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/staff/timesheets/projects/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/timesheets/projects/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/staff/timesheets/projects`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/timesheets/projects/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/staff/leave-requests/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/leave-requests/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/leave-requests
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L107：`/api/staff/leave-requests/accept`，未证实运行调用
- API字面量 L107：`/api/staff/leave-requests/reject`，未证实运行调用
- API模板 L44：`/api/staff/leave-requests?${params2.toString()}`，动态部分待绑定
- 请求调用 L43：readApiResultOrThrow(`/api/staff/leave-requests?${params2.toString()}`)；尚未运行验证。
- 请求调用 L99：updateCrud("staff/leave-requests")；尚未运行验证。

### `/backend/staff/my-leave-requests/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/my-leave-requests/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/my-leave-requests
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L38：`/api/staff/leave-requests?${params2.toString()}`，动态部分待绑定
- 请求调用 L37：readApiResultOrThrow(`/api/staff/leave-requests?${params2.toString()}`)；尚未运行验证。
- 请求调用 L91：updateCrud("staff/leave-requests")；尚未运行验证。

### `/backend/staff/team-members/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-members/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L164：`/api/staff/team-members?${params2.toString()}`，动态部分待绑定
- 请求调用 L163：readApiResultOrThrow(`/api/staff/team-members?${params2.toString()}`)；尚未运行验证。
- 请求调用 L226：updateCrud("staff/team-members")；尚未运行验证。
- 请求调用 L234：deleteCrud("staff/team-members")；尚未运行验证。

### `/backend/staff/team-roles/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/team-roles/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L39：`/api/staff/team-roles?${params2.toString()}`，动态部分待绑定
- API模板 L91：`/api/staff/teams?${params2.toString()}`，动态部分待绑定
- API模板 L124：`/api/staff/teams?ids=${encodeURIComponent(lookupId)}&pageSize=1`，动态部分待绑定
- 请求调用 L38：readApiResultOrThrow(`/api/staff/team-roles?${params2.toString()}`)；尚未运行验证。
- 请求调用 L91：apiCall(`/api/staff/teams?${params2.toString()}`)；尚未运行验证。
- 请求调用 L123：apiCall(`/api/staff/teams?ids=${encodeURIComponent(lookupId)}&pageSize=1`)；尚未运行验证。
- 请求调用 L148：updateCrud("staff/team-roles")；尚未运行验证。
- 请求调用 L156：deleteCrud("staff/team-roles")；尚未运行验证。

### `/backend/staff/teams/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/teams/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, ErrorMessage, DataTable
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/teams
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L140：`/api/staff/teams?${params2.toString()}`，动态部分待绑定
- API模板 L200：`/api/staff/team-members?${params2.toString()}`，动态部分待绑定
- 请求调用 L139：readApiResultOrThrow(`/api/staff/teams?${params2.toString()}`)；尚未运行验证。
- 请求调用 L199：readApiResultOrThrow(`/api/staff/team-members?${params2.toString()}`)；尚未运行验证。
- 请求调用 L233：updateCrud("staff/team-members")；尚未运行验证。
- 请求调用 L244：updateCrud("staff/teams")；尚未运行验证。
- 请求调用 L251：deleteCrud("staff/teams")；尚未运行验证。

### `/backend/staff/time-tracking/projects/[id]/board`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/projects/[id]/board/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking/projects
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：23文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:37`：apiCall(`/api/staff/timesheets/tasks?${params(page)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:52`：apiCall(`/api/staff/timesheets/task-statuses?timeProjectId=${encodeURIComponent(timeProjectId)}&page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:67`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:85`：apiCall(`/api/staff/team-members?ids=${ids.map(encodeURIComponent).join(",")}&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:107`：apiCall(`/api/staff/timesheets/tags?ids=${ids.map(encodeURIComponent).join(",")}&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:130`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/boardDirectory.js:149`：apiCall(`/api/staff/team-members?page=1&pageSize=${BOARD_DIRECTORY_PAGE_SIZE}&sortField=displayName&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/KanbanBoard.js:224`：apiCall(`/api/staff/timesheets/time-entries?staffMemberId=${encodeURIComponent(selfStaffMemberId)}&running=true&pageSize=${BOARD_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/KanbanBoard.js:615`：apiCall(`/api/staff/timesheets/time-entries`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:87`：apiCall(`/api/staff/timesheets/time-entries?projectId=${encodeURIComponent(projectId)}&page=${page}&pageSize=${ENTRY_PAGE_SIZE}&sortField=date&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:131`：apiCall(`/api/staff/timesheets/tasks?id=${encodeURIComponent(taskId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:166`：apiCall(`/api/staff/timesheets/task-statuses?timeProjectId=${encodeURIComponent(projectId)}&page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:180`：apiCall(`/api/staff/timesheets/tasks?parentTaskId=${encodeURIComponent(taskId)}&page=1&pageSize=${CHILD_PAGE_SIZE}&sortField=position&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:194`：apiCall(`/api/staff/timesheets/tasks/${encodeURIComponent(taskId)}/comments?page=1&pageSize=${COMMENT_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:212`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:222`：apiCall(`/api/staff/team-members?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&isActive=true`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:244`：apiCall(`/api/staff/timesheets/tags?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&sortField=label&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:263`：apiCall(`/api/staff/timesheets/time-entries?staffMemberId=${encodeURIComponent(selfStaffMemberId)}&running=true&pageSize=${ENTRY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/TaskDrawer.js:469`：apiCall("/api/staff/timesheets/time-entries")，未运行验证。
- API模板 L28：`/api/staff/timesheets/time-projects?ids=${encodeURIComponent(projectId)}&pageSize=1`，动态部分待绑定
- 请求调用 L27：apiCall(`/api/staff/timesheets/time-projects?ids=${encodeURIComponent(projectId)}&pageSize=1`)；尚未运行验证。

### `/backend/staff/time-tracking/projects/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/projects/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/staff/time-tracking/projects
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：14文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:119`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/employees?pageSize=100&status=active`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:127`：apiCall(`/api/staff/team-members?ids=${memberIds.join(",")}&pageSize=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectFormSections.js:177`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:44`：apiCall(`/api/customers/${resource}?${search.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/CustomerPicker.js:112`：createCrud(`customers/${resource}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCodeField.js:22`：apiCall(`/api/staff/timesheets/time-projects?page=${page}&pageSize=${PAGE_SIZE}&sortField=code&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:35`：apiCall(`${CURRENCY_OPTIONS_URL}?limit=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectCurrencyField.js:98`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/change-currency`)，未运行验证。
- API模板 L95：`/api/staff/timesheets/time-projects?ids=${projectId}&pageSize=1`，动态部分待绑定
- 请求调用 L94：apiCall(`/api/staff/timesheets/time-projects?ids=${projectId}&pageSize=1`)；尚未运行验证。
- 请求调用 L187：deleteCrud("staff/timesheets/time-projects")；尚未运行验证。
- 请求调用 L211：updateCrud("staff/timesheets/time-projects")；尚未运行验证。

### `/backend/staff/time-tracking/projects/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/projects/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking/projects
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:106`：apiCall(`/api/staff/timesheets/time-entries?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:221`：apiCall(`/api/staff/timesheets/time-projects/${projectId}/employees?page=1&pageSize=${DIRECTORY_PAGE_SIZE}&status=active`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:224`：apiCall("/api/staff/team-members/self")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:227`：apiCall("/api/staff/timesheets/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:249`：apiCall(`/api/staff/team-members?ids=${assignedIds.join(",")}&pageSize=${DIRECTORY_PAGE_SIZE}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:294`：apiCall(`/api/staff/team-members?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:412`：createCrud(employeesPath)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:422`：updateCrud(employeesPath)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/staff/lib/time-tracking-ui/ProjectTeamDrawer.js:430`：deleteCrud(employeesPath)，未运行验证。
- API字面量 L90：`/api/auth/feature-check`，未证实运行调用
- API模板 L122：`/api/staff/timesheets/time-entries?projectId=${encodeURIComponent(projectId)}&page=1&pageSize=25&sortField=date&sortDir=desc`，动态部分待绑定
- API模板 L163：`/api/staff/timesheets/tasks?timeProjectId=${encodeURIComponent(projectId)}&page=1&pageSize=50&sortField=reference&sortDir=asc`，动态部分待绑定
- API模板 L239：`/api/staff/timesheets/time-projects?${queryParams.toString()}`，动态部分待绑定
- API模板 L273：`/api/staff/timesheets/time-projects/${projectId}/employees?page=1&pageSize=100`，动态部分待绑定
- API模板 L283：`/api/staff/team-members?ids=${staffMemberIds.join(",")}&pageSize=100`，动态部分待绑定
- API模板 L390：`/api/staff/team-members?${params2.toString()}`，动态部分待绑定
- 请求调用 L90：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L121：apiCall(`/api/staff/timesheets/time-entries?projectId=${encodeURIComponent(projectId)}&page=1&pageSize=25&sortField=date&sortDir=desc`)；尚未运行验证。
- 请求调用 L159：apiCall(`/api/staff/timesheets/tasks?timeProjectId=${encodeURIComponent(projectId)}&page=1&pageSize=50&sortField=reference&sortDir=asc`)；尚未运行验证。
- 请求调用 L238：apiCall(`/api/staff/timesheets/time-projects?${queryParams.toString()}`)；尚未运行验证。
- 请求调用 L272：readApiResultOrThrow(`/api/staff/timesheets/time-projects/${projectId}/employees?page=1&pageSize=100`)；尚未运行验证。
- 请求调用 L282：apiCall(`/api/staff/team-members?ids=${staffMemberIds.join(",")}&pageSize=100`)；尚未运行验证。
- 请求调用 L360：deleteCrud(`staff/timesheets/time-projects/${projectId}/employees`)；尚未运行验证。
- 请求调用 L389：readApiResultOrThrow(`/api/staff/team-members?${params2.toString()}`)；尚未运行验证。
- 请求调用 L418：createCrud(`staff/timesheets/time-projects/${projectId}/employees`)；尚未运行验证。

### `/backend/staff/time-tracking/reports/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/time-tracking/reports/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, Alert, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/staff/time-tracking/reports
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- API字面量 L40：`/api/staff/timesheets/reports`，未证实运行调用
- 请求调用 L105：readApiResultOrThrow(`${REPORTS_API}/${reportId}/sheet`)；尚未运行验证。
- 请求调用 L180：apiCall(`${REPORTS_API}/${reportId}/export?format=${format}`)；尚未运行验证。
- 请求调用 L220：apiCall(`${REPORTS_API}/${reportId}/close`)；尚未运行验证。
- 请求调用 L242：apiCall(`${REPORTS_API}/${reportId}/unlock`)；尚未运行验证。

### `/backend/staff/timesheets/projects/[id]/edit`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/timesheets/projects/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/staff/timesheets/projects/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/backend/staff/timesheets/projects/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/notifications`

- 源文件：`node_modules/@open-mercato/core/dist/modules/notifications/backend/config/notifications/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.notifications"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:57`：readApiResultOrThrow("/api/notifications/types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:61`：readApiResultOrThrow("/api/notifications/channels")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:128`：apiCall("/api/notifications/types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:139`：apiCall(`/api/notifications/types/${encodeURIComponent(type.id)}/channels/${encodeURIComponent(channel)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:165`：readApiResultOrThrow("/api/notifications/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationSettingsPageClient.js:209`：apiCall("/api/notifications/settings")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/notifications/user-preferences`

- 源文件：`node_modules/@open-mercato/core/dist/modules/notifications/backend/notifications/user-preferences/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.notifications"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationUserPreferencesAdminPageClient.js:44`：readApiResultOrThrow("/api/notifications/types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationUserPreferencesAdminPageClient.js:48`：readApiResultOrThrow("/api/notifications/channels")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationUserPreferencesAdminPageClient.js:70`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationUserPreferencesAdminPageClient.js:87`：readApiResultOrThrow(`/api/notifications/admin/preferences?userId=${encodeURIComponent(userId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationUserPreferencesAdminPageClient.js:122`：apiCall("/api/notifications/admin/preferences")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/profile/notification-preferences`

- 源文件：`node_modules/@open-mercato/core/dist/modules/notifications/backend/profile/notification-preferences/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationPreferencesPageClient.js:37`：readApiResultOrThrow("/api/notifications/types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationPreferencesPageClient.js:41`：readApiResultOrThrow("/api/notifications/preferences")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationPreferencesPageClient.js:45`：readApiResultOrThrow("/api/notifications/channels")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/notifications/frontend/NotificationPreferencesPageClient.js:85`：apiCall("/api/notifications/preferences")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/integrations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/integrations/backend/integrations/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.channels"}
- 现有组件导入：Page, PageBody, Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L126：`/api/integrations${listQuery}`，动态部分待绑定
- API模板 L161：`/api/integrations/${encodeURIComponent(integrationId)}/state`，动态部分待绑定
- 请求调用 L126：apiCall(`/api/integrations${listQuery}`)；尚未运行验证。
- 请求调用 L161：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/state`)；尚未运行验证。

### `/backend/integrations/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/integrations/backend/integrations/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, Card, LoadingMessage, ErrorMessage, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/integrations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/data_sync/components/IntegrationScheduleTab.js:118`：apiCall("/api/data_sync/options")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/data_sync/components/IntegrationScheduleTab.js:119`：apiCall(`/api/data_sync/schedules?integrationId=${encodeURIComponent(props.integrationId)}&page=1&pageSize=100`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/data_sync/components/IntegrationScheduleTab.js:192`：apiCall("/api/data_sync/run")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/data_sync/components/IntegrationScheduleTab.js:229`：apiCall("/api/data_sync/schedules")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/data_sync/components/IntegrationScheduleTab.js:306`：apiCall(`/api/data_sync/schedules/${encodeURIComponent(scheduleState.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/integrations/backend/integrations/useIntegrationCredentialsFeatureAccess.js:12`：apiCall("/api/auth/feature-check")，未运行验证。
- API模板 L315：`/api/integrations/${encodeURIComponent(integrationId)}`，动态部分待绑定
- API模板 L339：`/api/integrations/${encodeURIComponent(integrationId)}/credentials`，动态部分待绑定
- API模板 L366：`/api/integrations/logs?${params2.toString()}`，动态部分待绑定
- API模板 L407：`/api/data_sync/runs/${encodeURIComponent(runIdFromUrl)}`，动态部分待绑定
- API模板 L517：`/api/integrations/${encodeURIComponent(integrationId)}/state`，动态部分待绑定
- API模板 L561：`/api/integrations/${encodeURIComponent(integrationId)}/credentials`，动态部分待绑定
- API模板 L591：`/api/integrations/${encodeURIComponent(integrationId)}/version`，动态部分待绑定
- API模板 L618：`/api/integrations/${encodeURIComponent(integrationId)}/health`，动态部分待绑定
- 请求调用 L314：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}`)；尚未运行验证。
- 请求调用 L338：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/credentials`)；尚未运行验证。
- 请求调用 L365：apiCall(`/api/integrations/logs?${params2.toString()}`)；尚未运行验证。
- 请求调用 L406：apiCall(`/api/data_sync/runs/${encodeURIComponent(runIdFromUrl)}`)；尚未运行验证。
- 请求调用 L517：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/state`)；尚未运行验证。
- 请求调用 L561：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/credentials`)；尚未运行验证。
- 请求调用 L591：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/version`)；尚未运行验证。
- 请求调用 L617：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/health`)；尚未运行验证。

### `/backend/integrations/bundle/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/integrations/backend/integrations/bundle/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Card, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/integrations
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- API模板 L63：`/api/integrations/${encodeURIComponent(bundleId)}`，动态部分待绑定
- API模板 L78：`/api/integrations/${encodeURIComponent(bundleId)}/credentials`，动态部分待绑定
- API模板 L127：`/api/integrations/${encodeURIComponent(bundleId)}/credentials`，动态部分待绑定
- API模板 L162：`/api/integrations/${encodeURIComponent(integrationId)}/state`，动态部分待绑定
- 请求调用 L62：apiCall(`/api/integrations/${encodeURIComponent(bundleId)}`)；尚未运行验证。
- 请求调用 L77：apiCall(`/api/integrations/${encodeURIComponent(bundleId)}/credentials`)；尚未运行验证。
- 请求调用 L127：apiCall(`/api/integrations/${encodeURIComponent(bundleId)}/credentials`)；尚未运行验证。
- 请求调用 L162：apiCall(`/api/integrations/${encodeURIComponent(integrationId)}/state`)；尚未运行验证。

### `/backend/data-sync`

- 源文件：`node_modules/@open-mercato/core/dist/modules/data_sync/backend/data-sync/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.channels"}
- 现有组件导入：Page, PageBody, DataTable, Card, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- API字面量 L179：`/api/data_sync/options`，未证实运行调用
- API字面量 L477：`/api/data_sync/run`，未证实运行调用
- API字面量 L523：`/api/data_sync/schedules`，未证实运行调用
- API模板 L151：`/api/data_sync/runs?${params.toString()}`，动态部分待绑定
- API模板 L283：`/api/data_sync/schedules?${params.toString()}`，动态部分待绑定
- API模板 L322：`/api/data_sync/runs/${encodeURIComponent(row.id)}/cancel`，动态部分待绑定
- API模板 L333：`/api/data_sync/runs/${encodeURIComponent(row.id)}/retry`，动态部分待绑定
- API模板 L354：`/api/data_sync/runs/${encodeURIComponent(fromRunId)}`，动态部分待绑定
- API模板 L407：`/api/data_sync/runs/${encodeURIComponent(row.id)}/retry`，动态部分待绑定
- API模板 L597：`/api/data_sync/schedules/${encodeURIComponent(scheduleEditor.id)}`，动态部分待绑定
- 请求调用 L150：apiCall(`/api/data_sync/runs?${params.toString()}`)；尚未运行验证。
- 请求调用 L179：apiCall("/api/data_sync/options")；尚未运行验证。
- 请求调用 L283：apiCall(`/api/data_sync/schedules?${params.toString()}`)；尚未运行验证。
- 请求调用 L322：apiCall(`/api/data_sync/runs/${encodeURIComponent(row.id)}/cancel`)；尚未运行验证。
- 请求调用 L333：apiCall(`/api/data_sync/runs/${encodeURIComponent(row.id)}/retry`)；尚未运行验证。
- 请求调用 L354：apiCall(`/api/data_sync/runs/${encodeURIComponent(fromRunId)}`)；尚未运行验证。
- 请求调用 L407：apiCall(`/api/data_sync/runs/${encodeURIComponent(row.id)}/retry`)；尚未运行验证。
- 请求调用 L477：apiCall("/api/data_sync/run")；尚未运行验证。
- 请求调用 L523：apiCall("/api/data_sync/schedules")；尚未运行验证。
- 请求调用 L597：apiCall(`/api/data_sync/schedules/${encodeURIComponent(scheduleEditor.id)}`)；尚未运行验证。

### `/backend/data-sync/runs/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/data_sync/backend/data-sync/runs/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Card, LoadingMessage, ErrorMessage, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/data-sync
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- API字面量 L68：`/api/data_sync/options`，未证实运行调用
- API模板 L90：`/api/data_sync/runs/${encodeURIComponent(runId)}`，动态部分待绑定
- API模板 L113：`/api/integrations/logs?${params2.toString()}`，动态部分待绑定
- API模板 L178：`/api/data_sync/runs/${encodeURIComponent(runId)}/cancel`，动态部分待绑定
- API模板 L199：`/api/data_sync/runs/${encodeURIComponent(runId)}/retry`，动态部分待绑定
- API模板 L240：`/api/data_sync/runs/${encodeURIComponent(runId)}/retry`，动态部分待绑定
- 请求调用 L67：apiCall("/api/data_sync/options")；尚未运行验证。
- 请求调用 L89：apiCall(`/api/data_sync/runs/${encodeURIComponent(runId)}`)；尚未运行验证。
- 请求调用 L112：apiCall(`/api/integrations/logs?${params2.toString()}`)；尚未运行验证。
- 请求调用 L178：apiCall(`/api/data_sync/runs/${encodeURIComponent(runId)}/cancel`)；尚未运行验证。
- 请求调用 L199：apiCall(`/api/data_sync/runs/${encodeURIComponent(runId)}/retry`)；尚未运行验证。
- 请求调用 L240：apiCall(`/api/data_sync/runs/${encodeURIComponent(runId)}/retry`)；尚未运行验证。

### `/backend/messages/compose`

- 源文件：`node_modules/@open-mercato/core/dist/modules/messages/backend/messages/compose/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/messages
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/ComposeMessagePageClient.js:17`：apiCall("/api/communication_channels/me/channels")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/messages`

- 源文件：`node_modules/@open-mercato/core/dist/modules/messages/backend/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/MessagesInboxPageClient.js:73`：apiCall(`/api/messages?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/MessagesInboxPageClient.js:92`：apiCall("/api/messages/types")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/MessagesInboxPageClient.js:140`：apiCall(`/api/auth/users?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/useMessagesInboxBulkActions.js:179`：apiCall(requestConfig.buildUrl(messageId))，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/messages/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/messages/backend/messages/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/messages
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/MessageDetailPageClient.js:152`：apiCall("/api/auth/feature-check")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsQueries.js:24`：apiCall(detailUrl)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsQueries.js:43`：apiCall(`/api/messages/${encodeURIComponent(id)}/attachments`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsQueries.js:59`：apiCall(`/api/messages/${encodeURIComponent(id)}?skipMarkRead=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsActions.js:49`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsActions.js:84`：apiCall(`/api/messages/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsActions.js:118`：apiCall(options.url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/message-detail/hooks/useMessageDetailsActions.js:211`：apiCall(`/api/messages/${encodeURIComponent(id)}/actions/${encodeURIComponent(action.id)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communication_channels/channels`

- 源文件：`node_modules/@open-mercato/core/dist/modules/communication_channels/backend/communication_channels/channels/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.channels","context":"settings"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L32：`/api/communication_channels/channels?page=${page}&pageSize=${pageSize}`，动态部分待绑定
- 请求调用 L31：apiCall(`/api/communication_channels/channels?page=${page}&pageSize=${pageSize}`)；尚未运行验证。

### `/backend/profile/communication-channels`

- 源文件：`node_modules/@open-mercato/core/dist/modules/communication_channels/backend/profile/communication-channels/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L89：`/api/communication_channels/me/channels`，未证实运行调用
- API模板 L137：`/api/communication_channels/channels/${encodeURIComponent(channel.id)}/visibility`，动态部分待绑定
- API模板 L188：`/api/communication_channels/channels/${encodeURIComponent(channelId)}/set-primary`，动态部分待绑定
- API模板 L225：`/api/communication_channels/channels/${encodeURIComponent(channelId)}/push/register`，动态部分待绑定
- API模板 L267：`/api/communication_channels/channels/${encodeURIComponent(channelId)}/poll-now`，动态部分待绑定
- API模板 L573：`/api/communication_channels/channels/${encodeURIComponent(channel.id)}/import-history`，动态部分待绑定
- API模板 L732：`/api/communication_channels/channels/${encodeURIComponent(channel.id)}`，动态部分待绑定
- 请求调用 L88：apiCall("/api/communication_channels/me/channels")；尚未运行验证。
- 请求调用 L136：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channel.id)}/visibility`)；尚未运行验证。
- 请求调用 L187：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channelId)}/set-primary`)；尚未运行验证。
- 请求调用 L224：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channelId)}/push/register`)；尚未运行验证。
- 请求调用 L266：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channelId)}/poll-now`)；尚未运行验证。
- 请求调用 L572：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channel.id)}/import-history`)；尚未运行验证。
- 请求调用 L731：apiCall(`/api/communication_channels/channels/${encodeURIComponent(channel.id)}`)；尚未运行验证。

### `/backend/communication_channels/channels/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/communication_channels/backend/communication_channels/channels/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/communication_channels/channels
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L29：`/api/communication_channels/channels/${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L30：`/api/communication_channels/channels/${encodeURIComponent(id)}/health`，动态部分待绑定
- 请求调用 L29：apiCall(`/api/communication_channels/channels/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L30：apiCall(`/api/communication_channels/channels/${encodeURIComponent(id)}/health`)；尚未运行验证。

### `/backend/push_notifications`

- 源文件：`node_modules/@open-mercato/core/dist/modules/push_notifications/backend/push_notifications/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.notifications"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L47：`/api/auth/users?${params.toString()}`，动态部分待绑定
- API模板 L115：`/api/push_notifications/deliveries?${params.toString()}`，动态部分待绑定
- 请求调用 L46：apiCall(`/api/auth/users?${params.toString()}`)；尚未运行验证。
- 请求调用 L115：apiCall(`/api/push_notifications/deliveries?${params.toString()}`)；尚未运行验证。

### `/backend/push_notifications/send`

- 源文件：`node_modules/@open-mercato/core/dist/modules/push_notifications/backend/push_notifications/send/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.notifications"}
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/push_notifications
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L205：`/api/push_notifications/custom-send`，未证实运行调用
- API模板 L39：`/api/devices/admin/devices?${params.toString()}`，动态部分待绑定
- API模板 L125：`/api/auth/users?${params.toString()}`，动态部分待绑定
- 请求调用 L38：apiCall(`/api/devices/admin/devices?${params.toString()}`)；尚未运行验证。
- 请求调用 L124：apiCall(`/api/auth/users?${params.toString()}`)；尚未运行验证。

### `/backend/push_notifications/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/push_notifications/backend/push_notifications/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/push_notifications
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L39：`/api/push_notifications/deliveries/${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L38：apiCall(`/api/push_notifications/deliveries/${encodeURIComponent(id)}`)；尚未运行验证。

### `/backend/phone_calls`

- 源文件：`node_modules/@open-mercato/core/dist/modules/phone_calls/backend/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L107：`/api/phone_calls/calls?${queryString}`，动态部分待绑定
- 请求调用 L107：apiCall(`/api/phone_calls/calls?${queryString}`)；尚未运行验证。

### `/backend/config/ai-assistant/agents`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:350`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agent.id)}/mutation-policy`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:394`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agent.id)}/mutation-policy`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:666`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:820`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:860`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:936`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:1303`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agent.id)}/loop-override`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:1347`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agent.id)}/loop-override`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/agents/AiAgentSettingsPageClient.js:1648`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agent.id)}/prompt-override`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/allowlist`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/allowlist/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/allowlist/AiTenantAllowlistPageClient.js:143`：apiCall("/api/ai_assistant/settings/allowlist")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/allowlist/AiTenantAllowlistPageClient.js:182`：apiCall("/api/ai_assistant/settings/allowlist")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/legacy`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/legacy/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:19`：apiCall("/api/ai_assistant/health")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:24`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:29`：apiCall("/api/ai_assistant/tools")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:55`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:81`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:211`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/McpConfigDialog.js:28`：apiCall("/api/ai_assistant/mcp-key")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/SessionKeyDialog.js:30`：apiCall("/api/ai_assistant/session-key")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/moderation-flags`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/moderation-flags/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/playground`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/playground/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/playground/AiPlaygroundPageClient.js:120`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/playground/AiPlaygroundPageClient.js:125`：apiCall(`/api/ai_assistant/ai/agents/${encodeURIComponent(agentId)}/loop-override`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/playground/AiPlaygroundPageClient.js:255`：apiCall("/api/ai_assistant/ai/run-object")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/settings`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:19`：apiCall("/api/ai_assistant/health")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:24`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:29`：apiCall("/api/ai_assistant/tools")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:55`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:81`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/AiAssistantSettingsPageClient.js:211`：apiCall("/api/ai_assistant/settings")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/McpConfigDialog.js:28`：apiCall("/api/ai_assistant/mcp-key")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/components/SessionKeyDialog.js:30`：apiCall("/api/ai_assistant/session-key")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/usage`

- 源文件：`node_modules/@open-mercato/ai-assistant/dist/modules/ai_assistant/backend/config/ai-assistant/usage/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.ai"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-assistant/models`

- 源文件：`src/modules/ai_model_config/backend/config/ai-assistant/models/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/ai_model_config/backend/config/ai-assistant/models/ModelCatalogPageClient.tsx:118`：apiCall('/api/ai_model_config/models')，未运行验证。
- 子组件请求 `src/modules/ai_model_config/backend/config/ai-assistant/models/ModelCatalogPageClient.tsx:124`：apiCall('/api/ai_model_config/providers')，未运行验证。
- 子组件请求 `src/modules/ai_model_config/backend/config/ai-assistant/models/ModelCatalogPageClient.tsx:130`：apiCall(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/system-update`

- 源文件：`src/modules/system_update/backend/config/system-update/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `src/modules/system_update/backend/config/system-update/SystemUpdatePageClient.tsx:141`：apiCall('/api/system_update/status')，未运行验证。
- 子组件请求 `src/modules/system_update/backend/config/system-update/SystemUpdatePageClient.tsx:193`：apiCall('/api/system_update/run')，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-write-approvals`

- 源文件：`src/modules/dsh_approvals/backend/config/ai-write-approvals/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/dsh_approvals/backend/config/ai-write-approvals/AiWriteApprovalsPageClient.tsx:109`：apiCall('/api/internal/dsh-write-approvals')，未运行验证。
- 子组件请求 `src/modules/dsh_approvals/backend/config/ai-write-approvals/AiWriteApprovalsPageClient.tsx:146`：apiCall(`/api/internal/dsh-write-approvals/${encodeURIComponent(approval.id)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/modules`

- 源文件：`src/modules/module_directory/backend/config/modules/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/home`

- 源文件：`src/modules/settings_home/backend/config/home/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype/accounts/detail`

- 源文件：`src/modules/crm_prototype/backend/prototype/accounts/detail/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype/accounts`

- 源文件：`src/modules/crm_prototype/backend/prototype/accounts/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype/candidates`

- 源文件：`src/modules/crm_prototype/backend/prototype/candidates/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype/drafts`

- 源文件：`src/modules/crm_prototype/backend/prototype/drafts/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype`

- 源文件：`src/modules/crm_prototype/backend/prototype/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/prototype/tasks`

- 源文件：`src/modules/crm_prototype/backend/prototype/tasks/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/channels/connect`

- 源文件：`src/modules/communications/backend/communications/channels/connect/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/channels/connect/ConnectChannelForm.tsx:61`：apiCall('/api/communication_channels/channels/connect/tenant-credentials')，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/channels`

- 源文件：`src/modules/communications/backend/communications/channels/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/channels/ChannelsView.tsx:53`：fetch('/api/communications/me/channels')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/channels/ChannelsView.tsx:84`：fetch(plan.url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/exceptions`

- 源文件：`src/modules/communications/backend/communications/exceptions/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/exceptions/ExceptionsView.tsx:57`：fetch('/api/communications/me/reconciliation')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/exceptions/ExceptionsView.tsx:80`：fetch('/api/communications/me/dead-letters')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/exceptions/ExceptionsView.tsx:106`：fetch('/api/communications/me/reconciliation')，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/inbox`

- 源文件：`src/modules/communications/backend/communications/inbox/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：17文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:92`：selfFetch('/api/communications/me/threads')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:98`：selfFetch(`/api/communications/me/threads/${selectedId}/messages${detailQuery}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/ReplyComposer.tsx:98`：fetch('/api/communications/me/send')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:37`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:65`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:35`：fetch(`/api/communications/me/threads/${props.threadId}/customer${suffix}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:72`：fetch(`/api/communications/me/threads/${props.threadId}/customer`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxLiveRefresh.tsx:42`：fetch(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/inbox/[thread]/before/[cursor]`

- 源文件：`src/modules/communications/backend/communications/inbox/[thread]/before/[cursor]/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：15文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:92`：selfFetch('/api/communications/me/threads')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:98`：selfFetch(`/api/communications/me/threads/${selectedId}/messages${detailQuery}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/ReplyComposer.tsx:98`：fetch('/api/communications/me/send')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:37`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:65`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:35`：fetch(`/api/communications/me/threads/${props.threadId}/customer${suffix}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:72`：fetch(`/api/communications/me/threads/${props.threadId}/customer`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxLiveRefresh.tsx:42`：fetch(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/communications/inbox/[thread]`

- 源文件：`src/modules/communications/backend/communications/inbox/[thread]/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：17文件；截断：false（静态证据）
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:92`：selfFetch('/api/communications/me/threads')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxView.tsx:98`：selfFetch(`/api/communications/me/threads/${selectedId}/messages${detailQuery}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/ReplyComposer.tsx:98`：fetch('/api/communications/me/send')，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:37`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InternalNotes.tsx:65`：fetch(`/api/communications/me/threads/${props.threadId}/notes`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:35`：fetch(`/api/communications/me/threads/${props.threadId}/customer${suffix}`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/CustomerLink.tsx:72`：fetch(`/api/communications/me/threads/${props.threadId}/customer`)，未运行验证。
- 子组件请求 `src/modules/communications/backend/communications/inbox/InboxLiveRefresh.tsx:42`：fetch(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/workbench`

- 源文件：`src/modules/workbench/backend/workbench/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/business`

- 源文件：`src/modules/crm_navigation/backend/business/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/manage`

- 源文件：`src/modules/crm_navigation/backend/manage/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/business/[category]`

- 源文件：`src/modules/crm_navigation/backend/business/[category]/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/business
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/navigation`

- 源文件：`src/modules/workspace_settings/backend/config/navigation/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：7文件；截断：false（静态证据）
- 子组件请求 `src/modules/workspace_settings/backend/config/navigation/WorkspaceLayoutEditor.tsx:50`：apiCall('/api/workspace_settings/layout')，未运行验证。
- 子组件请求 `src/modules/workspace_settings/backend/config/navigation/WorkspaceLayoutEditor.tsx:51`：apiCall('/api/crm_navigation/navigation?chrome=1&path=%2Fbackend%2Fmanage')，未运行验证。
- 子组件请求 `src/modules/workspace_settings/backend/config/navigation/WorkspaceLayoutEditor.tsx:52`：apiCall('/api/auth/users?pageSize=100')，未运行验证。
- 子组件请求 `src/modules/workspace_settings/backend/config/navigation/WorkspaceLayoutEditor.tsx:138`：apiCall('/api/workspace_settings/layout')，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/leadgen/candidates`

- 源文件：`src/modules/leadgen/backend/leadgen/candidates/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/leadgen/backend/leadgen/candidates/LeadgenCandidatesPageClient.tsx:52`：fetch(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/leadgen/suppressions`

- 源文件：`src/modules/leadgen/backend/leadgen/suppressions/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/leadgen/backend/leadgen/suppressions/SuppressionsPageClient.tsx:44`：fetch(url)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/ai-agents`

- 源文件：`src/modules/agent_directory/backend/config/ai-agents/page.tsx`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `src/modules/agent_directory/backend/config/ai-agents/AgentDirectoryClient.tsx:48`：apiCall('/api/ai_assistant/ai/agents')，未运行验证。
- 子组件请求 `src/modules/agent_directory/backend/config/ai-agents/AgentDirectoryClient.tsx:54`：apiCall('/api/ai_assistant/settings')，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/translations`

- 源文件：`node_modules/@open-mercato/core/dist/modules/translations/backend/config/translations/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.system"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:33`：apiCall("/api/translations/locales")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:79`：readApiResultOrThrow("/api/entities/entities")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:103`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:117`：apiCall(`${listUrl}?id=${encodeURIComponent(recordId)}&ids=${encodeURIComponent(recordId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:150`：apiCall(`/api/translations/${encodeURIComponent(entityType)}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:216`：apiCall(`/api/translations/${encodeURIComponent(entityType)}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/translations/components/TranslationManager.js:444`：apiCall("/api/translations/locales")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/config/scheduled-jobs/new`

- 源文件：`node_modules/@open-mercato/scheduler/dist/modules/scheduler/backend/config/scheduled-jobs/new/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/config/scheduled-jobs
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 请求调用 L59：createCrud("scheduler/jobs")；尚未运行验证。

### `/backend/config/scheduled-jobs`

- 源文件：`node_modules/@open-mercato/scheduler/dist/modules/scheduler/backend/config/scheduled-jobs/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.channels"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L90：`/api/scheduler/jobs`，未证实运行调用
- API字面量 L105：`/api/scheduler/trigger`，未证实运行调用
- API模板 L60：`/api/scheduler/jobs?${params.toString()}`，动态部分待绑定

### `/backend/config/scheduled-jobs/[id]/edit`

- 源文件：`node_modules/@open-mercato/scheduler/dist/modules/scheduler/backend/config/scheduled-jobs/[id]/edit/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, LoadingMessage, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/config/scheduled-jobs
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L36：`/api/scheduler/jobs?id=${params.id}`，动态部分待绑定
- 请求调用 L90：updateCrud("scheduler/jobs")；尚未运行验证。

### `/backend/config/scheduled-jobs/[id]`

- 源文件：`node_modules/@open-mercato/scheduler/dist/modules/scheduler/backend/config/scheduled-jobs/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Card, DataTable, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/config/scheduled-jobs
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- API字面量 L89：`/api/scheduler/trigger`，未证实运行调用
- API字面量 L106：`/api/scheduler/jobs`，未证实运行调用
- API模板 L41：`/api/scheduler/jobs?id=${scheduleId}&page=1&pageSize=1`，动态部分待绑定
- API模板 L53：`/api/scheduler/jobs/${scheduleId}/executions?pageSize=10`，动态部分待绑定

### `/backend/inbox-ops/log`

- 源文件：`node_modules/@open-mercato/core/dist/modules/inbox_ops/backend/inbox-ops/log/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.diagnostics","context":"settings","hidden":false}
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/inbox-ops
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L43：`/api/inbox_ops/emails?${params}`，动态部分待绑定
- API模板 L63：`/api/inbox_ops/emails/${emailId}/reprocess`，动态部分待绑定
- 请求调用 L43：apiCall(`/api/inbox_ops/emails?${params}`)；尚未运行验证。
- 请求调用 L62：apiCall(`/api/inbox_ops/emails/${emailId}/reprocess`)；尚未运行验证。

### `/backend/inbox-ops`

- 源文件：`node_modules/@open-mercato/core/dist/modules/inbox_ops/backend/inbox-ops/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- API字面量 L94：`/api/inbox_ops/proposals/counts`，未证实运行调用
- API字面量 L98：`/api/inbox_ops/settings`，未证实运行调用
- API模板 L80：`/api/inbox_ops/proposals?${params}`，动态部分待绑定
- API模板 L142：`/api/inbox_ops/proposals/${proposalId}/reject`，动态部分待绑定
- 请求调用 L80：apiCall(`/api/inbox_ops/proposals?${params}`)；尚未运行验证。
- 请求调用 L94：apiCall("/api/inbox_ops/proposals/counts")；尚未运行验证。
- 请求调用 L98：apiCall("/api/inbox_ops/settings")；尚未运行验证。
- 请求调用 L141：apiCall(`/api/inbox_ops/proposals/${proposalId}/reject`)；尚未运行验证。

### `/backend/inbox-ops/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/inbox_ops/backend/inbox-ops/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.business","context":"settings","hidden":false}
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/inbox-ops
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L43：`/api/inbox_ops/settings`，未证实运行调用
- API字面量 L74：`/api/inbox_ops/settings`，未证实运行调用
- 请求调用 L43：apiCall("/api/inbox_ops/settings")；尚未运行验证。
- 请求调用 L74：apiCall("/api/inbox_ops/settings")；尚未运行验证。

### `/backend/inbox-ops/proposals/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/inbox_ops/backend/inbox-ops/proposals/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/inbox-ops
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- API模板 L180：`/api/inbox_ops/proposals/${proposalId}/translate`，动态部分待绑定
- API模板 L198：`/api/inbox_ops/proposals/${proposalId}/categorize`，动态部分待绑定
- API模板 L215：`/api/inbox_ops/proposals/${proposalId}`，动态部分待绑定
- API模板 L238：`/api/inbox_ops/proposals/${proposalId}/actions/${actionId}/accept`，动态部分待绑定
- API模板 L255：`/api/inbox_ops/proposals/${proposalId}/actions/${actionId}/reject`，动态部分待绑定
- API模板 L281：`/api/inbox_ops/proposals/${proposalId}/accept-all`，动态部分待绑定
- API模板 L304：`/api/inbox_ops/proposals/${proposalId}/reject`，动态部分待绑定
- API模板 L320：`/api/inbox_ops/emails/${email.id}/reprocess`，动态部分待绑定
- API模板 L335：`/api/inbox_ops/proposals/${proposalId}/replies/${actionId}/send`，动态部分待绑定
- 请求调用 L179：apiCall(`/api/inbox_ops/proposals/${proposalId}/translate`)；尚未运行验证。
- 请求调用 L197：apiCall(`/api/inbox_ops/proposals/${proposalId}/categorize`)；尚未运行验证。
- 请求调用 L215：apiCall(`/api/inbox_ops/proposals/${proposalId}`)；尚未运行验证。
- 请求调用 L237：apiCall(`/api/inbox_ops/proposals/${proposalId}/actions/${actionId}/accept`)；尚未运行验证。
- 请求调用 L254：apiCall(`/api/inbox_ops/proposals/${proposalId}/actions/${actionId}/reject`)；尚未运行验证。
- 请求调用 L280：apiCall(`/api/inbox_ops/proposals/${proposalId}/accept-all`)；尚未运行验证。
- 请求调用 L303：apiCall(`/api/inbox_ops/proposals/${proposalId}/reject`)；尚未运行验证。
- 请求调用 L319：apiCall(`/api/inbox_ops/emails/${email.id}/reprocess`)；尚未运行验证。
- 请求调用 L334：apiCall(`/api/inbox_ops/proposals/${proposalId}/replies/${actionId}/send`)；尚未运行验证。

### `/backend/payment-gateways`

- 源文件：`node_modules/@open-mercato/core/dist/modules/payment_gateways/backend/payment-gateways/page.js`
- 导航覆盖：{"key":"crmNav.group.payments","context":"main"}
- 现有组件导入：Page, PageBody, DataTable, LoadingMessage, ErrorMessage, Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L194：`/api/payment_gateways/status`，未证实运行调用
- API字面量 L224：`/api/payment_gateways/capture`，未证实运行调用
- API模板 L131：`/api/payment_gateways/transactions?${params.toString()}`，动态部分待绑定
- API模板 L148：`/api/payment_gateways/transactions/${encodeURIComponent(transactionId)}`，动态部分待绑定
- 请求调用 L131：apiCall(`/api/payment_gateways/transactions?${params.toString()}`)；尚未运行验证。
- 请求调用 L148：apiCall(`/api/payment_gateways/transactions/${encodeURIComponent(transactionId)}`)；尚未运行验证。

### `/backend/checkout/pay-links/create`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/pay-links/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1188`：readApiResultOrThrow("/api/payment_gateways/providers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1220`：readApiResultOrThrow(`/api/checkout/templates?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1233`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(nextTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1260`：readApiResultOrThrow(`/api/checkout/${mode === "link" ? "links" : "templates"}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1284`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(currentTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1484`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1501`：apiCall("/api/attachments/transfer")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/CheckoutCurrencySelect.js:27`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/GatewaySettingsFields.js:49`：readApiResultOrThrow(`/api/payment_gateways/providers/${encodeURIComponent(providerKey)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:26`：apiCall(`/api/attachments?id=${encodeURIComponent(targetId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:40`：apiCall("/api/attachments")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/checkout/pay-links`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/pay-links/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/checkout
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L67：`/api/checkout/links?${params.toString()}`，动态部分待绑定
- API模板 L214：`/api/checkout/links/${encodeURIComponent(row.id)}`，动态部分待绑定
- API模板 L232：`/api/checkout/links/${encodeURIComponent(row.id)}`，动态部分待绑定
- API模板 L250：`/api/checkout/links/${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L67：readApiResultOrThrow(`/api/checkout/links?${params.toString()}`)；尚未运行验证。

### `/backend/checkout/templates/create`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/templates/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1188`：readApiResultOrThrow("/api/payment_gateways/providers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1220`：readApiResultOrThrow(`/api/checkout/templates?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1233`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(nextTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1260`：readApiResultOrThrow(`/api/checkout/${mode === "link" ? "links" : "templates"}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1284`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(currentTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1484`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1501`：apiCall("/api/attachments/transfer")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/CheckoutCurrencySelect.js:27`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/GatewaySettingsFields.js:49`：readApiResultOrThrow(`/api/payment_gateways/providers/${encodeURIComponent(providerKey)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:26`：apiCall(`/api/attachments?id=${encodeURIComponent(targetId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:40`：apiCall("/api/attachments")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/checkout/templates`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/templates/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/checkout
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L49：`/api/checkout/templates?${params.toString()}`，动态部分待绑定
- API模板 L138：`/api/checkout/templates/${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L49：readApiResultOrThrow(`/api/checkout/templates?${params.toString()}`)；尚未运行验证。

### `/backend/checkout/transactions`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/transactions/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/checkout
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L60：`/api/checkout/links?${params.toString()}`，动态部分待绑定
- API模板 L78：`/api/checkout/links/${encodeURIComponent(initialLinkId)}`，动态部分待绑定
- API模板 L120：`/api/checkout/transactions?${params.toString()}`，动态部分待绑定
- 请求调用 L60：apiCall(`/api/checkout/links?${params.toString()}`)；尚未运行验证。
- 请求调用 L78：readApiResultOrThrow(`/api/checkout/links/${encodeURIComponent(initialLinkId)}`)；尚未运行验证。
- 请求调用 L120：readApiResultOrThrow(`/api/checkout/transactions?${params.toString()}`)；尚未运行验证。

### `/backend/checkout`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/checkout/pay-links/[id]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/pay-links/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1188`：readApiResultOrThrow("/api/payment_gateways/providers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1220`：readApiResultOrThrow(`/api/checkout/templates?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1233`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(nextTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1260`：readApiResultOrThrow(`/api/checkout/${mode === "link" ? "links" : "templates"}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1284`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(currentTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1484`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1501`：apiCall("/api/attachments/transfer")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/CheckoutCurrencySelect.js:27`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/GatewaySettingsFields.js:49`：readApiResultOrThrow(`/api/payment_gateways/providers/${encodeURIComponent(providerKey)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:26`：apiCall(`/api/attachments?id=${encodeURIComponent(targetId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:40`：apiCall("/api/attachments")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/checkout/templates/[id]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/templates/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1188`：readApiResultOrThrow("/api/payment_gateways/providers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1220`：readApiResultOrThrow(`/api/checkout/templates?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1233`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(nextTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1260`：readApiResultOrThrow(`/api/checkout/${mode === "link" ? "links" : "templates"}/${encodeURIComponent(recordId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1284`：readApiResultOrThrow(`/api/checkout/templates/${encodeURIComponent(currentTemplateId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1484`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LinkTemplateForm.js:1501`：apiCall("/api/attachments/transfer")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/CheckoutCurrencySelect.js:27`：readApiResultOrThrow("/api/customers/dictionaries/currency")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/GatewaySettingsFields.js:49`：readApiResultOrThrow(`/api/payment_gateways/providers/${encodeURIComponent(providerKey)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:26`：apiCall(`/api/attachments?id=${encodeURIComponent(targetId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/LogoUploadField.js:40`：apiCall("/api/attachments")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/checkout/templates/[id]/preview`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/templates/[id]/preview/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:276`：fetch("/api/auth/locale")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:1089`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:1458`：readApiResultOrThrow(`/api/checkout/pay/${encodeURIComponent(slug)}/submit`)，未运行验证。
- 请求调用 L13：fetch(`${protocol}://${host}/api/checkout/templates/${encodeURIComponent(id)}/preview`)；尚未运行验证。

### `/backend/checkout/transactions/[id]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/backend/checkout/transactions/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L117：`/api/payment_gateways/capture`，未证实运行调用
- API模板 L92：`/api/checkout/transactions/${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L100：`/api/checkout/transactions/${encodeURIComponent(resolvedParams.id)}`，动态部分待绑定
- 请求调用 L92：readApiResultOrThrow(`/api/checkout/transactions/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L100：readApiResultOrThrow(`/api/checkout/transactions/${encodeURIComponent(resolvedParams.id)}`)；尚未运行验证。

### `/backend/documents`

- 源文件：`node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：14文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/useDocumentsList.js:57`：apiCall("/api/documents/folders")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/useDocumentsList.js:58`：apiCall(`/api/documents?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/useDocumentsList.js:96`：apiCall("/api/documents/templates?page=1&pageSize=1&isActive=true")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/components/useShareDialog.js:58`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/shares`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/documents/templates`

- 源文件：`node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/templates/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：8文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/templates/useTemplatesPage.js:60`：apiCall(`/api/documents/templates?${params.toString()}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/documents/[id]`

- 源文件：`node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/documents
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：23文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/DocumentPageClient.js:78`：apiCall(`/api/documents/${encodeURIComponent(documentId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/DocumentPageClient.js:79`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/content`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/DocumentPageClient.js:107`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/content`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/RelatedRecordsPanel.js:47`：apiCall(`/api/documents?entityType=document&entityId=${encodeURIComponent(documentId)}&pageSize=10`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/RelatedRecordsPanel.js:114`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/links`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/VersionHistoryPanel.js:80`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/versions`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/components/useShareDialog.js:58`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/shares`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/useDocumentComments.js:54`：apiCall(pathForPage(1))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/useDocumentComments.js:65`：apiCall(pathForPage(index + 2))，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/useDocumentComments.js:131`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/comments/access-check`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/documents/dist/modules/documents/backend/documents/[id]/RecordFieldsDialog.js:49`：apiCall(`/api/documents/${encodeURIComponent(documentId)}/links`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/shipping-carriers/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/shipping_carriers/backend/shipping-carriers/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/shipping_carriers/lib/shipment-wizard/hooks/shipmentApi.js:4`：apiCall("/api/shipping-carriers/providers")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/shipping_carriers/lib/shipment-wizard/hooks/shipmentApi.js:15`：apiCall(`/api/sales/document-addresses?documentId=${orderId}&documentKind=order&pageSize=50`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/shipping_carriers/lib/shipment-wizard/hooks/shipmentApi.js:27`：apiCall("/api/shipping-carriers/rates")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/shipping_carriers/lib/shipment-wizard/hooks/shipmentApi.js:52`：apiCall("/api/shipping-carriers/shipments")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/shipping_carriers/lib/shipment-wizard/hooks/shipmentApi.js:73`：apiCall(`${url.pathname}${url.search}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/eudr/evidence-submissions/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/evidence-submissions/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/eudr/evidence-submissions
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 请求调用 L316：createCrud("eudr/evidence-submissions")；尚未运行验证。

### `/backend/eudr/evidence-submissions`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/evidence-submissions/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L93：`/api/eudr/evidence-submissions?${queryParams}`，动态部分待绑定
- API模板 L133：`/api/eudr/evidence-submissions?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L92：apiCall(`/api/eudr/evidence-submissions?${queryParams}`)；尚未运行验证。
- 请求调用 L132：apiCall(`/api/eudr/evidence-submissions?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/eudr`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, EmptyState, ErrorMessage, LoadingMessage, Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L206：`/api/eudr/dashboard/widgets/compliance-overview`，未证实运行调用
- API模板 L81：`/api/eudr/reports/annual?year=${year}`，动态部分待绑定
- API模板 L107：`/api/eudr/reports/annual?year=${year}&format=${format}`，动态部分待绑定
- 请求调用 L81：apiCall(`/api/eudr/reports/annual?year=${year}`)；尚未运行验证。
- 请求调用 L106：apiCall(`/api/eudr/reports/annual?year=${year}&format=${format}`)；尚未运行验证。
- 请求调用 L206：apiCall("/api/eudr/dashboard/widgets/compliance-overview")；尚未运行验证。

### `/backend/eudr/plots/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/plots/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/eudr/plots
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：13文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 请求调用 L235：createCrud("eudr/plots")；尚未运行验证。

### `/backend/eudr/plots`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/plots/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API字面量 L186：`/api/customers/companies?pageSize=100&sortField=name&sortDir=asc`，未证实运行调用
- API模板 L113：`/api/eudr/plots?${queryParams}`，动态部分待绑定
- API模板 L153：`/api/eudr/plots?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L112：apiCall(`/api/eudr/plots?${queryParams}`)；尚未运行验证。
- 请求调用 L152：apiCall(`/api/eudr/plots?id=${encodeURIComponent(row.id)}`)；尚未运行验证。
- 请求调用 L185：apiCall("/api/customers/companies?pageSize=100&sortField=name&sortDir=asc")；尚未运行验证。

### `/backend/eudr/product-mappings/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/product-mappings/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/eudr/product-mappings
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 请求调用 L150：createCrud("eudr/product-mappings")；尚未运行验证。

### `/backend/eudr/product-mappings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/product-mappings/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/MappingSuggestionsDialog.js:88`：apiCall("/api/eudr/product-mappings/suggestions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L82：`/api/eudr/product-mappings?${queryParams}`，动态部分待绑定
- API模板 L122：`/api/eudr/product-mappings?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L81：apiCall(`/api/eudr/product-mappings?${queryParams}`)；尚未运行验证。
- 请求调用 L121：apiCall(`/api/eudr/product-mappings?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/eudr/risk-assessments/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/risk-assessments/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/eudr/risk-assessments
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 请求调用 L199：createCrud("eudr/risk-assessments")；尚未运行验证。

### `/backend/eudr/risk-assessments`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/risk-assessments/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementRiskSection.js:63`：apiCall(`/api/eudr/risk-assessments?statementId=${encodeURIComponent(statementId)}&pageSize=5&sortField=assessedAt&sortDir=desc`)，未运行验证。
- API模板 L111：`/api/eudr/risk-assessments?${queryParams}`，动态部分待绑定
- API模板 L153：`/api/eudr/risk-assessments?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L110：apiCall(`/api/eudr/risk-assessments?${queryParams}`)；尚未运行验证。
- 请求调用 L152：apiCall(`/api/eudr/risk-assessments?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/eudr/statements/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/statements/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：LoadingMessage, Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/eudr/statements
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L57：`/api/sales/order-lines?orderId=${encodeURIComponent(orderId)}&page=${page}&pageSize=${ORDER_LINES_PAGE_SIZE}`，动态部分待绑定
- API模板 L80：`/api/eudr/product-mappings?productId=${encodeURIComponent(chunk.join(","))}&pageSize=100`，动态部分待绑定
- API模板 L161：`/api/eudr/statements?id=${encodeURIComponent(seedingId)}`，动态部分待绑定
- API模板 L196：`/api/sales/orders?id=${encodeURIComponent(seedingId)}`，动态部分待绑定
- 请求调用 L56：apiCall(`/api/sales/order-lines?orderId=${encodeURIComponent(orderId)}&page=${page}&pageSize=${ORDER_LINES_PAGE_SIZE}`)；尚未运行验证。
- 请求调用 L79：apiCall(`/api/eudr/product-mappings?productId=${encodeURIComponent(chunk.join(","))}&pageSize=100`)；尚未运行验证。
- 请求调用 L160：apiCall(`/api/eudr/statements?id=${encodeURIComponent(seedingId)}`)；尚未运行验证。
- 请求调用 L195：apiCall(`/api/sales/orders?id=${encodeURIComponent(seedingId)}`)；尚未运行验证。
- 请求调用 L404：createCrud("eudr/statements")；尚未运行验证。

### `/backend/eudr/statements`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/statements/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：11文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementRiskSection.js:63`：apiCall(`/api/eudr/risk-assessments?statementId=${encodeURIComponent(statementId)}&pageSize=5&sortField=assessedAt&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L85：`/api/eudr/statements?${queryParams}`，动态部分待绑定
- API模板 L125：`/api/eudr/statements?id=${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L84：apiCall(`/api/eudr/statements?${queryParams}`)；尚未运行验证。
- 请求调用 L124：apiCall(`/api/eudr/statements?id=${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/eudr/evidence-submissions/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/evidence-submissions/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr/evidence-submissions
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L117：`/api/eudr/evidence-submissions?id=${encodeURIComponent(submissionId)}`，动态部分待绑定
- API模板 L148：`/api/eudr/evidence-submissions?id=${encodeURIComponent(submissionId)}`，动态部分待绑定
- 请求调用 L116：apiCall(`/api/eudr/evidence-submissions?id=${encodeURIComponent(submissionId)}`)；尚未运行验证。
- 请求调用 L147：apiCall(`/api/eudr/evidence-submissions?id=${encodeURIComponent(submissionId)}`)；尚未运行验证。
- 请求调用 L434：updateCrud("eudr/evidence-submissions")；尚未运行验证。
- 请求调用 L443：deleteCrud("eudr/evidence-submissions")；尚未运行验证。

### `/backend/eudr/plots/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/plots/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr/plots
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：13文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L70：`/api/eudr/plots?id=${encodeURIComponent(plotId)}`，动态部分待绑定
- 请求调用 L69：apiCall(`/api/eudr/plots?id=${encodeURIComponent(plotId)}`)；尚未运行验证。
- 请求调用 L332：updateCrud("eudr/plots")；尚未运行验证。
- 请求调用 L341：deleteCrud("eudr/plots")；尚未运行验证。

### `/backend/eudr/product-mappings/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/product-mappings/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr/product-mappings
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：9文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L51：`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}`，动态部分待绑定
- 请求调用 L50：apiCall(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}`)；尚未运行验证。
- 请求调用 L223：updateCrud("eudr/product-mappings")；尚未运行验证。
- 请求调用 L242：deleteCrud("eudr/product-mappings")；尚未运行验证。

### `/backend/eudr/risk-assessments/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/risk-assessments/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr/risk-assessments
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：12文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/MitigationActionsSection.js:90`：apiCall(`/api/eudr/mitigation-actions?riskAssessmentId=${encodeURIComponent(riskAssessmentId)}&pageSize=100&sortField=dueDate&sortDir=asc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/MitigationActionsSection.js:136`：deleteCrud("eudr/mitigation-actions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/MitigationActionsSection.js:318`：updateCrud("eudr/mitigation-actions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/MitigationActionsSection.js:327`：createCrud("eudr/mitigation-actions")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementRiskSection.js:63`：apiCall(`/api/eudr/risk-assessments?statementId=${encodeURIComponent(statementId)}&pageSize=5&sortField=assessedAt&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L100：`/api/eudr/risk-assessments?id=${encodeURIComponent(riskAssessmentId)}`，动态部分待绑定
- 请求调用 L99：apiCall(`/api/eudr/risk-assessments?id=${encodeURIComponent(riskAssessmentId)}`)；尚未运行验证。
- 请求调用 L282：updateCrud("eudr/risk-assessments")；尚未运行验证。
- 请求调用 L299：deleteCrud("eudr/risk-assessments")；尚未运行验证。

### `/backend/eudr/statements/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/eudr/backend/eudr/statements/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, DataTable, ErrorMessage, LoadingMessage, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/eudr/statements
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：15文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:251`：readApiResultOrThrow(`/api/catalog/products?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:260`：readApiResultOrThrow(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:298`：readApiResultOrThrow(`/api/customers/companies?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:307`：readApiResultOrThrow(`/api/customers/companies?id=${encodeURIComponent(companyId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:349`：readApiResultOrThrow(`/api/eudr/product-mappings?${mappingParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:360`：readApiResultOrThrow(`/api/catalog/products?${productParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:365`：readApiResultOrThrow(`/api/eudr/product-mappings?${directParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:379`：readApiResultOrThrow(`/api/eudr/product-mappings?${byProductParams.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:395`：readApiResultOrThrow(`/api/eudr/product-mappings?id=${encodeURIComponent(mappingId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:427`：readApiResultOrThrow(`/api/eudr/statements?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/formConfig.js:436`：readApiResultOrThrow(`/api/eudr/statements?id=${encodeURIComponent(statementId)}&pageSize=1`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementLifecycleBar.js:119`：updateCrud("eudr/statements")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementReadinessChecklist.js:22`：apiCall(`/api/eudr/statements/${encodeURIComponent(statementId)}/readiness`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/StatementRiskSection.js:63`：apiCall(`/api/eudr/risk-assessments?statementId=${encodeURIComponent(statementId)}&pageSize=5&sortField=assessedAt&sortDir=desc`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/OrderSelectField.js:37`：apiCall(url)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:69`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/eudr/components/PlotMultiSelectField.js:107`：apiCall(`/api/eudr/plots?${params.toString()}`)，未运行验证。
- API模板 L117：`/api/eudr/statements?id=${encodeURIComponent(statementId)}`，动态部分待绑定
- API模板 L152：`/api/eudr/evidence-submissions?statementId=${encodeURIComponent(statementId)}&pageSize=100`，动态部分待绑定
- API模板 L187：`/api/eudr/product-mappings?ids=${encodeURIComponent(productMappingIds.join(","))}&pageSize=100`，动态部分待绑定
- API模板 L225：`/api/eudr/plots?ids=${encodeURIComponent(plotIds.join(","))}&pageSize=100`，动态部分待绑定
- API模板 L446：`/api/eudr/statements/${encodeURIComponent(statementId)}/export${suffix}`，动态部分待绑定
- 请求调用 L116：apiCall(`/api/eudr/statements?id=${encodeURIComponent(statementId)}`)；尚未运行验证。
- 请求调用 L151：apiCall(`/api/eudr/evidence-submissions?statementId=${encodeURIComponent(statementId)}&pageSize=100`)；尚未运行验证。
- 请求调用 L186：apiCall(`/api/eudr/product-mappings?ids=${encodeURIComponent(productMappingIds.join(","))}&pageSize=100`)；尚未运行验证。
- 请求调用 L224：apiCall(`/api/eudr/plots?ids=${encodeURIComponent(plotIds.join(","))}&pageSize=100`)；尚未运行验证。
- 请求调用 L446：apiCall(`/api/eudr/statements/${encodeURIComponent(statementId)}/export${suffix}`)；尚未运行验证。
- 请求调用 L544：updateCrud("eudr/statements")；尚未运行验证。
- 请求调用 L568：deleteCrud("eudr/statements")；尚未运行验证。

### `/backend/webhooks/create`

- 源文件：`node_modules/@open-mercato/webhooks/dist/modules/webhooks/backend/webhooks/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/webhooks
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/webhooks/dist/modules/webhooks/components/webhook-form-config.js:9`：apiCall("/api/webhooks/events")，未运行验证。
- 请求调用 L42：createCrud("webhooks")；尚未运行验证。

### `/backend/webhooks`

- 源文件：`node_modules/@open-mercato/webhooks/dist/modules/webhooks/backend/webhooks/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.channels"}
- 现有组件导入：Page, PageBody, DataTable, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/webhooks/dist/modules/webhooks/backend/webhooks/useWebhookFeatureAccess.js:12`：apiCall("/api/auth/feature-check")，未运行验证。
- API模板 L50：`/api/webhooks?${params.toString()}`，动态部分待绑定
- API模板 L89：`/api/webhooks/${encodeURIComponent(row.id)}`，动态部分待绑定
- API模板 L110：`/api/webhooks/${encodeURIComponent(row.id)}`，动态部分待绑定
- 请求调用 L49：apiCall(`/api/webhooks?${params.toString()}`)；尚未运行验证。
- 请求调用 L88：apiCall(`/api/webhooks/${encodeURIComponent(row.id)}`)；尚未运行验证。
- 请求调用 L109：apiCall(`/api/webhooks/${encodeURIComponent(row.id)}`)；尚未运行验证。

### `/backend/webhooks/[id]`

- 源文件：`node_modules/@open-mercato/webhooks/dist/modules/webhooks/backend/webhooks/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, LoadingMessage, ErrorMessage, DataTable, CrudForm, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/webhooks
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：4文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/webhooks/dist/modules/webhooks/components/webhook-form-config.js:9`：apiCall("/api/webhooks/events")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/webhooks/dist/modules/webhooks/backend/webhooks/useWebhookFeatureAccess.js:12`：apiCall("/api/auth/feature-check")，未运行验证。
- API模板 L76：`/api/webhooks/${encodeURIComponent(webhookId)}`，动态部分待绑定
- API模板 L110：`/api/webhooks/deliveries?${params2.toString()}`，动态部分待绑定
- API模板 L128：`/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}`，动态部分待绑定
- API模板 L195：`/api/webhooks/${encodeURIComponent(webhook.id)}`，动态部分待绑定
- API模板 L216：`/api/webhooks/${encodeURIComponent(webhook.id)}/rotate-secret`，动态部分待绑定
- API模板 L235：`/api/webhooks/${encodeURIComponent(webhook.id)}/test`，动态部分待绑定
- API模板 L257：`/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`，动态部分待绑定
- 请求调用 L75：apiCall(`/api/webhooks/${encodeURIComponent(webhookId)}`)；尚未运行验证。
- 请求调用 L109：apiCall(`/api/webhooks/deliveries?${params2.toString()}`)；尚未运行验证。
- 请求调用 L127：apiCall(`/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}`)；尚未运行验证。
- 请求调用 L194：apiCall(`/api/webhooks/${encodeURIComponent(webhook.id)}`)；尚未运行验证。
- 请求调用 L215：apiCall(`/api/webhooks/${encodeURIComponent(webhook.id)}/rotate-secret`)；尚未运行验证。
- 请求调用 L234：apiCall(`/api/webhooks/${encodeURIComponent(webhook.id)}/test`)；尚未运行验证。
- 请求调用 L256：apiCall(`/api/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`)；尚未运行验证。
- 请求调用 L274：deleteCrud(`webhooks/${encodeURIComponent(webhook.id)}`)；尚未运行验证。
- 请求调用 L414：updateCrud(`webhooks/${encodeURIComponent(webhook.id)}`)；尚未运行验证。

### `/backend/customer_accounts/roles/create`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/roles/create/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm
- 交互计划：validate-save-or-cancel-to-parent；返回：/backend/customer_accounts/roles
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 请求调用 L100：createCrud("customer_accounts/admin/roles")；尚未运行验证。

### `/backend/customer_accounts/roles`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/roles/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.portal"}
- 现有组件导入：Page, PageBody, DataTable
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L59：`/api/customer_accounts/admin/roles?${queryParams}`，动态部分待绑定
- API模板 L98：`/api/customer_accounts/admin/roles/${encodeURIComponent(role.id)}`，动态部分待绑定
- 请求调用 L58：readApiResultOrThrow(`/api/customer_accounts/admin/roles?${queryParams}`)；尚未运行验证。
- 请求调用 L97：apiCall(`/api/customer_accounts/admin/roles/${encodeURIComponent(role.id)}`)；尚未运行验证。

### `/backend/customer_accounts/settings/domain`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/settings/domain/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.portal"}
- 现有组件导入：Page, PageBody, EmptyState, LoadingMessage, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：10文件；截断：false（静态证据）
- API字面量 L72：`/api/directory/organization-switcher`，未证实运行调用
- API字面量 L183：`/api/customer_accounts/admin/domain-mappings`，未证实运行调用
- API模板 L110：`/api/customer_accounts/admin/domain-mappings?organizationId=${encodeURIComponent(selectedOrgId)}`，动态部分待绑定
- API模板 L210：`/api/customer_accounts/admin/domain-mappings/${encodeURIComponent(mapping.id)}/verify`，动态部分待绑定
- API模板 L232：`/api/customer_accounts/admin/domain-mappings/${encodeURIComponent(mapping.id)}/health-check`，动态部分待绑定
- API模板 L267：`/api/customer_accounts/admin/domain-mappings?id=${encodeURIComponent(mapping.id)}`，动态部分待绑定
- 请求调用 L72：apiCall("/api/directory/organization-switcher")；尚未运行验证。
- 请求调用 L109：apiCall(`/api/customer_accounts/admin/domain-mappings?organizationId=${encodeURIComponent(selectedOrgId)}`)；尚未运行验证。
- 请求调用 L182：apiCall("/api/customer_accounts/admin/domain-mappings")；尚未运行验证。
- 请求调用 L209：apiCall(`/api/customer_accounts/admin/domain-mappings/${encodeURIComponent(mapping.id)}/verify`)；尚未运行验证。
- 请求调用 L231：apiCall(`/api/customer_accounts/admin/domain-mappings/${encodeURIComponent(mapping.id)}/health-check`)；尚未运行验证。
- 请求调用 L266：apiCall(`/api/customer_accounts/admin/domain-mappings?id=${encodeURIComponent(mapping.id)}`)；尚未运行验证。

### `/backend/customer_accounts/settings`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/settings/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.portal"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/useDemoPortalAccounts.js:10`：apiCall("/api/customer_accounts/admin/demo-accounts")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customer_accounts/users`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/page.js`
- 导航覆盖：{"key":"crmNav.manage.category.portal"}
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：6文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/PortalUsersPageClient.js:32`：apiCall("/api/customer_accounts/admin/roles?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/PortalUsersPageClient.js:70`：apiCall("/api/customer_accounts/admin/users")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/PortalUsersPageClient.js:260`：readApiResultOrThrow(`/api/customer_accounts/admin/users?${queryParams}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/PortalUsersPageClient.js:300`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(user.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/PortalUsersPageClient.js:336`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(user.id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/useDemoPortalAccounts.js:10`：apiCall("/api/customer_accounts/admin/demo-accounts")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/backend/customer_accounts/roles/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/roles/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody, CrudForm, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customer_accounts/roles
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L138：`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L223：`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`，动态部分待绑定
- API模板 L244：`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}/acl`，动态部分待绑定
- API模板 L263：`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`，动态部分待绑定
- 请求调用 L137：readApiResultOrThrow(`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L222：apiCall(`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`)；尚未运行验证。
- 请求调用 L243：apiCall(`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}/acl`)；尚未运行验证。
- 请求调用 L262：apiCall(`/api/customer_accounts/admin/roles/${encodeURIComponent(id)}`)；尚未运行验证。

### `/backend/customer_accounts/users/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Page, PageBody
- 交互计划：inspect-actions-and-resource-scope；返回：/backend/customer_accounts/users
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:46`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(userId)}/reset-password`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:161`：readApiResultOrThrow(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:194`：apiCall("/api/customer_accounts/admin/roles?pageSize=100")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:216`：apiCall(`/api/customers/people/${encodeURIComponent(data.personEntityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:226`：apiCall(`/api/customers/companies/${encodeURIComponent(data.customerEntityId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:245`：apiCall(`/api/customers/people?search=${encodeURIComponent(query.trim())}&pageSize=10`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:264`：apiCall(`/api/customers/companies?search=${encodeURIComponent(query.trim())}&pageSize=10`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:281`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}/send-reset-link`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:306`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:356`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:385`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}/verify-email`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/customer_accounts/backend/customer_accounts/users/[id]/PortalUserDetailPageClient.js:407`：apiCall(`/api/customer_accounts/admin/users/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/reset/[token]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/frontend/reset/[token]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L34：`/api/auth/reset/validate`，未证实运行调用
- API字面量 L75：`/api/auth/reset/confirm`，未证实运行调用
- 请求调用 L33：apiCall("/api/auth/reset/validate")；尚未运行验证。
- 请求调用 L74：apiCall("/api/auth/reset/confirm")；尚未运行验证。

### `/login`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/frontend/login.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Card, Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L118：`/api/auth/feature-check`，未证实运行调用
- API字面量 L232：`/api/auth/login`，未证实运行调用
- API模板 L182：`/api/directory/tenants/lookup?tenantId=${encodeURIComponent(tenantId)}`，动态部分待绑定
- 请求调用 L118：apiCall("/api/auth/feature-check")；尚未运行验证。
- 请求调用 L181：apiCall(`/api/directory/tenants/lookup?tenantId=${encodeURIComponent(tenantId)}`)；尚未运行验证。
- 请求调用 L232：fetch("/api/auth/login")；尚未运行验证。

### `/reset`

- 源文件：`node_modules/@open-mercato/core/dist/modules/auth/frontend/reset.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Card
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L23：`/api/auth/reset`，未证实运行调用
- 请求调用 L23：fetch("/api/auth/reset")；尚未运行验证。

### `/quote/[token]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/sales/frontend/quote/[token]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L50：`/api/sales/quotes/accept`，未证实运行调用
- API模板 L27：`/api/sales/quotes/public/${token}`，动态部分待绑定

### `/[orgSlug]/portal/claims/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/frontend/[orgSlug]/portal/claims/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：ErrorMessage, LoadingMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L286：`/api/warranty_claims/portal/events`，未证实运行调用
- API字面量 L334：`/api/warranty_claims/portal/attachments`，未证实运行调用
- API模板 L242：`/api/warranty_claims/portal/events?claimId=${encodeURIComponent(claimId)}`，动态部分待绑定
- API模板 L246：`/api/warranty_claims/portal/attachments?claimId=${encodeURIComponent(claimId)}`，动态部分待绑定
- API模板 L254：`/api/warranty_claims/portal/claims/${encodeURIComponent(params.id)}`，动态部分待绑定
- API模板 L393：`/api/warranty_claims/portal/attachments?attachmentId=${encodeURIComponent(attachment.id)}`，动态部分待绑定
- API模板 L431：`/api/warranty_claims/portal/claims/${encodeURIComponent(claim.id)}/${action}`，动态部分待绑定
- 请求调用 L242：apiCall(`/api/warranty_claims/portal/events?claimId=${encodeURIComponent(claimId)}`)；尚未运行验证。
- 请求调用 L246：apiCall(`/api/warranty_claims/portal/attachments?claimId=${encodeURIComponent(claimId)}`)；尚未运行验证。
- 请求调用 L254：apiCall(`/api/warranty_claims/portal/claims/${encodeURIComponent(params.id)}`)；尚未运行验证。
- 请求调用 L286：apiCall("/api/warranty_claims/portal/events")；尚未运行验证。
- 请求调用 L334：apiCall("/api/warranty_claims/portal/attachments")；尚未运行验证。
- 请求调用 L392：apiCall(`/api/warranty_claims/portal/attachments?attachmentId=${encodeURIComponent(attachment.id)}`)；尚未运行验证。
- 请求调用 L435：apiCall(endpoint)；尚未运行验证。

### `/[orgSlug]/portal/claims/new`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/frontend/[orgSlug]/portal/claims/new/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert, ErrorMessage
- 交互计划：validate-save-or-cancel-to-parent；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- API字面量 L208：`/api/warranty_claims/portal/options`，未证实运行调用
- API字面量 L540：`/api/warranty_claims/portal/attachments`，未证实运行调用
- API字面量 L575：`/api/warranty_claims/portal/claims`，未证实运行调用
- API模板 L196：`/api/warranty_claims/portal/claims?serialNumber=${encodeURIComponent(trimmed)}&pageSize=5`，动态部分待绑定
- API模板 L233：`/api/warranty_claims/portal/troubleshooting?${params2.toString()}`，动态部分待绑定
- API模板 L260：`/api/warranty_claims/portal/orders?search=${search}&page=1`，动态部分待绑定
- API模板 L296：`/api/warranty_claims/portal/orders/lines?orderId=${encodeURIComponent(selectedOrderId)}`，动态部分待绑定
- 请求调用 L195：apiCall(`/api/warranty_claims/portal/claims?serialNumber=${encodeURIComponent(trimmed)}&pageSize=5`)；尚未运行验证。
- 请求调用 L208：apiCall("/api/warranty_claims/portal/options")；尚未运行验证。
- 请求调用 L232：apiCall(`/api/warranty_claims/portal/troubleshooting?${params2.toString()}`)；尚未运行验证。
- 请求调用 L260：apiCall(`/api/warranty_claims/portal/orders?search=${search}&page=1`)；尚未运行验证。
- 请求调用 L295：apiCall(`/api/warranty_claims/portal/orders/lines?orderId=${encodeURIComponent(selectedOrderId)}`)；尚未运行验证。
- 请求调用 L540：apiCall("/api/warranty_claims/portal/attachments")；尚未运行验证。
- 请求调用 L575：apiCall("/api/warranty_claims/portal/claims")；尚未运行验证。

### `/[orgSlug]/portal/claims`

- 源文件：`node_modules/@open-mercato/core/dist/modules/warranty_claims/frontend/[orgSlug]/portal/claims/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：DataTable, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API模板 L66：`/api/warranty_claims/portal/claims?${queryParams.toString()}`，动态部分待绑定
- API模板 L106：`/api/warranty_claims/portal/claims?${query.toString()}`，动态部分待绑定
- 请求调用 L65：apiCall(`/api/warranty_claims/portal/claims?${queryParams.toString()}`)；尚未运行验证。
- 请求调用 L105：apiCall(`/api/warranty_claims/portal/claims?${query.toString()}`)；尚未运行验证。

### `/privacy`

- 源文件：`node_modules/@open-mercato/content/dist/modules/content/frontend/privacy/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/terms`

- 源文件：`node_modules/@open-mercato/content/dist/modules/content/frontend/terms/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/onboarding`

- 源文件：`node_modules/@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/OnboardingPageClient.js:100`：apiCall("/api/onboarding/onboarding")，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/onboarding/preparing`

- 源文件：`node_modules/@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/preparing/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/preparing/PreparingPageClient.js:28`：apiCall(`/api/directory/tenants/lookup?tenantId=${encodeURIComponent(tenantId)}`)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/onboarding/dist/modules/onboarding/frontend/onboarding/preparing/PreparingPageClient.js:57`：apiCall(`/api/onboarding/onboarding/status?tenantId=${encodeURIComponent(tenantId)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/docs/api`

- 源文件：`node_modules/@open-mercato/core/dist/modules/api_docs/frontend/docs/api/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/api_docs/frontend/docs/api/Explorer.js:1002`：fetch(requestPreview.url)，未运行验证。
- API字面量 L71：`/api/docs/openapi`，未证实运行调用
- API字面量 L72：`/api/docs/markdown`，未证实运行调用
- 请求调用 L45：fetch(`${baseUrl}/docs/openapi`)；尚未运行验证。

### `/checkout-demo`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/frontend/checkout-demo/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- API字面量 L107：`/api/workflows/definitions?workflowId=workflows.checkout-demo`，未证实运行调用
- API字面量 L116：`/api/customers/companies?pageSize=100`，未证实运行调用
- API字面量 L215：`/api/workflows/instances/validate-start`，未证实运行调用
- API字面量 L311：`/api/workflows/instances`，未证实运行调用
- API字面量 L1097：`/api/webhooks/payments`，未证实运行调用
- API模板 L47：`/api/workflows/instances/${result.instanceId}`，动态部分待绑定
- API模板 L74：`/api/workflows/events?workflowInstanceId=${result.instanceId}&sortField=occurredAt&sortDir=desc&pageSize=20`，动态部分待绑定
- API模板 L91：`/api/workflows/tasks?workflowInstanceId=${result.instanceId}&status=PENDING`，动态部分待绑定
- API模板 L130：`/api/catalog/products?${params}`，动态部分待绑定
- API模板 L364：`/api/workflows/instances/${result.instanceId}/advance`，动态部分待绑定
- API模板 L460：`/api/workflows/instances/${result.instanceId}/signal`，动态部分待绑定
- API模板 L522：`/api/workflows/tasks/${task.id}/complete`，动态部分待绑定
- 请求调用 L47：fetch(`/api/workflows/instances/${result.instanceId}`)；尚未运行验证。
- 请求调用 L73：fetch(`/api/workflows/events?workflowInstanceId=${result.instanceId}&sortField=occurredAt&sortDir=desc&pageSize=20`)；尚未运行验证。
- 请求调用 L90：fetch(`/api/workflows/tasks?workflowInstanceId=${result.instanceId}&status=PENDING`)；尚未运行验证。
- 请求调用 L107：fetch("/api/workflows/definitions?workflowId=workflows.checkout-demo")；尚未运行验证。
- 请求调用 L116：fetch("/api/customers/companies?pageSize=100")；尚未运行验证。
- 请求调用 L130：fetch(`/api/catalog/products?${params}`)；尚未运行验证。
- 请求调用 L215：fetch("/api/workflows/instances/validate-start")；尚未运行验证。
- 请求调用 L311：fetch("/api/workflows/instances")；尚未运行验证。
- 请求调用 L364：fetch(`/api/workflows/instances/${result.instanceId}/advance`)；尚未运行验证。
- 请求调用 L470：fetch(signalUrl)；尚未运行验证。
- 请求调用 L522：fetch(`/api/workflows/tasks/${task.id}/complete`)；尚未运行验证。

### `/[orgSlug]/portal/tasks/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/frontend/[orgSlug]/portal/tasks/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：5文件；截断：false（静态证据）
- API模板 L28：`/api/workflows/portal/tasks/${encodeURIComponent(params.id)}`，动态部分待绑定
- API模板 L60：`/api/workflows/portal/tasks/${encodeURIComponent(task.id)}/complete`，动态部分待绑定
- 请求调用 L27：apiCall(`/api/workflows/portal/tasks/${encodeURIComponent(params.id)}`)；尚未运行验证。
- 请求调用 L59：apiCall(`/api/workflows/portal/tasks/${encodeURIComponent(task.id)}/complete`)；尚未运行验证。

### `/[orgSlug]/portal/tasks`

- 源文件：`node_modules/@open-mercato/core/dist/modules/workflows/frontend/[orgSlug]/portal/tasks/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L20：`/api/workflows/portal/tasks`，未证实运行调用
- 请求调用 L20：apiCall("/api/workflows/portal/tasks")；尚未运行验证。

### `/[orgSlug]/portal/time-reports/[id]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/frontend/[orgSlug]/portal/time-reports/[id]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：EmptyState, ErrorMessage
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L38：`/api/staff/portal/time-reports/${encodeURIComponent(params.id)}`，动态部分待绑定
- 请求调用 L37：apiCall(`/api/staff/portal/time-reports/${encodeURIComponent(params.id)}`)；尚未运行验证。

### `/[orgSlug]/portal/time-reports`

- 源文件：`node_modules/@open-mercato/core/dist/modules/staff/frontend/[orgSlug]/portal/time-reports/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：ErrorMessage, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API模板 L36：`/api/staff/portal/time-reports?page=${page}&pageSize=${PAGE_SIZE}`，动态部分待绑定
- 请求调用 L35：apiCall(`/api/staff/portal/time-reports?page=${page}&pageSize=${PAGE_SIZE}`)；尚未运行验证。

### `/messages/view/[token]`

- 源文件：`node_modules/@open-mercato/core/dist/modules/messages/frontend/messages/view/[token]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：13文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/core/dist/modules/messages/components/confirmation/MessageConfirmationContent.js:34`：apiCall(`/api/messages/${encodeURIComponent(message.id)}/confirmation`)，未运行验证。
- API模板 L90：`/api/messages/token/${encodeURIComponent(token)}`，动态部分待绑定
- 请求调用 L90：apiCall(`/api/messages/token/${encodeURIComponent(token)}`)；尚未运行验证。

### `/pay/[slug]/cancel/[transactionId]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/frontend/pay/[slug]/cancel/[transactionId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/TransactionStatusPage.js:83`：readApiResultOrThrow(`/api/checkout/pay/${encodeURIComponent(slug)}/status/${encodeURIComponent(transactionId)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/pay/[slug]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/frontend/pay/[slug]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：3文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:276`：fetch("/api/auth/locale")，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:1089`：readApiResultOrThrow(endpoint)，未运行验证。
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/PayPage.js:1458`：readApiResultOrThrow(`/api/checkout/pay/${encodeURIComponent(slug)}/submit`)，未运行验证。
- 请求调用 L36：fetch(requestUrl)；尚未运行验证。

### `/pay/[slug]/success/[transactionId]`

- 源文件：`node_modules/@open-mercato/checkout/dist/modules/checkout/frontend/pay/[slug]/success/[transactionId]/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 子组件请求 `node_modules/@open-mercato/checkout/dist/modules/checkout/components/TransactionStatusPage.js:83`：readApiResultOrThrow(`/api/checkout/pay/${encodeURIComponent(slug)}/status/${encodeURIComponent(transactionId)}`)，未运行验证。
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/[orgSlug]/portal/dashboard`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/dashboard/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：2文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/[orgSlug]/portal/invite`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/invite/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L61：`/api/customer_accounts/invitations/accept`，未证实运行调用
- 请求调用 L61：apiCall("/api/customer_accounts/invitations/accept")；尚未运行验证。

### `/[orgSlug]/portal/login`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/login/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L37：`/api/customer_accounts/login`，未证实运行调用
- 请求调用 L37：apiCall("/api/customer_accounts/login")；尚未运行验证。

### `/[orgSlug]/portal`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/[orgSlug]/portal/profile`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/profile/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：未直接导入/检查子组件
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- 契约：未映射，需跟踪子组件/helper，不按模块猜测。

### `/[orgSlug]/portal/reset-password`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/reset-password/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L55：`/api/customer_accounts/password/reset-confirm`，未证实运行调用
- 请求调用 L55：apiCall("/api/customer_accounts/password/reset-confirm")；尚未运行验证。

### `/[orgSlug]/portal/signup`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/signup/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert, EmptyState
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L41：`/api/customer_accounts/signup`，未证实运行调用
- 请求调用 L41：apiCall("/api/customer_accounts/signup")；尚未运行验证。

### `/[orgSlug]/portal/verify`

- 源文件：`node_modules/@open-mercato/core/dist/modules/portal/frontend/[orgSlug]/portal/verify/page.js`
- 导航覆盖：无；沿用模块声明
- 现有组件导入：Alert
- 交互计划：inspect-actions-and-resource-scope；返回：unresolved-parent
- 状态验收：loading, empty, error, forbidden, conflict, narrow, light, dark（均待运行验证）
- 子组件追踪：1文件；截断：false（静态证据）
- API字面量 L20：`/api/customer_accounts/email/verify`，未证实运行调用
- 请求调用 L20：apiCall("/api/customer_accounts/email/verify")；尚未运行验证。


## 独立应用壳路由（可能覆盖模块声明）

- `/backend/[...slug]` → `src/app/(backend)/backend/[...slug]/page.tsx`
- `/backend` → `src/app/(backend)/backend/page.tsx`
- `/[...slug]` → `src/app/(frontend)/[...slug]/page.tsx`
- `/login` → `src/app/login/page.tsx`
- `/` → `src/app/page.tsx`
- `/start` → `src/app/start/page.tsx`

## 独立API Handler（不等于全部OpenAPI操作）

- `/api/[...slug]` → `src/app/api/[...slug]/route.ts`
- `/api/auth/login` → `src/app/api/auth/login/route.ts`
- `/api/dev-runtime/actions/[action]` → `src/app/api/dev-runtime/actions/[action]/route.ts`
- `/api/dev-runtime/diagnostics` → `src/app/api/dev-runtime/diagnostics/route.ts`
- `/api/dev-runtime/logs` → `src/app/api/dev-runtime/logs/route.ts`
- `/api/dev-runtime/status` → `src/app/api/dev-runtime/status/route.ts`
- `/api/docs/markdown` → `src/app/api/docs/markdown/route.ts`
- `/api/docs/openapi` → `src/app/api/docs/openapi/route.ts`
- `/api/healthz` → `src/app/api/healthz/route.ts`
- `/api/internal/ai-assistant-dsh-chat` → `src/app/api/internal/ai-assistant-dsh-chat/route.ts`
- `/api/internal/ai-assistant-dsh-runs/[runId]/cancel` → `src/app/api/internal/ai-assistant-dsh-runs/[runId]/cancel/route.ts`
- `/api/internal/customer-access/[id]` → `src/app/api/internal/customer-access/[id]/route.ts`
- `/api/internal/customer-access` → `src/app/api/internal/customer-access/route.ts`
- `/api/internal/dsh-agentic-chat` → `src/app/api/internal/dsh-agentic-chat/route.ts`
- `/api/internal/dsh-agents` → `src/app/api/internal/dsh-agents/route.ts`
- `/api/internal/dsh-bindings/revoke` → `src/app/api/internal/dsh-bindings/revoke/route.ts`
- `/api/internal/dsh-conversations` → `src/app/api/internal/dsh-conversations/route.ts`
- `/api/internal/dsh-health` → `src/app/api/internal/dsh-health/route.ts`
- `/api/internal/dsh-tools/[tool]` → `src/app/api/internal/dsh-tools/[tool]/route.ts`
- `/api/internal/dsh-write-approvals/[id]` → `src/app/api/internal/dsh-write-approvals/[id]/route.ts`
- `/api/internal/dsh-write-approvals` → `src/app/api/internal/dsh-write-approvals/route.ts`
- `/api/leadgen/candidates/[id]/crm-write` → `src/app/api/leadgen/candidates/[id]/crm-write/route.ts`
- `/api/leadgen/candidates/[id]/decisions` → `src/app/api/leadgen/candidates/[id]/decisions/route.ts`
- `/api/leadgen/candidates/[id]` → `src/app/api/leadgen/candidates/[id]/route.ts`
- `/api/leadgen/candidates/[id]/verify` → `src/app/api/leadgen/candidates/[id]/verify/route.ts`
- `/api/leadgen/candidates` → `src/app/api/leadgen/candidates/route.ts`
- `/api/leadgen/drafts/[id]/approvals` → `src/app/api/leadgen/drafts/[id]/approvals/route.ts`
- `/api/leadgen/drafts/[id]/sends` → `src/app/api/leadgen/drafts/[id]/sends/route.ts`
- `/api/leadgen/drafts` → `src/app/api/leadgen/drafts/route.ts`
- `/api/leadgen/quota/buckets` → `src/app/api/leadgen/quota/buckets/route.ts`
- `/api/leadgen/quota/reservations` → `src/app/api/leadgen/quota/reservations/route.ts`
- `/api/leadgen/runs` → `src/app/api/leadgen/runs/route.ts`
- `/api/leadgen/suppressions` → `src/app/api/leadgen/suppressions/route.ts`

## 后端操作目录

| 方法 | 路径 | operationId | 响应码 |
|---|---|---|---|
| PATCH | /api/dashboards/layout/{itemId} | dashboards_patch_api_dashboards_layout_itemId | 200,400,401,403,404 |
| GET | /api/dashboards/layout | dashboards_get_api_dashboards_layout | 200,401,403 |
| PUT | /api/dashboards/layout | dashboards_put_api_dashboards_layout | 200,400,401,403,503 |
| GET | /api/dashboards/roles/widgets | dashboards_get_api_dashboards_roles_widgets | 200,400,401,403 |
| PUT | /api/dashboards/roles/widgets | dashboards_put_api_dashboards_roles_widgets | 200,400,401,403 |
| GET | /api/dashboards/users/widgets | dashboards_get_api_dashboards_users_widgets | 200,400,401,403 |
| PUT | /api/dashboards/users/widgets | dashboards_put_api_dashboards_users_widgets | 200,400,401,403 |
| POST | /api/dashboards/widgets/data/batch | dashboards_post_api_dashboards_widgets_data_batch | 200,400,401,403,500 |
| POST | /api/dashboards/widgets/data | dashboards_post_api_dashboards_widgets_data | 200,400,401,403,422,500,503 |
| GET | /api/auth/locale | auth_get_api_auth_locale | 200,302,400 |
| POST | /api/auth/locale | auth_post_api_auth_locale | 200,400 |
| GET | /api/auth/profile | auth_get_api_auth_profile | 200,401,404 |
| PUT | /api/auth/profile | auth_put_api_auth_profile | 200,400,401 |
| GET | /api/auth/roles/acl | auth_get_api_auth_roles_acl | 200,400,401,403,404 |
| PUT | /api/auth/roles/acl | auth_put_api_auth_roles_acl | 200,400,401,403,404 |
| GET | /api/auth/roles | auth_get_api_auth_roles | 200,401,403 |
| POST | /api/auth/roles | auth_post_api_auth_roles | 201,400,401,403 |
| PUT | /api/auth/roles | auth_put_api_auth_roles | 200,400,401,403,404 |
| DELETE | /api/auth/roles | auth_delete_api_auth_roles | 200,400,401,403,404 |
| GET | /api/auth/sidebar/preferences | auth_get_api_auth_sidebar_preferences | 200,401,403,404 |
| PUT | /api/auth/sidebar/preferences | auth_put_api_auth_sidebar_preferences | 200,400,401,403,404 |
| DELETE | /api/auth/sidebar/preferences | auth_delete_api_auth_sidebar_preferences | 200,400,401,403,404 |
| GET | /api/auth/sidebar/variants/{id} | auth_get_api_auth_sidebar_variants_id | 200,401,404 |
| PUT | /api/auth/sidebar/variants/{id} | auth_put_api_auth_sidebar_variants_id | 200,400,401,403,404 |
| DELETE | /api/auth/sidebar/variants/{id} | auth_delete_api_auth_sidebar_variants_id | 200,401,403,404 |
| GET | /api/auth/sidebar/variants | auth_get_api_auth_sidebar_variants | 200,401 |
| POST | /api/auth/sidebar/variants | auth_post_api_auth_sidebar_variants | 200,400,401,403 |
| GET | /api/auth/users/acl | auth_get_api_auth_users_acl | 200,400,401,403 |
| PUT | /api/auth/users/acl | auth_put_api_auth_users_acl | 200,400,401,403 |
| GET | /api/auth/users/consents | auth_get_api_auth_users_consents | 200,401,403 |
| POST | /api/auth/users/resend-invite | auth_post_api_auth_users_resend_invite | 200,400,401,403,404,409,422,429,500 |
| GET | /api/auth/users | auth_get_api_auth_users | 200,401,403 |
| POST | /api/auth/users | auth_post_api_auth_users | 201,400,401,403 |
| PUT | /api/auth/users | auth_put_api_auth_users | 200,400,401,403,404 |
| DELETE | /api/auth/users | auth_delete_api_auth_users | 200,400,401,403,404 |
| GET | /api/directory/organization-branding | directory_get_api_directory_organization_branding | 200,400,401,403,404 |
| PUT | /api/directory/organization-branding | directory_put_api_directory_organization_branding | 200,400,401,403,409,422 |
| GET | /api/directory/organization-switcher | directory_get_api_directory_organization_switcher | 200,401 |
| GET | /api/directory/organizations | directory_get_api_directory_organizations | 200,400,401,403 |
| POST | /api/directory/organizations | directory_post_api_directory_organizations | 201,400,401,403 |
| PUT | /api/directory/organizations | directory_put_api_directory_organizations | 200,400,401,403 |
| DELETE | /api/directory/organizations | directory_delete_api_directory_organizations | 200,400,401,403 |
| GET | /api/directory/tenants | directory_get_api_directory_tenants | 200,400,401,403 |
| POST | /api/directory/tenants | directory_post_api_directory_tenants | 201,400,401,403 |
| PUT | /api/directory/tenants | directory_put_api_directory_tenants | 200,400,401,403 |
| DELETE | /api/directory/tenants | directory_delete_api_directory_tenants | 200,400,401,403 |
| GET | /api/customers/activities | customers_get_api_customers_activities | 200,401,403 |
| POST | /api/customers/activities | customers_post_api_customers_activities | 201,401,403 |
| PUT | /api/customers/activities | customers_put_api_customers_activities | 200,401,403 |
| DELETE | /api/customers/activities | customers_delete_api_customers_activities | 200,401,403 |
| GET | /api/customers/addresses | customers_get_api_customers_addresses | 200,401,403 |
| POST | /api/customers/addresses | customers_post_api_customers_addresses | 201,401,403 |
| PUT | /api/customers/addresses | customers_put_api_customers_addresses | 200,401,403 |
| DELETE | /api/customers/addresses | customers_delete_api_customers_addresses | 200,401,403 |
| GET | /api/customers/assignable-staff | customers_get_api_customers_assignable_staff | 200,308,400,401,403 |
| GET | /api/customers/comments | customers_get_api_customers_comments | 200,401,403 |
| POST | /api/customers/comments | customers_post_api_customers_comments | 201,401,403 |
| PUT | /api/customers/comments | customers_put_api_customers_comments | 200,401,403 |
| DELETE | /api/customers/comments | customers_delete_api_customers_comments | 200,401,403 |
| GET | /api/customers/companies/{id}/people | customers_get_api_customers_companies_id_people | 200,401,403 |
| GET | /api/customers/companies/{id}/roles | customers_get_api_customers_companies_id_roles | 200,400,401,403 |
| POST | /api/customers/companies/{id}/roles | customers_post_api_customers_companies_id_roles | 201,400,401,403,409 |
| PUT | /api/customers/companies/{id}/roles | customers_put_api_customers_companies_id_roles | 200,400,401,403,404 |
| DELETE | /api/customers/companies/{id}/roles | customers_delete_api_customers_companies_id_roles | 200,400,401,403,404 |
| GET | /api/customers/companies/{id} | customers_get_api_customers_companies_id | 200,400,401,403,404 |
| GET | /api/customers/companies | customers_get_api_customers_companies | 200,401,403 |
| POST | /api/customers/companies | customers_post_api_customers_companies | 201,401,403 |
| PUT | /api/customers/companies | customers_put_api_customers_companies | 200,401,403 |
| DELETE | /api/customers/companies | customers_delete_api_customers_companies | 200,401,403,422 |
| GET | /api/customers/dashboard/widgets/customer-todos | customers_get_api_customers_dashboard_widgets_customer_todos | 200,400,401,403,500 |
| GET | /api/customers/dashboard/widgets/new-customers | customers_get_api_customers_dashboard_widgets_new_customers | 200,400,401,403,500 |
| GET | /api/customers/dashboard/widgets/new-deals | customers_get_api_customers_dashboard_widgets_new_deals | 200,400,401,403,500 |
| GET | /api/customers/dashboard/widgets/next-interactions | customers_get_api_customers_dashboard_widgets_next_interactions | 200,400,401,403,500 |
| GET | /api/customers/deals/{id}/companies | customers_get_api_customers_deals_id_companies | 200,401,403 |
| GET | /api/customers/deals/{id}/people | customers_get_api_customers_deals_id_people | 200,401,403 |
| GET | /api/customers/deals/{id} | customers_get_api_customers_deals_id | 200,401,403,404 |
| GET | /api/customers/deals/{id}/stats | customers_get_api_customers_deals_id_stats | 200,400,401,403,404 |
| GET | /api/customers/deals/aggregate | customers_get_api_customers_deals_aggregate | 200,400,401,403 |
| POST | /api/customers/deals/bulk-update-owner | customers_post_api_customers_deals_bulk_update_owner | 201,401,403 |
| POST | /api/customers/deals/bulk-update-stage | customers_post_api_customers_deals_bulk_update_stage | 201,401,403 |
| GET | /api/customers/deals/map | customers_get_api_customers_deals_map | 200,400,401,403 |
| GET | /api/customers/deals | customers_get_api_customers_deals | 200,401,403 |
| POST | /api/customers/deals | customers_post_api_customers_deals | 201,401,403 |
| PUT | /api/customers/deals | customers_put_api_customers_deals | 200,401,403 |
| DELETE | /api/customers/deals | customers_delete_api_customers_deals | 200,401,403 |
| GET | /api/customers/deals/summary | customers_get_api_customers_deals_summary | 200,401,403 |
| PATCH | /api/customers/dictionaries/{kind}/{id} | customers_patch_api_customers_dictionaries_kind_id | 200,400,401,403,404,409 |
| DELETE | /api/customers/dictionaries/{kind}/{id} | customers_delete_api_customers_dictionaries_kind_id | 200,401,403,404,409 |
| GET | /api/customers/dictionaries/{kind} | customers_get_api_customers_dictionaries_kind | 200,400,401,403 |
| POST | /api/customers/dictionaries/{kind} | customers_post_api_customers_dictionaries_kind | 200,201,400,401,403,409 |
| GET | /api/customers/dictionaries/currency | customers_get_api_customers_dictionaries_currency | 200,401,403,404,500 |
| GET | /api/customers/dictionaries/kind-settings | customers_get_api_customers_dictionaries_kind_settings | 200,401,403 |
| PATCH | /api/customers/dictionaries/kind-settings | customers_patch_api_customers_dictionaries_kind_settings | 200,400,401,403 |
| PATCH | /api/customers/interactions/{id}/visibility | customers_patch_api_customers_interactions_id_visibility | 200,400,401,403,404,422 |
| POST | /api/customers/interactions/cancel | customers_post_api_customers_interactions_cancel | 200,400,401,403,404 |
| POST | /api/customers/interactions/complete | customers_post_api_customers_interactions_complete | 200,400,401,403,404 |
| GET | /api/customers/interactions/conflicts | customers_get_api_customers_interactions_conflicts | 200,401,403 |
| GET | /api/customers/interactions/counts | customers_get_api_customers_interactions_counts | 200,401,403 |
| GET | /api/customers/interactions | customers_get_api_customers_interactions | 200,401,403 |
| POST | /api/customers/interactions | customers_post_api_customers_interactions | 201,401,403 |
| PUT | /api/customers/interactions | customers_put_api_customers_interactions | 200,401,403 |
| DELETE | /api/customers/interactions | customers_delete_api_customers_interactions | 200,401,403 |
| GET | /api/customers/interactions/tasks | customers_get_api_customers_interactions_tasks | 200,401,403 |
| POST | /api/customers/labels/assign | customers_post_api_customers_labels_assign | 200,201,401,404 |
| GET | /api/customers/labels | customers_get_api_customers_labels | 200,401,403 |
| POST | /api/customers/labels | customers_post_api_customers_labels | 201,401,403,409 |
| POST | /api/customers/labels/unassign | customers_post_api_customers_labels_unassign | 200,401,404 |
| PATCH | /api/customers/people/{id}/companies/{linkId} | customers_patch_api_customers_people_id_companies_linkId | 200,401,403 |
| DELETE | /api/customers/people/{id}/companies/{linkId} | customers_delete_api_customers_people_id_companies_linkId | 200,401,403 |
| GET | /api/customers/people/{id}/companies/enriched | customers_get_api_customers_people_id_companies_enriched | 200,401,403 |
| GET | /api/customers/people/{id}/companies | customers_get_api_customers_people_id_companies | 200,401,403 |
| POST | /api/customers/people/{id}/companies | customers_post_api_customers_people_id_companies | 200,401,403 |
| GET | /api/customers/people/{id}/email-share | customers_get_api_customers_people_id_email_share | 200,400,401,403,404 |
| PUT | /api/customers/people/{id}/email-share | customers_put_api_customers_people_id_email_share | 200,400,401,403,404,409,422 |
| GET | /api/customers/people/{id}/email-threads | customers_get_api_customers_people_id_email_threads | 200,400,401,403,404 |
| POST | /api/customers/people/{id}/emails | customers_post_api_customers_people_id_emails | 200,400,401,403,404,409,422,500 |
| GET | /api/customers/people/{id}/roles | customers_get_api_customers_people_id_roles | 200,400,401,403 |
| POST | /api/customers/people/{id}/roles | customers_post_api_customers_people_id_roles | 201,400,401,403,409 |
| PUT | /api/customers/people/{id}/roles | customers_put_api_customers_people_id_roles | 200,400,401,403,404 |
| DELETE | /api/customers/people/{id}/roles | customers_delete_api_customers_people_id_roles | 200,400,401,403,404 |
| GET | /api/customers/people/{id} | customers_get_api_customers_people_id | 200,400,401,403,404 |
| GET | /api/customers/people/check-phone | customers_get_api_customers_people_check_phone | 200,401,403 |
| GET | /api/customers/people | customers_get_api_customers_people | 200,401,403 |
| POST | /api/customers/people | customers_post_api_customers_people | 201,401,403 |
| PUT | /api/customers/people | customers_put_api_customers_people | 200,401,403 |
| DELETE | /api/customers/people | customers_delete_api_customers_people | 200,401,403,422 |
| POST | /api/customers/pipeline-stages/reorder | customers_post_api_customers_pipeline_stages_reorder | 200,400,401,403 |
| GET | /api/customers/pipeline-stages | customers_get_api_customers_pipeline_stages | 200,400,401,403 |
| POST | /api/customers/pipeline-stages | customers_post_api_customers_pipeline_stages | 201,400,401,403 |
| PUT | /api/customers/pipeline-stages | customers_put_api_customers_pipeline_stages | 200,400,401,403,404 |
| DELETE | /api/customers/pipeline-stages | customers_delete_api_customers_pipeline_stages | 200,401,403,404,409 |
| GET | /api/customers/pipelines | customers_get_api_customers_pipelines | 200,400,401,403 |
| POST | /api/customers/pipelines | customers_post_api_customers_pipelines | 201,400,401,403 |
| PUT | /api/customers/pipelines | customers_put_api_customers_pipelines | 200,400,401,403,404 |
| DELETE | /api/customers/pipelines | customers_delete_api_customers_pipelines | 200,401,403,404,409 |
| GET | /api/customers/settings/address-format | customers_get_api_customers_settings_address_format | 200,400,401,403 |
| PUT | /api/customers/settings/address-format | customers_put_api_customers_settings_address_format | 200,400,401,403 |
| GET | /api/customers/settings/dictionary-sort-modes | customers_get_api_customers_settings_dictionary_sort_modes | 200,400,401,403 |
| PATCH | /api/customers/settings/dictionary-sort-modes | customers_patch_api_customers_settings_dictionary_sort_modes | 200,400,401,403 |
| GET | /api/customers/settings/stuck-threshold | customers_get_api_customers_settings_stuck_threshold | 200,400,401,403 |
| PUT | /api/customers/settings/stuck-threshold | customers_put_api_customers_settings_stuck_threshold | 200,400,401,403 |
| POST | /api/customers/tags/assign | customers_post_api_customers_tags_assign | 201,400,401,403 |
| GET | /api/customers/tags | customers_get_api_customers_tags | 200,401,403 |
| POST | /api/customers/tags | customers_post_api_customers_tags | 201,401,403 |
| PUT | /api/customers/tags | customers_put_api_customers_tags | 200,401,403 |
| DELETE | /api/customers/tags | customers_delete_api_customers_tags | 200,401,403 |
| POST | /api/customers/tags/unassign | customers_post_api_customers_tags_unassign | 200,400,401,403 |
| GET | /api/customers/todos | customers_get_api_customers_todos | 200,401,403 |
| POST | /api/customers/todos | customers_post_api_customers_todos | 201,401,403 |
| PUT | /api/customers/todos | customers_put_api_customers_todos | 200,401,403 |
| DELETE | /api/customers/todos | customers_delete_api_customers_todos | 200,401,403 |
| DELETE | /api/perspectives/{tableId}/{perspectiveId} | perspectives_delete_api_perspectives_tableId_perspectiveId | 200,400,401,403,404,409 |
| DELETE | /api/perspectives/{tableId}/roles/{roleId} | perspectives_delete_api_perspectives_tableId_roles_roleId | 200,400,401,403,404,409 |
| GET | /api/perspectives/{tableId} | perspectives_get_api_perspectives_tableId | 200,400,401,403 |
| POST | /api/perspectives/{tableId} | perspectives_post_api_perspectives_tableId | 200,400,401,403,409 |
| GET | /api/configs/cache | configs_get_api_configs_cache | 200,401,403,500,503 |
| POST | /api/configs/cache | configs_post_api_configs_cache | 200,400,401,403,500,503 |
| GET | /api/configs/module-telemetry | configs_get_api_configs_module_telemetry | 200,401,403 |
| DELETE | /api/configs/module-telemetry | configs_delete_api_configs_module_telemetry | 200,401,403 |
| GET | /api/configs/system-status | configs_get_api_configs_system_status | 200,401,403,500 |
| POST | /api/configs/system-status | configs_post_api_configs_system_status | 200,401,403,500,503 |
| GET | /api/configs/upgrade-actions | configs_get_api_configs_upgrade_actions | 200,400,401,403,500 |
| POST | /api/configs/upgrade-actions | configs_post_api_configs_upgrade_actions | 200,400,401,403,500 |
| GET | /api/audit_logs/audit-logs/access | audit_logs_get_api_audit_logs_audit_logs_access | 200,400,401,403 |
| GET | /api/audit_logs/audit-logs/actions/export | audit_logs_get_api_audit_logs_audit_logs_actions_export | 200,400,401,403 |
| POST | /api/audit_logs/audit-logs/actions/redo | audit_logs_post_api_audit_logs_audit_logs_actions_redo | 200,400,401,403 |
| GET | /api/audit_logs/audit-logs/actions | audit_logs_get_api_audit_logs_audit_logs_actions | 200,400,401,403 |
| POST | /api/audit_logs/audit-logs/actions/undo | audit_logs_post_api_audit_logs_audit_logs_actions_undo | 200,400,401,403,422 |
| GET | /api/attachments/file/{id} | attachments_get_api_attachments_file_id | 200,400,401,403,404,500 |
| GET | /api/attachments/image/{id}/{slug} | attachments_get_api_attachments_image_id_slug | 200,400,401,403,404,500 |
| GET | /api/attachments/library/{id} | attachments_get_api_attachments_library_id | 200,400,401,403,404 |
| PATCH | /api/attachments/library/{id} | attachments_patch_api_attachments_library_id | 200,400,401,403,404,500 |
| DELETE | /api/attachments/library/{id} | attachments_delete_api_attachments_library_id | 200,400,401,403,404 |
| GET | /api/attachments/library | attachments_get_api_attachments_library | 200,400,401,403 |
| GET | /api/attachments/partitions | attachments_get_api_attachments_partitions | 200,401,403 |
| POST | /api/attachments/partitions | attachments_post_api_attachments_partitions | 201,400,401,403,409 |
| PUT | /api/attachments/partitions | attachments_put_api_attachments_partitions | 200,400,401,403,404 |
| DELETE | /api/attachments/partitions | attachments_delete_api_attachments_partitions | 200,400,401,403,404,409 |
| GET | /api/attachments | attachments_get_api_attachments | 200,400,401,403 |
| POST | /api/attachments | attachments_post_api_attachments | 200,400,401,403 |
| DELETE | /api/attachments | attachments_delete_api_attachments | 200,400,401,403,404 |
| POST | /api/attachments/transfer | attachments_post_api_attachments_transfer | 200,400,401,403,404,500 |
| POST | /api/catalog/bulk-delete | catalog_post_api_catalog_bulk_delete | 201,401,403 |
| POST | /api/catalog/categories/bulk-create | catalog_post_api_catalog_categories_bulk_create | 201,401,403 |
| GET | /api/catalog/categories | catalog_get_api_catalog_categories | 200,401,403 |
| POST | /api/catalog/categories | catalog_post_api_catalog_categories | 201,401,403 |
| PUT | /api/catalog/categories | catalog_put_api_catalog_categories | 200,401,403 |
| DELETE | /api/catalog/categories | catalog_delete_api_catalog_categories | 200,401,403 |
| GET | /api/catalog/dictionaries/{key} | catalog_get_api_catalog_dictionaries_key | 200,401,403 |
| GET | /api/catalog/offers | catalog_get_api_catalog_offers | 200,401,403 |
| POST | /api/catalog/offers | catalog_post_api_catalog_offers | 201,401,403 |
| PUT | /api/catalog/offers | catalog_put_api_catalog_offers | 200,401,403 |
| DELETE | /api/catalog/offers | catalog_delete_api_catalog_offers | 200,401,403 |
| GET | /api/catalog/option-schemas | catalog_get_api_catalog_option_schemas | 200,401,403 |
| POST | /api/catalog/option-schemas | catalog_post_api_catalog_option_schemas | 201,401,403 |
| PUT | /api/catalog/option-schemas | catalog_put_api_catalog_option_schemas | 200,401,403 |
| DELETE | /api/catalog/option-schemas | catalog_delete_api_catalog_option_schemas | 200,401,403 |
| GET | /api/catalog/price-kinds | catalog_get_api_catalog_price_kinds | 200,401,403 |
| POST | /api/catalog/price-kinds | catalog_post_api_catalog_price_kinds | 201,401,403 |
| PUT | /api/catalog/price-kinds | catalog_put_api_catalog_price_kinds | 200,401,403 |
| DELETE | /api/catalog/price-kinds | catalog_delete_api_catalog_price_kinds | 200,401,403 |
| GET | /api/catalog/prices | catalog_get_api_catalog_prices | 200,401,403 |
| POST | /api/catalog/prices | catalog_post_api_catalog_prices | 201,401,403 |
| PUT | /api/catalog/prices | catalog_put_api_catalog_prices | 200,401,403 |
| DELETE | /api/catalog/prices | catalog_delete_api_catalog_prices | 200,401,403 |
| GET | /api/catalog/product-media | catalog_get_api_catalog_product_media | 200,401,403 |
| GET | /api/catalog/product-unit-conversions | catalog_get_api_catalog_product_unit_conversions | 200,401,403 |
| POST | /api/catalog/product-unit-conversions | catalog_post_api_catalog_product_unit_conversions | 201,401,403 |
| PUT | /api/catalog/product-unit-conversions | catalog_put_api_catalog_product_unit_conversions | 200,401,403 |
| DELETE | /api/catalog/product-unit-conversions | catalog_delete_api_catalog_product_unit_conversions | 200,401,403 |
| POST | /api/catalog/products/bulk-create | catalog_post_api_catalog_products_bulk_create | 201,401,403 |
| GET | /api/catalog/products | catalog_get_api_catalog_products | 200,401,403 |
| POST | /api/catalog/products | catalog_post_api_catalog_products | 201,401,403 |
| PUT | /api/catalog/products | catalog_put_api_catalog_products | 200,401,403 |
| DELETE | /api/catalog/products | catalog_delete_api_catalog_products | 200,401,403 |
| GET | /api/catalog/settings | catalog_get_api_catalog_settings | 200,401,403 |
| PUT | /api/catalog/settings | catalog_put_api_catalog_settings | 200,400,401,403 |
| GET | /api/catalog/tags | catalog_get_api_catalog_tags | 200,401,403 |
| GET | /api/catalog/variants | catalog_get_api_catalog_variants | 200,401,403 |
| POST | /api/catalog/variants | catalog_post_api_catalog_variants | 201,401,403 |
| PUT | /api/catalog/variants | catalog_put_api_catalog_variants | 200,401,403 |
| DELETE | /api/catalog/variants | catalog_delete_api_catalog_variants | 200,401,403 |
| GET | /api/sales/adjustment-kinds | sales_get_api_sales_adjustment_kinds | 200,401,403 |
| POST | /api/sales/adjustment-kinds | sales_post_api_sales_adjustment_kinds | 201,401,403 |
| PUT | /api/sales/adjustment-kinds | sales_put_api_sales_adjustment_kinds | 200,401,403 |
| DELETE | /api/sales/adjustment-kinds | sales_delete_api_sales_adjustment_kinds | 200,401,403 |
| GET | /api/sales/channels | sales_get_api_sales_channels | 200,401,403 |
| POST | /api/sales/channels | sales_post_api_sales_channels | 201,401,403 |
| PUT | /api/sales/channels | sales_put_api_sales_channels | 200,401,403 |
| DELETE | /api/sales/channels | sales_delete_api_sales_channels | 200,401,403 |
| GET | /api/sales/credit-memos | sales_get_api_sales_credit_memos | 200,401,403 |
| POST | /api/sales/credit-memos | sales_post_api_sales_credit_memos | 201,401,403 |
| PUT | /api/sales/credit-memos | sales_put_api_sales_credit_memos | 200,401,403 |
| DELETE | /api/sales/credit-memos | sales_delete_api_sales_credit_memos | 200,401,403 |
| GET | /api/sales/dashboard/widgets/new-orders | sales_get_api_sales_dashboard_widgets_new_orders | 200,400,401,403,500 |
| GET | /api/sales/dashboard/widgets/new-quotes | sales_get_api_sales_dashboard_widgets_new_quotes | 200,400,401,403,500 |
| GET | /api/sales/delivery-windows | sales_get_api_sales_delivery_windows | 200,401,403 |
| POST | /api/sales/delivery-windows | sales_post_api_sales_delivery_windows | 201,401,403 |
| PUT | /api/sales/delivery-windows | sales_put_api_sales_delivery_windows | 200,401,403 |
| DELETE | /api/sales/delivery-windows | sales_delete_api_sales_delivery_windows | 200,401,403 |
| GET | /api/sales/document-addresses | sales_get_api_sales_document_addresses | 200,401 |
| POST | /api/sales/document-addresses | sales_post_api_sales_document_addresses | 201,401 |
| PUT | /api/sales/document-addresses | sales_put_api_sales_document_addresses | 200,401 |
| DELETE | /api/sales/document-addresses | sales_delete_api_sales_document_addresses | 200,401 |
| GET | /api/sales/document-history | sales_get_api_sales_document_history | 200,400,401,403,404 |
| POST | /api/sales/document-numbers | sales_post_api_sales_document_numbers | 200,400,401 |
| GET | /api/sales/invoices | sales_get_api_sales_invoices | 200,401,403 |
| POST | /api/sales/invoices | sales_post_api_sales_invoices | 201,401,403 |
| PUT | /api/sales/invoices | sales_put_api_sales_invoices | 200,401,403 |
| DELETE | /api/sales/invoices | sales_delete_api_sales_invoices | 200,401,403 |
| GET | /api/sales/notes | sales_get_api_sales_notes | 200,401 |
| POST | /api/sales/notes | sales_post_api_sales_notes | 201,401 |
| PUT | /api/sales/notes | sales_put_api_sales_notes | 200,401 |
| DELETE | /api/sales/notes | sales_delete_api_sales_notes | 200,401 |
| GET | /api/sales/order-adjustments | sales_get_api_sales_order_adjustments | 200,401,403 |
| POST | /api/sales/order-adjustments | sales_post_api_sales_order_adjustments | 201,401,403 |
| PUT | /api/sales/order-adjustments | sales_put_api_sales_order_adjustments | 200,401,403 |
| DELETE | /api/sales/order-adjustments | sales_delete_api_sales_order_adjustments | 200,401,403 |
| GET | /api/sales/order-line-statuses | sales_get_api_sales_order_line_statuses | 200,401,403 |
| POST | /api/sales/order-line-statuses | sales_post_api_sales_order_line_statuses | 201,401,403 |
| PUT | /api/sales/order-line-statuses | sales_put_api_sales_order_line_statuses | 200,401,403 |
| DELETE | /api/sales/order-line-statuses | sales_delete_api_sales_order_line_statuses | 200,401,403 |
| GET | /api/sales/order-lines | sales_get_api_sales_order_lines | 200,401,403 |
| POST | /api/sales/order-lines | sales_post_api_sales_order_lines | 201,401,403 |
| PUT | /api/sales/order-lines | sales_put_api_sales_order_lines | 200,401,403 |
| DELETE | /api/sales/order-lines | sales_delete_api_sales_order_lines | 200,401,403 |
| GET | /api/sales/order-statuses | sales_get_api_sales_order_statuses | 200,401,403 |
| POST | /api/sales/order-statuses | sales_post_api_sales_order_statuses | 201,401,403 |
| PUT | /api/sales/order-statuses | sales_put_api_sales_order_statuses | 200,401,403 |
| DELETE | /api/sales/order-statuses | sales_delete_api_sales_order_statuses | 200,401,403 |
| GET | /api/sales/orders | sales_get_api_sales_orders | 200,401,403 |
| POST | /api/sales/orders | sales_post_api_sales_orders | 201,401,403 |
| PUT | /api/sales/orders | sales_put_api_sales_orders | 200,401,403 |
| DELETE | /api/sales/orders | sales_delete_api_sales_orders | 200,401,403 |
| GET | /api/sales/payment-methods | sales_get_api_sales_payment_methods | 200,401,403 |
| POST | /api/sales/payment-methods | sales_post_api_sales_payment_methods | 201,401,403 |
| PUT | /api/sales/payment-methods | sales_put_api_sales_payment_methods | 200,401,403 |
| DELETE | /api/sales/payment-methods | sales_delete_api_sales_payment_methods | 200,401,403 |
| GET | /api/sales/payment-statuses | sales_get_api_sales_payment_statuses | 200,401,403 |
| POST | /api/sales/payment-statuses | sales_post_api_sales_payment_statuses | 201,401,403 |
| PUT | /api/sales/payment-statuses | sales_put_api_sales_payment_statuses | 200,401,403 |
| DELETE | /api/sales/payment-statuses | sales_delete_api_sales_payment_statuses | 200,401,403 |
| GET | /api/sales/payments | sales_get_api_sales_payments | 200,401,403 |
| POST | /api/sales/payments | sales_post_api_sales_payments | 201,401,403 |
| PUT | /api/sales/payments | sales_put_api_sales_payments | 200,401,403 |
| DELETE | /api/sales/payments | sales_delete_api_sales_payments | 200,401,403 |
| GET | /api/sales/price-kinds | sales_get_api_sales_price_kinds | 200,401,403 |
| GET | /api/sales/quote-adjustments | sales_get_api_sales_quote_adjustments | 200,401,403 |
| POST | /api/sales/quote-adjustments | sales_post_api_sales_quote_adjustments | 201,401,403 |
| PUT | /api/sales/quote-adjustments | sales_put_api_sales_quote_adjustments | 200,401,403 |
| DELETE | /api/sales/quote-adjustments | sales_delete_api_sales_quote_adjustments | 200,401,403 |
| GET | /api/sales/quote-lines | sales_get_api_sales_quote_lines | 200,401,403 |
| POST | /api/sales/quote-lines | sales_post_api_sales_quote_lines | 201,401,403 |
| PUT | /api/sales/quote-lines | sales_put_api_sales_quote_lines | 200,401,403 |
| DELETE | /api/sales/quote-lines | sales_delete_api_sales_quote_lines | 200,401,403 |
| POST | /api/sales/quotes/accept | sales_post_api_sales_quotes_accept | 200,400,403,404,429 |
| POST | /api/sales/quotes/convert | sales_post_api_sales_quotes_convert | 200,400,401,403,409,423 |
| GET | /api/sales/quotes/public/{token} | sales_get_api_sales_quotes_public_token | 200,404 |
| GET | /api/sales/quotes | sales_get_api_sales_quotes | 200,401,403 |
| POST | /api/sales/quotes | sales_post_api_sales_quotes | 201,401,403 |
| PUT | /api/sales/quotes | sales_put_api_sales_quotes | 200,401,403 |
| DELETE | /api/sales/quotes | sales_delete_api_sales_quotes | 200,401,403 |
| POST | /api/sales/quotes/send | sales_post_api_sales_quotes_send | 200,400,401,403,404,409,423 |
| GET | /api/sales/returns/{id} | sales_get_api_sales_returns_id | 200,401,403,404 |
| GET | /api/sales/returns | sales_get_api_sales_returns | 200,401,403 |
| POST | /api/sales/returns | sales_post_api_sales_returns | 201,401,403 |
| PUT | /api/sales/returns | sales_put_api_sales_returns | 200,401,403 |
| DELETE | /api/sales/returns | sales_delete_api_sales_returns | 200,401,403 |
| GET | /api/sales/settings/document-numbers | sales_get_api_sales_settings_document_numbers | 200,400,401,403 |
| PUT | /api/sales/settings/document-numbers | sales_put_api_sales_settings_document_numbers | 200,400,401,403 |
| GET | /api/sales/settings/order-editing | sales_get_api_sales_settings_order_editing | 200,400,401,403 |
| PUT | /api/sales/settings/order-editing | sales_put_api_sales_settings_order_editing | 200,400,401,403 |
| GET | /api/sales/shipment-statuses | sales_get_api_sales_shipment_statuses | 200,401,403 |
| POST | /api/sales/shipment-statuses | sales_post_api_sales_shipment_statuses | 201,401,403 |
| PUT | /api/sales/shipment-statuses | sales_put_api_sales_shipment_statuses | 200,401,403 |
| DELETE | /api/sales/shipment-statuses | sales_delete_api_sales_shipment_statuses | 200,401,403 |
| GET | /api/sales/shipments | sales_get_api_sales_shipments | 200,401,403 |
| POST | /api/sales/shipments | sales_post_api_sales_shipments | 201,401,403 |
| PUT | /api/sales/shipments | sales_put_api_sales_shipments | 200,401,403 |
| DELETE | /api/sales/shipments | sales_delete_api_sales_shipments | 200,401,403 |
| GET | /api/sales/shipping-methods | sales_get_api_sales_shipping_methods | 200,401,403 |
| POST | /api/sales/shipping-methods | sales_post_api_sales_shipping_methods | 201,401,403 |
| PUT | /api/sales/shipping-methods | sales_put_api_sales_shipping_methods | 200,401,403 |
| DELETE | /api/sales/shipping-methods | sales_delete_api_sales_shipping_methods | 200,401,403 |
| GET | /api/sales/tags | sales_get_api_sales_tags | 200,401,403 |
| POST | /api/sales/tags | sales_post_api_sales_tags | 201,401,403 |
| PUT | /api/sales/tags | sales_put_api_sales_tags | 200,401,403 |
| DELETE | /api/sales/tags | sales_delete_api_sales_tags | 200,401,403 |
| GET | /api/sales/tax-rates | sales_get_api_sales_tax_rates | 200,401,403 |
| POST | /api/sales/tax-rates | sales_post_api_sales_tax_rates | 201,401,403 |
| PUT | /api/sales/tax-rates | sales_put_api_sales_tax_rates | 200,401,403 |
| DELETE | /api/sales/tax-rates | sales_delete_api_sales_tax_rates | 200,401,403 |
| POST | /api/warranty_claims/ai/assess | warranty_claims_post_api_warranty_claims_ai_assess | 200,401,403 |
| POST | /api/warranty_claims/ai/draft-reply | warranty_claims_post_api_warranty_claims_ai_draft_reply | 200,401,403,422 |
| GET | /api/warranty_claims/ai/suggest | warranty_claims_get_api_warranty_claims_ai_suggest | 200,401,403 |
| POST | /api/warranty_claims/ai/suggest | warranty_claims_post_api_warranty_claims_ai_suggest | 200,401,403 |
| POST | /api/warranty_claims/assign | warranty_claims_post_api_warranty_claims_assign | 200,401,403 |
| GET | /api/warranty_claims/assignees | warranty_claims_get_api_warranty_claims_assignees | 200,401,403 |
| POST | /api/warranty_claims/credit-memo | warranty_claims_post_api_warranty_claims_credit_memo | 200,400,401,403,409 |
| GET | /api/warranty_claims/entitlement | warranty_claims_get_api_warranty_claims_entitlement | 200,401,403 |
| GET | /api/warranty_claims/events | warranty_claims_get_api_warranty_claims_events | 200,401,403 |
| POST | /api/warranty_claims/events | warranty_claims_post_api_warranty_claims_events | 200,401,403 |
| GET | /api/warranty_claims/external/claims | warranty_claims_get_api_warranty_claims_external_claims | 200,401,403 |
| POST | /api/warranty_claims/external/claims | warranty_claims_post_api_warranty_claims_external_claims | 200,201,401,403 |
| GET | /api/warranty_claims/lines | warranty_claims_get_api_warranty_claims_lines | 200,401,403 |
| POST | /api/warranty_claims/lines | warranty_claims_post_api_warranty_claims_lines | 201,401,403 |
| PUT | /api/warranty_claims/lines | warranty_claims_put_api_warranty_claims_lines | 200,401,403 |
| DELETE | /api/warranty_claims/lines | warranty_claims_delete_api_warranty_claims_lines | 200,401,403 |
| GET | /api/warranty_claims/portal/attachments | warranty_claims_get_api_warranty_claims_portal_attachments | 200 |
| POST | /api/warranty_claims/portal/attachments | warranty_claims_post_api_warranty_claims_portal_attachments | 200 |
| PUT | /api/warranty_claims/portal/attachments | warranty_claims_put_api_warranty_claims_portal_attachments | 200 |
| DELETE | /api/warranty_claims/portal/attachments | warranty_claims_delete_api_warranty_claims_portal_attachments | 200 |
| GET | /api/warranty_claims/portal/claims/{id} | warranty_claims_get_api_warranty_claims_portal_claims_id | 200 |
| POST | /api/warranty_claims/portal/claims/{id}/submit | warranty_claims_post_api_warranty_claims_portal_claims_id_submit | 200 |
| POST | /api/warranty_claims/portal/claims/{id}/withdraw | warranty_claims_post_api_warranty_claims_portal_claims_id_withdraw | 200 |
| GET | /api/warranty_claims/portal/claims | warranty_claims_get_api_warranty_claims_portal_claims | 200 |
| POST | /api/warranty_claims/portal/claims | warranty_claims_post_api_warranty_claims_portal_claims | 201 |
| GET | /api/warranty_claims/portal/events | warranty_claims_get_api_warranty_claims_portal_events | 200 |
| POST | /api/warranty_claims/portal/events | warranty_claims_post_api_warranty_claims_portal_events | 200 |
| GET | /api/warranty_claims/portal/options | warranty_claims_get_api_warranty_claims_portal_options | 200 |
| GET | /api/warranty_claims/portal/orders/lines | warranty_claims_get_api_warranty_claims_portal_orders_lines | 200 |
| GET | /api/warranty_claims/portal/orders | warranty_claims_get_api_warranty_claims_portal_orders | 200 |
| GET | /api/warranty_claims/portal/troubleshooting | warranty_claims_get_api_warranty_claims_portal_troubleshooting | 200 |
| POST | /api/warranty_claims/receiving | warranty_claims_post_api_warranty_claims_receiving | 200,401,403 |
| GET | /api/warranty_claims/registrations | warranty_claims_get_api_warranty_claims_registrations | 200,401,403 |
| POST | /api/warranty_claims/registrations | warranty_claims_post_api_warranty_claims_registrations | 201,401,403 |
| PUT | /api/warranty_claims/registrations | warranty_claims_put_api_warranty_claims_registrations | 200,401,403 |
| DELETE | /api/warranty_claims/registrations | warranty_claims_delete_api_warranty_claims_registrations | 200,401,403 |
| POST | /api/warranty_claims/replacement-order | warranty_claims_post_api_warranty_claims_replacement_order | 200,400,401,403,409 |
| POST | /api/warranty_claims/return-label | warranty_claims_post_api_warranty_claims_return_label | 200,401,403 |
| GET | /api/warranty_claims/risk | warranty_claims_get_api_warranty_claims_risk | 200,401,403 |
| GET | /api/warranty_claims | warranty_claims_get_api_warranty_claims | 200,401,403 |
| POST | /api/warranty_claims | warranty_claims_post_api_warranty_claims | 201,401,403 |
| PUT | /api/warranty_claims | warranty_claims_put_api_warranty_claims | 200,401,403 |
| DELETE | /api/warranty_claims | warranty_claims_delete_api_warranty_claims | 200,401,403 |
| POST | /api/warranty_claims/sales-return | warranty_claims_post_api_warranty_claims_sales_return | 200,400,401,403,409 |
| GET | /api/warranty_claims/settings-general | warranty_claims_get_api_warranty_claims_settings_general | 200,400,401,403 |
| PUT | /api/warranty_claims/settings-general | warranty_claims_put_api_warranty_claims_settings_general | 200,400,401,403,409 |
| GET | /api/warranty_claims/stats | warranty_claims_get_api_warranty_claims_stats | 200,401,403 |
| POST | /api/warranty_claims/submit | warranty_claims_post_api_warranty_claims_submit | 200,401,403 |
| POST | /api/warranty_claims/transition | warranty_claims_post_api_warranty_claims_transition | 200,401,403 |
| GET | /api/warranty_claims/troubleshooting-guides | warranty_claims_get_api_warranty_claims_troubleshooting_guides | 200,401,403 |
| POST | /api/warranty_claims/troubleshooting-guides | warranty_claims_post_api_warranty_claims_troubleshooting_guides | 201,401,403 |
| PUT | /api/warranty_claims/troubleshooting-guides | warranty_claims_put_api_warranty_claims_troubleshooting_guides | 200,401,403 |
| DELETE | /api/warranty_claims/troubleshooting-guides | warranty_claims_delete_api_warranty_claims_troubleshooting_guides | 200,401,403 |
| GET | /api/warranty_claims/vendor-policies | warranty_claims_get_api_warranty_claims_vendor_policies | 200,401,403 |
| POST | /api/warranty_claims/vendor-policies | warranty_claims_post_api_warranty_claims_vendor_policies | 201,401,403 |
| PUT | /api/warranty_claims/vendor-policies | warranty_claims_put_api_warranty_claims_vendor_policies | 200,401,403 |
| DELETE | /api/warranty_claims/vendor-policies | warranty_claims_delete_api_warranty_claims_vendor_policies | 200,401,403 |
| POST | /api/warranty_claims/vendor-recovery | warranty_claims_post_api_warranty_claims_vendor_recovery | 200,401,403 |
| GET | /api/warranty_claims/vendor-recovery-suggestions | warranty_claims_get_api_warranty_claims_vendor_recovery_suggestions | 200,401,403 |
| GET | /api/wms/dashboard/operational | wms_get_api_wms_dashboard_operational | 200,401,403,404 |
| POST | /api/wms/inventory/adjust | wms_post_api_wms_inventory_adjust | 200,400,401,403,409,422 |
| POST | /api/wms/inventory/allocate | wms_post_api_wms_inventory_allocate | 200,400,401,403,404,409 |
| GET | /api/wms/inventory/balances | wms_get_api_wms_inventory_balances | 200,401,403 |
| POST | /api/wms/inventory/cycle-count | wms_post_api_wms_inventory_cycle_count | 200,400,401,403,409,422 |
| POST | /api/wms/inventory/import/apply | wms_post_api_wms_inventory_import_apply | 200,400,401,403,409 |
| GET | /api/wms/inventory/import/template | wms_get_api_wms_inventory_import_template | 200,401,403 |
| POST | /api/wms/inventory/import/validate | wms_post_api_wms_inventory_import_validate | 200,400,401,403 |
| POST | /api/wms/inventory/move | wms_post_api_wms_inventory_move | 200,400,401,403,409,422 |
| GET | /api/wms/inventory/movements | wms_get_api_wms_inventory_movements | 200,401,403 |
| POST | /api/wms/inventory/receive | wms_post_api_wms_inventory_receive | 200,400,401,403,422 |
| POST | /api/wms/inventory/release | wms_post_api_wms_inventory_release | 200,400,401,403,404 |
| GET | /api/wms/inventory/reservations | wms_get_api_wms_inventory_reservations | 200,401,403 |
| POST | /api/wms/inventory/reserve | wms_post_api_wms_inventory_reserve | 200,400,401,403,409,422 |
| GET | /api/wms/inventory-profiles | wms_get_api_wms_inventory_profiles | 200,401,403 |
| POST | /api/wms/inventory-profiles | wms_post_api_wms_inventory_profiles | 201,401,403 |
| PUT | /api/wms/inventory-profiles | wms_put_api_wms_inventory_profiles | 200,401,403 |
| DELETE | /api/wms/inventory-profiles | wms_delete_api_wms_inventory_profiles | 200,401,403 |
| GET | /api/wms/locations | wms_get_api_wms_locations | 200,401,403 |
| POST | /api/wms/locations | wms_post_api_wms_locations | 201,401,403 |
| PUT | /api/wms/locations | wms_put_api_wms_locations | 200,401,403 |
| DELETE | /api/wms/locations | wms_delete_api_wms_locations | 200,401,403 |
| GET | /api/wms/lots | wms_get_api_wms_lots | 200,401,403 |
| POST | /api/wms/lots | wms_post_api_wms_lots | 201,401,403 |
| PUT | /api/wms/lots | wms_put_api_wms_lots | 200,401,403 |
| DELETE | /api/wms/lots | wms_delete_api_wms_lots | 200,401,403 |
| POST | /api/wms/sales-orders/{salesOrderId}/re-run-reservation | wms_post_api_wms_sales_orders_salesOrderId_re_run_reservation | 200,400,401,403,404 |
| GET | /api/wms/sales-orders/{salesOrderId}/warehouse-assignment | wms_get_api_wms_sales_orders_salesOrderId_warehouse_assignment | 200,400,401,403 |
| PUT | /api/wms/sales-orders/{salesOrderId}/warehouse-assignment | wms_put_api_wms_sales_orders_salesOrderId_warehouse_assignment | 200,201,400,401,403,404,422 |
| PATCH | /api/wms/sales-orders/{salesOrderId}/warehouse-assignment | wms_patch_api_wms_sales_orders_salesOrderId_warehouse_assignment | 200,400,401,403 |
| DELETE | /api/wms/sales-orders/{salesOrderId}/warehouse-assignment | wms_delete_api_wms_sales_orders_salesOrderId_warehouse_assignment | 200,401,403 |
| POST | /api/wms/sales-orders/assign-warehouse | wms_post_api_wms_sales_orders_assign_warehouse | 200,201,400,401,403,404,422 |
| POST | /api/wms/sales-orders/unassign-warehouse | wms_post_api_wms_sales_orders_unassign_warehouse | 200,400,401,403 |
| GET | /api/wms/warehouses | wms_get_api_wms_warehouses | 200,401,403 |
| POST | /api/wms/warehouses | wms_post_api_wms_warehouses | 201,401,403 |
| PUT | /api/wms/warehouses | wms_put_api_wms_warehouses | 200,401,403 |
| DELETE | /api/wms/warehouses | wms_delete_api_wms_warehouses | 200,401,403 |
| GET | /api/wms/zones | wms_get_api_wms_zones | 200,401,403 |
| POST | /api/wms/zones | wms_post_api_wms_zones | 201,401,403 |
| PUT | /api/wms/zones | wms_put_api_wms_zones | 200,401,403 |
| DELETE | /api/wms/zones | wms_delete_api_wms_zones | 200,401,403 |
| GET | /api/api_keys/keys | api_keys_get_api_api_keys_keys | 200,400,401,403 |
| POST | /api/api_keys/keys | api_keys_post_api_api_keys_keys | 201,400,401,403 |
| DELETE | /api/api_keys/keys | api_keys_delete_api_api_keys_keys | 200,400,401,403,404 |
| PUT | /api/devices/{id} | devices_put_api_devices_id | 200,400,401,403,404 |
| DELETE | /api/devices/{id} | devices_delete_api_devices_id | 200,400,401,403,404 |
| GET | /api/devices/admin/devices/{id} | devices_get_api_devices_admin_devices_id | 200,400,401,403,404 |
| PUT | /api/devices/admin/devices/{id} | devices_put_api_devices_admin_devices_id | 200,400,401,403,404 |
| DELETE | /api/devices/admin/devices/{id} | devices_delete_api_devices_admin_devices_id | 200,400,401,403,404 |
| GET | /api/devices/admin/devices | devices_get_api_devices_admin_devices | 200,401,403 |
| POST | /api/devices/admin/devices | devices_post_api_devices_admin_devices | 201,401,403 |
| GET | /api/devices | devices_get_api_devices | 200,401,403 |
| POST | /api/devices | devices_post_api_devices | 201,401,403 |
| PATCH | /api/dictionaries/{dictionaryId}/entries/{entryId} | dictionaries_patch_api_dictionaries_dictionaryId_entries_entryId | 200,400,401,403,404,500 |
| DELETE | /api/dictionaries/{dictionaryId}/entries/{entryId} | dictionaries_delete_api_dictionaries_dictionaryId_entries_entryId | 200,400,401,403,404,500 |
| POST | /api/dictionaries/{dictionaryId}/entries/reorder | dictionaries_post_api_dictionaries_dictionaryId_entries_reorder | 200,400,401,403,404,500 |
| GET | /api/dictionaries/{dictionaryId}/entries | dictionaries_get_api_dictionaries_dictionaryId_entries | 200,400,401,403,404,500 |
| POST | /api/dictionaries/{dictionaryId}/entries | dictionaries_post_api_dictionaries_dictionaryId_entries | 201,400,401,403,404,500 |
| POST | /api/dictionaries/{dictionaryId}/entries/set-default | dictionaries_post_api_dictionaries_dictionaryId_entries_set_default | 200,400,401,403,404,500 |
| GET | /api/dictionaries/{dictionaryId} | dictionaries_get_api_dictionaries_dictionaryId | 200,400,401,403,404,500 |
| PATCH | /api/dictionaries/{dictionaryId} | dictionaries_patch_api_dictionaries_dictionaryId | 200,400,401,403,404,409,500 |
| DELETE | /api/dictionaries/{dictionaryId} | dictionaries_delete_api_dictionaries_dictionaryId | 200,400,401,403,404,500 |
| GET | /api/dictionaries | dictionaries_get_api_dictionaries | 200,401,403,500 |
| POST | /api/dictionaries | dictionaries_post_api_dictionaries | 201,400,401,403,409,500 |
| POST | /api/onboarding/demo-feedback | onboarding_post_api_onboarding_demo_feedback | 200 |
| POST | /api/business_rules/execute/{ruleId} | business_rules_post_api_business_rules_execute_ruleId | 200,400,401,403,404,500 |
| POST | /api/business_rules/execute | business_rules_post_api_business_rules_execute | 200,400,401,403,500 |
| GET | /api/business_rules/logs/{id} | business_rules_get_api_business_rules_logs_id | 200,400,401,403,404 |
| GET | /api/business_rules/logs | business_rules_get_api_business_rules_logs | 200,400,401,403 |
| GET | /api/business_rules/openmercato-call-options | business_rules_get_api_business_rules_openmercato_call_options | 200,400,401,403 |
| GET | /api/business_rules/rules/{id} | business_rules_get_api_business_rules_rules_id | 200,400,401,403,404 |
| GET | /api/business_rules/rules | business_rules_get_api_business_rules_rules | 200,400,401,403 |
| POST | /api/business_rules/rules | business_rules_post_api_business_rules_rules | 201,400,401,403 |
| PUT | /api/business_rules/rules | business_rules_put_api_business_rules_rules | 200,400,401,403,404 |
| DELETE | /api/business_rules/rules | business_rules_delete_api_business_rules_rules | 200,400,401,403,404 |
| POST | /api/business_rules/sets/{id}/members | business_rules_post_api_business_rules_sets_id_members | 201,400,401,403,404,409 |
| PUT | /api/business_rules/sets/{id}/members | business_rules_put_api_business_rules_sets_id_members | 200,400,401,403,404 |
| DELETE | /api/business_rules/sets/{id}/members | business_rules_delete_api_business_rules_sets_id_members | 200,400,401,403,404 |
| GET | /api/business_rules/sets/{id} | business_rules_get_api_business_rules_sets_id | 200,400,401,403,404 |
| GET | /api/business_rules/sets | business_rules_get_api_business_rules_sets | 200,400,401,403 |
| POST | /api/business_rules/sets | business_rules_post_api_business_rules_sets | 201,400,401,403 |
| PUT | /api/business_rules/sets | business_rules_put_api_business_rules_sets | 200,400,401,403,404 |
| DELETE | /api/business_rules/sets | business_rules_delete_api_business_rules_sets | 200,400,401,403,404 |
| GET | /api/feature_toggles/check/boolean | feature_toggles_get_api_feature_toggles_check_boolean | 200,400,401,404 |
| GET | /api/feature_toggles/check/json | feature_toggles_get_api_feature_toggles_check_json | 200,400,401,404 |
| GET | /api/feature_toggles/check/number | feature_toggles_get_api_feature_toggles_check_number | 200,400,401,404 |
| GET | /api/feature_toggles/check/string | feature_toggles_get_api_feature_toggles_check_string | 200,400,401,404 |
| GET | /api/feature_toggles/global/{id}/override | feature_toggles_get_api_feature_toggles_global_id_override | 200,400,401,403,404 |
| GET | /api/feature_toggles/global/{id} | feature_toggles_get_api_feature_toggles_global_id | 200,400,401,403,404 |
| GET | /api/feature_toggles/global | feature_toggles_get_api_feature_toggles_global | 200,400,401,403 |
| POST | /api/feature_toggles/global | feature_toggles_post_api_feature_toggles_global | 201,400,401,403 |
| PUT | /api/feature_toggles/global | feature_toggles_put_api_feature_toggles_global | 200,400,401,403,404 |
| DELETE | /api/feature_toggles/global | feature_toggles_delete_api_feature_toggles_global | 200,400,401,403,404 |
| GET | /api/feature_toggles/overrides | feature_toggles_get_api_feature_toggles_overrides | 200,400,401,403 |
| PUT | /api/feature_toggles/overrides | feature_toggles_put_api_feature_toggles_overrides | 200,400,401,403,404,500 |
| GET | /api/workflows/command-settings | workflows_get_api_workflows_command_settings | 200,401,403 |
| PUT | /api/workflows/command-settings | workflows_put_api_workflows_command_settings | 200,400,401,403,503 |
| GET | /api/workflows/commands | workflows_get_api_workflows_commands | 200,400,401,403,500 |
| GET | /api/workflows/definitions/{id}/callers | workflows_get_api_workflows_definitions_id_callers | 200,404 |
| GET | /api/workflows/definitions/{id}/context-schema | workflows_get_api_workflows_definitions_id_context_schema | 200,400,403,404 |
| POST | /api/workflows/definitions/{id}/customize | workflows_post_api_workflows_definitions_id_customize | 200,400,404 |
| GET | /api/workflows/definitions/{id}/draft | workflows_get_api_workflows_definitions_id_draft | 200,400,403,404 |
| PUT | /api/workflows/definitions/{id}/draft | workflows_put_api_workflows_definitions_id_draft | 200,400,403,404 |
| DELETE | /api/workflows/definitions/{id}/draft | workflows_delete_api_workflows_definitions_id_draft | 200,400,403 |
| POST | /api/workflows/definitions/{id}/publish | workflows_post_api_workflows_definitions_id_publish | 200,404,409 |
| POST | /api/workflows/definitions/{id}/reset-to-code | workflows_post_api_workflows_definitions_id_reset_to_code | 200,400,404,409 |
| GET | /api/workflows/definitions/{id} | workflows_get_api_workflows_definitions_id | 200,404 |
| PUT | /api/workflows/definitions/{id} | workflows_put_api_workflows_definitions_id | 200,400,404,409 |
| DELETE | /api/workflows/definitions/{id} | workflows_delete_api_workflows_definitions_id | 200,404,409 |
| POST | /api/workflows/definitions/{id}/test-step | workflows_post_api_workflows_definitions_id_test_step | 200,400,403,404 |
| POST | /api/workflows/definitions/generate | workflows_post_api_workflows_definitions_generate | 200,400,401,403,500 |
| GET | /api/workflows/definitions | workflows_get_api_workflows_definitions | 200 |
| POST | /api/workflows/definitions | workflows_post_api_workflows_definitions | 201,400,409 |
| GET | /api/workflows/endpoints | workflows_get_api_workflows_endpoints | 200,400,401,403,500 |
| GET | /api/workflows/events/{id} | workflows_get_api_workflows_events_id | 200,401,403,404,500 |
| GET | /api/workflows/events | workflows_get_api_workflows_events | 200,401,403,500 |
| GET | /api/workflows/functions | workflows_get_api_workflows_functions | 200,400,401,403,500 |
| GET | /api/workflows/grantable-features | workflows_get_api_workflows_grantable_features | 200,401,403 |
| POST | /api/workflows/instances/{id}/advance | workflows_post_api_workflows_instances_id_advance | 200,400,401,403,404,500 |
| POST | /api/workflows/instances/{id}/cancel | workflows_post_api_workflows_instances_id_cancel | 200,400,401,403,404,500 |
| PATCH | /api/workflows/instances/{id}/context | workflows_patch_api_workflows_instances_id_context | 200,400,401,403,404,409,500 |
| GET | /api/workflows/instances/{id}/events | workflows_get_api_workflows_instances_id_events | 200,401,404,500 |
| POST | /api/workflows/instances/{id}/rerun-step | workflows_post_api_workflows_instances_id_rerun_step | 200,400,401,403,404,409,500 |
| POST | /api/workflows/instances/{id}/retry | workflows_post_api_workflows_instances_id_retry | 200,400,401,403,404,500 |
| GET | /api/workflows/instances/{id} | workflows_get_api_workflows_instances_id | 200,401,404,500 |
| POST | /api/workflows/instances/{id}/signal | workflows_post_api_workflows_instances_id_signal | 200,400,401,403,404,409,500 |
| POST | /api/workflows/instances/{id}/step-through | workflows_post_api_workflows_instances_id_step_through | 200,400,403,404 |
| GET | /api/workflows/instances/{id}/steps | workflows_get_api_workflows_instances_id_steps | 200,401,404,500 |
| GET | /api/workflows/instances/{id}/would-do | workflows_get_api_workflows_instances_id_would_do | 200,401,404,500 |
| POST | /api/workflows/instances/bulk-replay | workflows_post_api_workflows_instances_bulk_replay | 202,400,401,403,500 |
| GET | /api/workflows/instances/failure-queue | workflows_get_api_workflows_instances_failure_queue | 200,401,500 |
| GET | /api/workflows/instances | workflows_get_api_workflows_instances | 200,400,401,500 |
| POST | /api/workflows/instances | workflows_post_api_workflows_instances | 201,400,401,403,404,500 |
| POST | /api/workflows/instances/validate-start | workflows_post_api_workflows_instances_validate_start | 200,400,401,500 |
| GET | /api/workflows/metrics/definitions | workflows_get_api_workflows_metrics_definitions | 200,400,401,500 |
| POST | /api/workflows/portal/tasks/{id}/complete | workflows_post_api_workflows_portal_tasks_id_complete | 200,400,401,403,404,500 |
| GET | /api/workflows/portal/tasks/{id} | workflows_get_api_workflows_portal_tasks_id | 200,401,403,404,500 |
| GET | /api/workflows/portal/tasks | workflows_get_api_workflows_portal_tasks | 200,401,403,500 |
| GET | /api/workflows/rule-usage | workflows_get_api_workflows_rule_usage | 200,400,401 |
| POST | /api/workflows/signals | workflows_post_api_workflows_signals | 200,400,401,403,500 |
| GET | /api/workflows/task-settings | workflows_get_api_workflows_task_settings | 200,401,403 |
| PUT | /api/workflows/task-settings | workflows_put_api_workflows_task_settings | 200,400,401,403,503 |
| POST | /api/workflows/tasks/{id}/claim | workflows_post_api_workflows_tasks_id_claim | 200,400,401,403,404,409,500 |
| POST | /api/workflows/tasks/{id}/complete | workflows_post_api_workflows_tasks_id_complete | 200,400,401,403,404,409,500 |
| POST | /api/workflows/tasks/{id}/reassign | workflows_post_api_workflows_tasks_id_reassign | 200,400,401,403,404,409,500 |
| GET | /api/workflows/tasks/{id} | workflows_get_api_workflows_tasks_id | 200,400,401,403,404,500 |
| POST | /api/workflows/tasks/{id}/unclaim | workflows_post_api_workflows_tasks_id_unclaim | 200,400,401,403,404,409,500 |
| GET | /api/workflows/tasks | workflows_get_api_workflows_tasks | 200,400,401,500 |
| GET | /api/workflows/templates | workflows_get_api_workflows_templates | 200,400,401,403,500 |
| POST | /api/workflows/work-inbox/next | workflows_post_api_workflows_work_inbox_next | 200,400,401,500 |
| GET | /api/workflows/work-inbox | workflows_get_api_workflows_work_inbox | 200,400,401,500 |
| POST | /api/search/embeddings/reindex/cancel | search_post_api_search_embeddings_reindex_cancel | 200,401,403 |
| POST | /api/search/embeddings/reindex | search_post_api_search_embeddings_reindex | 200,401,403,409,500,503 |
| GET | /api/search/embeddings | search_get_api_search_embeddings | 200,401,403 |
| POST | /api/search/embeddings | search_post_api_search_embeddings | 200,400,401,403,409,500,503 |
| GET | /api/search/index | search_get_api_search_index | 200,401,403,500,503 |
| DELETE | /api/search/index | search_delete_api_search_index | 200,400,401,403,500,503 |
| POST | /api/search/reindex/cancel | search_post_api_search_reindex_cancel | 200,401,403 |
| POST | /api/search/reindex | search_post_api_search_reindex | 200,401,403,409,500,503 |
| GET | /api/search/search/global | search_get_api_search_search_global | 200,400,401,403,500,503 |
| GET | /api/search/search | search_get_api_search_search | 200,400,401,403,500,503 |
| GET | /api/search/settings/fulltext | search_get_api_search_settings_fulltext | 200,401,403 |
| GET | /api/search/settings/global-search | search_get_api_search_settings_global_search | 200,401,403 |
| POST | /api/search/settings/global-search | search_post_api_search_settings_global_search | 200,400,401,403,500 |
| GET | /api/search/settings | search_get_api_search_settings | 200,401,403 |
| GET | /api/search/settings/vector-store | search_get_api_search_settings_vector_store | 200,401,403 |
| GET | /api/currencies/currencies/options | currencies_get_api_currencies_currencies_options | 200,400,401,403 |
| GET | /api/currencies/currencies | currencies_get_api_currencies_currencies | 200,401,403 |
| POST | /api/currencies/currencies | currencies_post_api_currencies_currencies | 201,401,403 |
| PUT | /api/currencies/currencies | currencies_put_api_currencies_currencies | 200,401,403 |
| DELETE | /api/currencies/currencies | currencies_delete_api_currencies_currencies | 200,401,403 |
| GET | /api/currencies/exchange-rates | currencies_get_api_currencies_exchange_rates | 200,401,403 |
| POST | /api/currencies/exchange-rates | currencies_post_api_currencies_exchange_rates | 201,401,403 |
| PUT | /api/currencies/exchange-rates | currencies_put_api_currencies_exchange_rates | 200,401,403 |
| DELETE | /api/currencies/exchange-rates | currencies_delete_api_currencies_exchange_rates | 200,401,403 |
| GET | /api/currencies/fetch-configs | listCurrencyFetchConfigs | 200,401,403 |
| POST | /api/currencies/fetch-configs | createCurrencyFetchConfig | 201,400,401,403 |
| PUT | /api/currencies/fetch-configs | updateCurrencyFetchConfig | 200,400,401,403 |
| DELETE | /api/currencies/fetch-configs | deleteCurrencyFetchConfig | 200,400,401,403 |
| POST | /api/currencies/fetch-rates | fetchCurrencyRates | 200,400,401,500 |
| POST | /api/resources/resources/tags/assign | resources_post_api_resources_resources_tags_assign | 201,400,401,403 |
| POST | /api/resources/resources/tags/unassign | resources_post_api_resources_resources_tags_unassign | 200,400,401,403 |
| POST | /api/staff/leave-requests/accept | staff_post_api_staff_leave_requests_accept | 200,400,401,403 |
| POST | /api/staff/leave-requests/reject | staff_post_api_staff_leave_requests_reject | 200,400,401,403 |
| GET | /api/staff/portal/time-reports/{id} | staff_get_api_staff_portal_time_reports_id | 200,401,403,404 |
| GET | /api/staff/portal/time-reports | staff_get_api_staff_portal_time_reports | 200,401,403 |
| GET | /api/staff/team-members/assignable | staff_get_api_staff_team_members_assignable | 200,400,401,403 |
| GET | /api/staff/team-members/self | staff_get_api_staff_team_members_self | 200,401,403 |
| POST | /api/staff/team-members/self | staff_post_api_staff_team_members_self | 201,400,401,403,409 |
| POST | /api/staff/team-members/tags/assign | staff_post_api_staff_team_members_tags_assign | 201,400,401,403 |
| POST | /api/staff/team-members/tags/unassign | staff_post_api_staff_team_members_tags_unassign | 200,400,401,403 |
| POST | /api/staff/timesheets/access-requests | staff_post_api_staff_timesheets_access_requests | 200,400,401,403 |
| PATCH | /api/staff/timesheets/my-projects/{projectId} | staff_patch_api_staff_timesheets_my_projects_projectId | 200,400,401,403,404 |
| GET | /api/staff/timesheets/my-projects | staff_get_api_staff_timesheets_my_projects | 200,401,403 |
| GET | /api/staff/timesheets/my-work | staff_get_api_staff_timesheets_my_work | 200,400,401,403,500 |
| GET | /api/staff/timesheets/projects/kpis | staff_get_api_staff_timesheets_projects_kpis | 200,401,403,500 |
| POST | /api/staff/timesheets/reports/{id}/close | staff_post_api_staff_timesheets_reports_id_close | 200,400,401,403,404,409,422 |
| GET | /api/staff/timesheets/reports/{id}/export | staff_get_api_staff_timesheets_reports_id_export | 200,400,401,403,404 |
| GET | /api/staff/timesheets/reports/{id}/sheet | staff_get_api_staff_timesheets_reports_id_sheet | 200,401,403,404 |
| POST | /api/staff/timesheets/reports/{id}/unlock | staff_post_api_staff_timesheets_reports_id_unlock | 200,400,401,403,404,409 |
| POST | /api/staff/timesheets/reports/preview | staff_post_api_staff_timesheets_reports_preview | 200,400,401,403,422 |
| GET | /api/staff/timesheets/reports | staff_get_api_staff_timesheets_reports | 200,401,403 |
| POST | /api/staff/timesheets/reports | staff_post_api_staff_timesheets_reports | 201,401,403 |
| PUT | /api/staff/timesheets/reports | staff_put_api_staff_timesheets_reports | 200,401,403 |
| DELETE | /api/staff/timesheets/reports | staff_delete_api_staff_timesheets_reports | 200,401,403 |
| POST | /api/staff/timesheets/settings/reapply-rounding | staff_post_api_staff_timesheets_settings_reapply_rounding | 200,202,400,401,403,500 |
| GET | /api/staff/timesheets/settings/rounding-impact | staff_get_api_staff_timesheets_settings_rounding_impact | 200,400,401,403,500 |
| GET | /api/staff/timesheets/settings | staff_get_api_staff_timesheets_settings | 200,401,403 |
| PUT | /api/staff/timesheets/settings | staff_put_api_staff_timesheets_settings | 200,400,401,403 |
| POST | /api/staff/timesheets/tags/entry-assignments | staff_post_api_staff_timesheets_tags_entry_assignments | 200,400,401,403,404,409,422 |
| DELETE | /api/staff/timesheets/tags/entry-assignments | staff_delete_api_staff_timesheets_tags_entry_assignments | 200,400,401,403,404,409 |
| GET | /api/staff/timesheets/tags | staff_get_api_staff_timesheets_tags | 200,401,403 |
| POST | /api/staff/timesheets/tags | staff_post_api_staff_timesheets_tags | 201,401,403 |
| PUT | /api/staff/timesheets/tags | staff_put_api_staff_timesheets_tags | 200,401,403 |
| DELETE | /api/staff/timesheets/tags | staff_delete_api_staff_timesheets_tags | 200,401,403 |
| POST | /api/staff/timesheets/tags/task-assignments | staff_post_api_staff_timesheets_tags_task_assignments | 200,400,401,403,404,422 |
| DELETE | /api/staff/timesheets/tags/task-assignments | staff_delete_api_staff_timesheets_tags_task_assignments | 200,400,401,403,404 |
| GET | /api/staff/timesheets/task-statuses | staff_get_api_staff_timesheets_task_statuses | 200,401,403 |
| POST | /api/staff/timesheets/task-statuses | staff_post_api_staff_timesheets_task_statuses | 201,401,403 |
| PUT | /api/staff/timesheets/task-statuses | staff_put_api_staff_timesheets_task_statuses | 200,401,403 |
| DELETE | /api/staff/timesheets/task-statuses | staff_delete_api_staff_timesheets_task_statuses | 200,401,403 |
| GET | /api/staff/timesheets/tasks/{id}/comments | staff_get_api_staff_timesheets_tasks_id_comments | 200,400,401,403,404 |
| POST | /api/staff/timesheets/tasks/{id}/comments | staff_post_api_staff_timesheets_tasks_id_comments | 201,400,401,403,404 |
| PUT | /api/staff/timesheets/tasks/{id}/comments | staff_put_api_staff_timesheets_tasks_id_comments | 200,400,401,403,404,409 |
| DELETE | /api/staff/timesheets/tasks/{id}/comments | staff_delete_api_staff_timesheets_tasks_id_comments | 200,400,401,403,404,409 |
| PATCH | /api/staff/timesheets/tasks/{id}/status | staff_patch_api_staff_timesheets_tasks_id_status | 200,400,401,403,404,409,422 |
| GET | /api/staff/timesheets/tasks | staff_get_api_staff_timesheets_tasks | 200,401,403 |
| POST | /api/staff/timesheets/tasks | staff_post_api_staff_timesheets_tasks | 201,401,403 |
| PUT | /api/staff/timesheets/tasks | staff_put_api_staff_timesheets_tasks | 200,401,403 |
| DELETE | /api/staff/timesheets/tasks | staff_delete_api_staff_timesheets_tasks | 200,401,403 |
| POST | /api/staff/timesheets/time-entries/{id}/duplicate | staff_post_api_staff_timesheets_time_entries_id_duplicate | 201,400,401,403,404,409 |
| PATCH | /api/staff/timesheets/time-entries/{id}/segments/{segmentId} | staff_patch_api_staff_timesheets_time_entries_id_segments_segmentId | 200,400,401,403,404 |
| POST | /api/staff/timesheets/time-entries/{id}/segments | staff_post_api_staff_timesheets_time_entries_id_segments | 201,400,401,403,404 |
| POST | /api/staff/timesheets/time-entries/{id}/timer-start | staff_post_api_staff_timesheets_time_entries_id_timer_start | 200,401,403,404,409 |
| POST | /api/staff/timesheets/time-entries/{id}/timer-stop | staff_post_api_staff_timesheets_time_entries_id_timer_stop | 200,401,403,404,409 |
| POST | /api/staff/timesheets/time-entries/bulk | staff_post_api_staff_timesheets_time_entries_bulk | 200,401,403,409,422 |
| POST | /api/staff/timesheets/time-entries/copy-day | staff_post_api_staff_timesheets_time_entries_copy_day | 200,400,401,403,409 |
| GET | /api/staff/timesheets/time-entries/overlaps | staff_get_api_staff_timesheets_time_entries_overlaps | 200,400,401,403 |
| GET | /api/staff/timesheets/time-entries | staff_get_api_staff_timesheets_time_entries | 200,401,403 |
| POST | /api/staff/timesheets/time-entries | staff_post_api_staff_timesheets_time_entries | 201,401,403 |
| PUT | /api/staff/timesheets/time-entries | staff_put_api_staff_timesheets_time_entries | 200,401,403 |
| DELETE | /api/staff/timesheets/time-entries | staff_delete_api_staff_timesheets_time_entries | 200,401,403 |
| POST | /api/staff/timesheets/time-entries/start-timer | staff_post_api_staff_timesheets_time_entries_start_timer | 201,400,401,403,409,422 |
| POST | /api/staff/timesheets/time-projects/{id}/change-currency | staff_post_api_staff_timesheets_time_projects_id_change_currency | 200,400,401,403,404,409 |
| GET | /api/staff/timesheets/time-projects/{id}/employees | staff_get_api_staff_timesheets_time_projects_id_employees | 200,401,403 |
| POST | /api/staff/timesheets/time-projects/{id}/employees | staff_post_api_staff_timesheets_time_projects_id_employees | 201,401,403 |
| PUT | /api/staff/timesheets/time-projects/{id}/employees | staff_put_api_staff_timesheets_time_projects_id_employees | 200,401,403 |
| DELETE | /api/staff/timesheets/time-projects/{id}/employees | staff_delete_api_staff_timesheets_time_projects_id_employees | 200,401,403 |
| GET | /api/staff/timesheets/time-projects | staff_get_api_staff_timesheets_time_projects | 200,401,403,404 |
| POST | /api/staff/timesheets/time-projects | staff_post_api_staff_timesheets_time_projects | 201,401,403 |
| PUT | /api/staff/timesheets/time-projects | staff_put_api_staff_timesheets_time_projects | 200,401,403 |
| DELETE | /api/staff/timesheets/time-projects | staff_delete_api_staff_timesheets_time_projects | 200,401,403 |
| GET | /api/events | events_get_api_events | 200,401,403 |
| GET | /api/events/stream | events_get_api_events_stream | 200,401 |
| POST | /api/notifications/{id}/action | notifications_post_api_notifications_id_action | 201,401 |
| PUT | /api/notifications/{id}/dismiss | notifications_put_api_notifications_id_dismiss | 200,401 |
| PUT | /api/notifications/{id}/read | notifications_put_api_notifications_id_read | 200,401 |
| PUT | /api/notifications/{id}/restore | notifications_put_api_notifications_id_restore | 200,401 |
| GET | /api/notifications/admin/preferences | notifications_get_api_notifications_admin_preferences | 200,401,403 |
| PUT | /api/notifications/admin/preferences | notifications_put_api_notifications_admin_preferences | 200,401,403 |
| POST | /api/notifications/batch | notifications_post_api_notifications_batch | 201,401,403 |
| GET | /api/notifications/channels | notifications_get_api_notifications_channels | 200,401,403 |
| POST | /api/notifications/feature | notifications_post_api_notifications_feature | 201,401,403 |
| PUT | /api/notifications/mark-all-read | notifications_put_api_notifications_mark_all_read | 200,401 |
| GET | /api/notifications/preferences | notifications_get_api_notifications_preferences | 200,401,403 |
| PUT | /api/notifications/preferences | notifications_put_api_notifications_preferences | 200,401,403 |
| POST | /api/notifications/role | notifications_post_api_notifications_role | 201,401,403 |
| GET | /api/notifications | notifications_get_api_notifications | 200,401,403 |
| POST | /api/notifications | notifications_post_api_notifications | 201,401,403 |
| GET | /api/notifications/settings | notifications_get_api_notifications_settings | 200,401,403 |
| POST | /api/notifications/settings | notifications_post_api_notifications_settings | 201,401,403 |
| PUT | /api/notifications/types/{id}/channels/{channel} | notifications_put_api_notifications_types_id_channels_channel | 200,401,403 |
| DELETE | /api/notifications/types/{id}/channels/{channel} | notifications_delete_api_notifications_types_id_channels_channel | 204,401,403 |
| GET | /api/notifications/types | notifications_get_api_notifications_types | 200,401,403 |
| PATCH | /api/notifications/types | notifications_patch_api_notifications_types | 200,401,403 |
| GET | /api/notifications/unread-count | notifications_get_api_notifications_unread_count | 200,401 |
| GET | /api/progress/active | progress_get_api_progress_active | 200,401,403 |
| GET | /api/progress/jobs/{id} | progress_get_api_progress_jobs_id | 200,401,403 |
| PUT | /api/progress/jobs/{id} | progress_put_api_progress_jobs_id | 200,401,403 |
| DELETE | /api/progress/jobs/{id} | progress_delete_api_progress_jobs_id | 204,401,403 |
| GET | /api/progress/jobs | progress_get_api_progress_jobs | 200,401,403 |
| POST | /api/progress/jobs | progress_post_api_progress_jobs | 201,401,403 |
| GET | /api/integrations/{id}/credentials | integrations_get_api_integrations_id_credentials | 200,401,403 |
| PUT | /api/integrations/{id}/credentials | integrations_put_api_integrations_id_credentials | 200,401,403 |
| POST | /api/integrations/{id}/health | integrations_post_api_integrations_id_health | 201,401,403 |
| GET | /api/integrations/{id} | integrations_get_api_integrations_id | 200,401,403 |
| PUT | /api/integrations/{id}/state | integrations_put_api_integrations_id_state | 200,401,403 |
| PUT | /api/integrations/{id}/version | integrations_put_api_integrations_id_version | 200,401,403 |
| GET | /api/integrations/logs | integrations_get_api_integrations_logs | 200,401,403 |
| GET | /api/integrations | integrations_get_api_integrations | 200,401,403 |
| GET | /api/data_sync/mappings/{id} | data_sync_get_api_data_sync_mappings_id | 200,401,403 |
| PUT | /api/data_sync/mappings/{id} | data_sync_put_api_data_sync_mappings_id | 200,401,403 |
| DELETE | /api/data_sync/mappings/{id} | data_sync_delete_api_data_sync_mappings_id | 204,401,403 |
| GET | /api/data_sync/mappings | data_sync_get_api_data_sync_mappings | 200,401,403 |
| POST | /api/data_sync/mappings | data_sync_post_api_data_sync_mappings | 201,401,403 |
| GET | /api/data_sync/runs/{id} | data_sync_get_api_data_sync_runs_id | 200,401,403 |
| GET | /api/data_sync/schedules/{id} | data_sync_get_api_data_sync_schedules_id | 200,401,403 |
| PUT | /api/data_sync/schedules/{id} | data_sync_put_api_data_sync_schedules_id | 200,401,403 |
| DELETE | /api/data_sync/schedules/{id} | data_sync_delete_api_data_sync_schedules_id | 204,401,403 |
| GET | /api/data_sync/schedules | data_sync_get_api_data_sync_schedules | 200,401,403 |
| POST | /api/data_sync/schedules | data_sync_post_api_data_sync_schedules | 201,401,403 |
| POST | /api/sync_excel/import | sync_excel_post_api_sync_excel_import | 201,401,403,404,409,422 |
| GET | /api/sync_excel/preview | sync_excel_get_api_sync_excel_preview | 200,401,403,404,422 |
| POST | /api/sync_excel/upload | sync_excel_post_api_sync_excel_upload | 200,400,401,403,413,422 |
| POST | /api/messages/{id}/actions/{actionId} | messages_post_api_messages_id_actions_actionId | 200,401,403,404,409,410 |
| PUT | /api/messages/{id}/archive | messages_put_api_messages_id_archive | 200,401,403,404 |
| DELETE | /api/messages/{id}/archive | messages_delete_api_messages_id_archive | 200,401,403,404 |
| GET | /api/messages/{id}/attachments | messages_get_api_messages_id_attachments | 200,401,403,404 |
| POST | /api/messages/{id}/attachments | messages_post_api_messages_id_attachments | 200,401,403,404,409 |
| DELETE | /api/messages/{id}/attachments | messages_delete_api_messages_id_attachments | 200,401,403,404,409 |
| GET | /api/messages/{id}/confirmation | messages_get_api_messages_id_confirmation | 200,401,403,404 |
| PUT | /api/messages/{id}/conversation/archive | messages_put_api_messages_id_conversation_archive | 200,401,403,404 |
| DELETE | /api/messages/{id}/conversation/archive | messages_delete_api_messages_id_conversation_archive | 200,401,403,404 |
| PUT | /api/messages/{id}/conversation/read | messages_put_api_messages_id_conversation_read | 200,401,403,404 |
| DELETE | /api/messages/{id}/conversation/read | messages_delete_api_messages_id_conversation_read | 200,401,403,404 |
| DELETE | /api/messages/{id}/conversation | messages_delete_api_messages_id_conversation | 200,401,403,404 |
| POST | /api/messages/{id}/forward | messages_post_api_messages_id_forward | 201,401,403,404,409,413 |
| GET | /api/messages/{id}/forward-preview | messages_get_api_messages_id_forward_preview | 200,401,403,404,413 |
| PUT | /api/messages/{id}/read | messages_put_api_messages_id_read | 200,401,403,404 |
| DELETE | /api/messages/{id}/read | messages_delete_api_messages_id_read | 200,401,403,404 |
| POST | /api/messages/{id}/reply | messages_post_api_messages_id_reply | 201,401,403,404,409 |
| GET | /api/messages/{id} | messages_get_api_messages_id | 200,401,403,404 |
| PATCH | /api/messages/{id} | messages_patch_api_messages_id | 200,401,403,404,409 |
| DELETE | /api/messages/{id} | messages_delete_api_messages_id | 200,401,403,404,409 |
| GET | /api/messages/object-types | messages_get_api_messages_object_types | 200,400,401,403 |
| GET | /api/messages | messages_get_api_messages | 200,401 |
| POST | /api/messages | messages_post_api_messages | 201,401,403 |
| GET | /api/messages/token/{token} | messages_get_api_messages_token_token | 200,404,409,410 |
| GET | /api/messages/types | messages_get_api_messages_types | 200,401,403 |
| GET | /api/messages/unread-count | messages_get_api_messages_unread_count | 200,401 |
| DELETE | /api/communication_channels/delete/admin/channels/{id} | communication_channels_delete_api_communication_channels_delete_admin_channels_id | 204,400,401,403,404 |
| DELETE | /api/communication_channels/delete/channels/{id} | communication_channels_delete_api_communication_channels_delete_channels_id | 204,400,401,403,404 |
| DELETE | /api/communication_channels/delete/messages/{messageId}/reactions/{reactionId} | communication_channels_delete_api_communication_channels_delete_messages_messageId_reactions_reactionId | 204,400,401,403,404,409 |
| GET | /api/communication_channels/get/channels/{id}/health | communication_channels_get_api_communication_channels_get_channels_id_health | 200,400,401,403,404 |
| GET | /api/communication_channels/get/channels/{id} | communication_channels_get_api_communication_channels_get_channels_id | 200,400,401,403,404 |
| GET | /api/communication_channels/get/channels | communication_channels_get_api_communication_channels_get_channels | 200,400,401,403 |
| GET | /api/communication_channels/get/me/channels | communication_channels_get_api_communication_channels_get_me_channels | 200,401,403 |
| GET | /api/communication_channels/get/oauth/{provider}/callback | communication_channels_get_api_communication_channels_get_oauth_provider_callback | 200,302,401 |
| POST | /api/communication_channels/post/channels/{id}/import-history | communication_channels_post_api_communication_channels_post_channels_id_import_history | 202,400,401,403,404,409,429 |
| POST | /api/communication_channels/post/channels/{id}/poll-now | communication_channels_post_api_communication_channels_post_channels_id_poll_now | 202,400,401,403,404,409 |
| POST | /api/communication_channels/post/channels/{id}/push/register | communication_channels_post_api_communication_channels_post_channels_id_push_register | 202,400,401,403,404,409,502,503 |
| POST | /api/communication_channels/post/channels/{id}/set-primary | communication_channels_post_api_communication_channels_post_channels_id_set_primary | 200,400,401,403,404 |
| POST | /api/communication_channels/post/channels/{id}/test-send | communication_channels_post_api_communication_channels_post_channels_id_test_send | 200,400,401,403,404,409,422,502 |
| POST | /api/communication_channels/post/channels/connect/credentials | communication_channels_post_api_communication_channels_post_channels_connect_credentials | 201,401,403,404,409,422 |
| POST | /api/communication_channels/post/channels/connect/tenant-credentials | communication_channels_post_api_communication_channels_post_channels_connect_tenant_credentials | 201,400,401,403,404,422 |
| POST | /api/communication_channels/post/messages/{messageId}/reactions | communication_channels_post_api_communication_channels_post_messages_messageId_reactions | 201,400,401,403,409,422 |
| POST | /api/communication_channels/post/oauth/{provider}/initiate | communication_channels_post_api_communication_channels_post_oauth_provider_initiate | 200,400,401,403,422,502 |
| POST | /api/communication_channels/post/send-as-user | communication_channels_post_api_communication_channels_post_send_as_user | 202,401,403,404,409,422 |
| POST | /api/communication_channels/post/test-seed | communication_channels_post_api_communication_channels_post_test_seed | 201,401,403,404,422,500 |
| POST | /api/communication_channels/post/webhook/{provider} | communication_channels_post_api_communication_channels_post_webhook_provider | 202,401,404,413 |
| POST | /api/communication_channels/post/webhooks/gmail | communication_channels_post_api_communication_channels_post_webhooks_gmail | 204,400,401,403,413,503 |
| PUT | /api/communication_channels/put/channels/{id}/visibility | communication_channels_put_api_communication_channels_put_channels_id_visibility | 200,400,401,403,404,409,422 |
| PUT | /api/communication_channels/put/threads/{threadId}/assign | communication_channels_put_api_communication_channels_put_threads_threadId_assign | 200,400,401,403,404,422 |
| POST | /api/push_notifications/custom-send | push_notifications_post_api_push_notifications_custom_send | 201,401,403 |
| GET | /api/push_notifications/deliveries/{id} | push_notifications_get_api_push_notifications_deliveries_id | 200,400,401,403,404 |
| GET | /api/push_notifications/deliveries | push_notifications_get_api_push_notifications_deliveries | 200,401,403 |
| GET | /api/phone_calls/calls | phone_calls_get_api_phone_calls_calls | 200,401,403 |
| POST | /api/ai_assistant/ai/actions/{id}/cancel | aiAssistantCancelPendingAction | 200,400,401,403,404,409,500 |
| POST | /api/ai_assistant/ai/actions/{id}/confirm | aiAssistantConfirmPendingAction | 200,401,403,404,409,412,500 |
| GET | /api/ai_assistant/ai/actions/{id} | aiAssistantGetPendingAction | 200,401,403,404,500 |
| GET | /api/ai_assistant/ai/agents/{agentId}/loop-override | aiAssistantGetLoopOverride | 200,400,401,403,404 |
| PUT | /api/ai_assistant/ai/agents/{agentId}/loop-override | aiAssistantSaveLoopOverride | 200,400,401,403,404 |
| DELETE | /api/ai_assistant/ai/agents/{agentId}/loop-override | aiAssistantClearLoopOverride | 200,400,401,403,404 |
| GET | /api/ai_assistant/ai/agents/{agentId}/models | aiAssistantGetAgentModels | 200,401,403,404 |
| GET | /api/ai_assistant/ai/agents/{agentId}/mutation-policy | aiAssistantGetMutationPolicyOverride | 200,400,401,403,404 |
| POST | /api/ai_assistant/ai/agents/{agentId}/mutation-policy | aiAssistantSaveMutationPolicyOverride | 200,400,401,403,404 |
| DELETE | /api/ai_assistant/ai/agents/{agentId}/mutation-policy | aiAssistantClearMutationPolicyOverride | 200,400,401,403,404 |
| GET | /api/ai_assistant/ai/agents/{agentId}/prompt-override | aiAssistantGetPromptOverride | 200,400,401,403,404 |
| POST | /api/ai_assistant/ai/agents/{agentId}/prompt-override | aiAssistantSavePromptOverride | 200,400,401,403,404 |
| GET | /api/ai_assistant/ai/agents | aiAssistantListAgents | 200,401,403,500 |
| POST | /api/ai_assistant/ai/chat | aiAssistantChatAgent | 200,400,401,403,404,409,500 |
| DELETE | /api/ai_assistant/ai/conversations/{conversationId}/participants/{userId} | aiAssistantRevokeConversationParticipant | 204,400,401,403,404 |
| GET | /api/ai_assistant/ai/conversations/{conversationId}/participants | aiAssistantListConversationParticipants | 200,401,403,404 |
| POST | /api/ai_assistant/ai/conversations/{conversationId}/participants | aiAssistantAddConversationParticipant | 201,400,401,403,404 |
| GET | /api/ai_assistant/ai/conversations/{conversationId} | aiAssistantGetConversation | 200,400,401,403,404 |
| PATCH | /api/ai_assistant/ai/conversations/{conversationId} | aiAssistantUpdateConversation | 200,400,401,403,404 |
| DELETE | /api/ai_assistant/ai/conversations/{conversationId} | aiAssistantDeleteConversation | 200,401,403,404 |
| POST | /api/ai_assistant/ai/conversations/import | aiAssistantImportConversation | 200,400,401,403 |
| GET | /api/ai_assistant/ai/conversations | aiAssistantListConversations | 200,400,401,403 |
| POST | /api/ai_assistant/ai/conversations | aiAssistantCreateConversation | 200,201,400,401,403 |
| POST | /api/ai_assistant/ai/run-object | aiAssistantRunObject | 200,400,401,403,404,409,422,500 |
| POST | /api/ai_assistant/chat | ai_assistant_post_api_ai_assistant_chat | 201,401,403 |
| GET | /api/ai_assistant/health | ai_assistant_get_api_ai_assistant_health | 200,401,403 |
| POST | /api/ai_assistant/mcp-key | ai_assistant_post_api_ai_assistant_mcp_key | 200,401,403,500 |
| GET | /api/ai_assistant/moderation-flags | aiAssistantModerationFlags | 200,400,401,403,500 |
| POST | /api/ai_assistant/route | ai_assistant_post_api_ai_assistant_route | 201,401,403 |
| POST | /api/ai_assistant/session-key | ai_assistant_post_api_ai_assistant_session_key | 200,401,403,500 |
| PUT | /api/ai_assistant/settings/allowlist | ai_assistant_put_api_ai_assistant_settings_allowlist | 200,400,401,403 |
| DELETE | /api/ai_assistant/settings/allowlist | ai_assistant_delete_api_ai_assistant_settings_allowlist | 200,401,403 |
| GET | /api/ai_assistant/settings | ai_assistant_get_api_ai_assistant_settings | 200,401,403 |
| PUT | /api/ai_assistant/settings | ai_assistant_put_api_ai_assistant_settings | 200,400,401,403 |
| DELETE | /api/ai_assistant/settings | ai_assistant_delete_api_ai_assistant_settings | 200,401,403 |
| POST | /api/ai_assistant/tools/execute | ai_assistant_post_api_ai_assistant_tools_execute | 201,401,403 |
| GET | /api/ai_assistant/tools | ai_assistant_get_api_ai_assistant_tools | 200,401,403 |
| GET | /api/ai_assistant/usage/daily | aiAssistantUsageDaily | 200,400,401,403,500 |
| GET | /api/ai_assistant/usage/sessions/{sessionId} | aiAssistantUsageSessionDetail | 200,400,401,403,404,500 |
| GET | /api/ai_assistant/usage/sessions | aiAssistantUsageSessions | 200,400,401,403,500 |
| PUT | /api/ai_model_config/default | ai_model_config_put_api_ai_model_config_default | 200,400,401,403 |
| DELETE | /api/ai_model_config/default | ai_model_config_delete_api_ai_model_config_default | 200,401,403 |
| PUT | /api/ai_model_config/models/{id} | ai_model_config_put_api_ai_model_config_models_id | 200,400,401,403,404 |
| DELETE | /api/ai_model_config/models/{id} | ai_model_config_delete_api_ai_model_config_models_id | 200,401,403,404 |
| GET | /api/ai_model_config/models | ai_model_config_get_api_ai_model_config_models | 200,401,403 |
| POST | /api/ai_model_config/models | ai_model_config_post_api_ai_model_config_models | 200,400,401,403 |
| POST | /api/ai_model_config/providers/{id}/models | ai_model_config_post_api_ai_model_config_providers_id_models | 200,400,401,403,404 |
| PUT | /api/ai_model_config/providers/{id} | ai_model_config_put_api_ai_model_config_providers_id | 200,400,401,403,404 |
| DELETE | /api/ai_model_config/providers/{id} | ai_model_config_delete_api_ai_model_config_providers_id | 200,400,401,403 |
| GET | /api/ai_model_config/providers | ai_model_config_get_api_ai_model_config_providers | 200,401,403 |
| POST | /api/ai_model_config/providers | ai_model_config_post_api_ai_model_config_providers | 200,400,401,403 |
| POST | /api/system_update/run | system_update_post_api_system_update_run | 201,401 |
| GET | /api/system_update/status | system_update_get_api_system_update_status | 200,401 |
| GET | /api/settings_home/me | settings_home_get_api_settings_home_me | 200,401 |
| GET | /api/communications/me/attachments/{id} | communications_get_api_communications_me_attachments_id | 200,401,403 |
| GET | /api/communications/me/channels | communications_get_api_communications_me_channels | 200,401,403 |
| GET | /api/communications/me/dead-letters | communications_get_api_communications_me_dead_letters | 200,401,403 |
| GET | /api/communications/me/reconciliation | communications_get_api_communications_me_reconciliation | 200,401,403 |
| POST | /api/communications/me/reconciliation | communications_post_api_communications_me_reconciliation | 200,401,403,404,409,422 |
| POST | /api/communications/me/send | communications_post_api_communications_me_send | 202,401,403,404,409,422,503 |
| GET | /api/communications/me/threads/{id}/customer | communications_get_api_communications_me_threads_id_customer | 200,401,403,404 |
| PUT | /api/communications/me/threads/{id}/customer | communications_put_api_communications_me_threads_id_customer | 200,401,403,404,422 |
| GET | /api/communications/me/threads/{id}/messages | communications_get_api_communications_me_threads_id_messages | 200,401,403,404,422 |
| GET | /api/communications/me/threads/{id}/notes | communications_get_api_communications_me_threads_id_notes | 200,401,403,404 |
| POST | /api/communications/me/threads/{id}/notes | communications_post_api_communications_me_threads_id_notes | 201,401,403,404,422 |
| GET | /api/communications/me/threads | communications_get_api_communications_me_threads | 200,401,403,422 |
| POST | /api/communications/webhook/messenger | communications_post_api_communications_webhook_messenger | 202,400,401,413 |
| GET | /api/communications/webhook/verify | communications_get_api_communications_webhook_verify | 200,403,503 |
| POST | /api/communications/webhook/whatsapp | communications_post_api_communications_webhook_whatsapp | 202,400,401,413 |
| GET | /api/crm_navigation/navigation | crm_navigation_get_api_crm_navigation_navigation | 200,401,502,504 |
| GET | /api/workspace_settings/layout | workspace_settings_get_api_workspace_settings_layout | 200,400,401,403 |
| PUT | /api/workspace_settings/layout | workspace_settings_put_api_workspace_settings_layout | 200,400,401,403 |
| GET | /api/workspace_settings/preferences | workspace_settings_get_api_workspace_settings_preferences | 200,400,401 |
| PUT | /api/workspace_settings/preferences | workspace_settings_put_api_workspace_settings_preferences | 200,400,401 |
| GET | /api/workspace_settings/presets | workspace_settings_get_api_workspace_settings_presets | 200,400,401 |
| GET | /api/translations/{entityType}/{entityId} | translations_get_api_translations_entityType_entityId | 200,401,403,404 |
| PUT | /api/translations/{entityType}/{entityId} | translations_put_api_translations_entityType_entityId | 200,400,401,403 |
| DELETE | /api/translations/{entityType}/{entityId} | translations_delete_api_translations_entityType_entityId | 204,401,403 |
| GET | /api/scheduler/jobs/{id}/executions | getScheduleExecutions | 200,400,401,403,404 |
| GET | /api/scheduler/jobs | scheduler_get_api_scheduler_jobs | 200,401,403 |
| POST | /api/scheduler/jobs | scheduler_post_api_scheduler_jobs | 201,401,403 |
| PUT | /api/scheduler/jobs | scheduler_put_api_scheduler_jobs | 200,401,403 |
| DELETE | /api/scheduler/jobs | scheduler_delete_api_scheduler_jobs | 200,401,403 |
| GET | /api/scheduler/queue-jobs/{jobId} | getQueueJobDetails | 200,400,401,403,404,500 |
| GET | /api/scheduler/targets | listScheduleTargets | 200,401 |
| POST | /api/scheduler/trigger | triggerScheduledJob | 200,400,401,403,404,409 |
| POST | /api/inbox_ops/emails/{id}/reprocess | inbox_ops_post_api_inbox_ops_emails_id_reprocess | 200,401,403,404,409 |
| GET | /api/inbox_ops/emails/{id} | inbox_ops_get_api_inbox_ops_emails_id | 200,401,403,404 |
| DELETE | /api/inbox_ops/emails/{id} | inbox_ops_delete_api_inbox_ops_emails_id | 200,401,403,404 |
| GET | /api/inbox_ops/emails | inbox_ops_get_api_inbox_ops_emails | 200,401,403 |
| POST | /api/inbox_ops/extract | inbox_ops_post_api_inbox_ops_extract | 200,400,401,403 |
| POST | /api/inbox_ops/proposals/{id}/accept-all | inbox_ops_post_api_inbox_ops_proposals_id_accept_all | 200,401,403,404 |
| POST | /api/inbox_ops/proposals/{id}/actions/{actionId}/accept | inbox_ops_post_api_inbox_ops_proposals_id_actions_actionId_accept | 200,401,403,404,409 |
| PATCH | /api/inbox_ops/proposals/{id}/actions/{actionId}/complete | inbox_ops_patch_api_inbox_ops_proposals_id_actions_actionId_complete | 200,400,401,403,404,409 |
| POST | /api/inbox_ops/proposals/{id}/actions/{actionId}/reject | inbox_ops_post_api_inbox_ops_proposals_id_actions_actionId_reject | 200,401,403,404,409 |
| PATCH | /api/inbox_ops/proposals/{id}/actions/{actionId} | inbox_ops_patch_api_inbox_ops_proposals_id_actions_actionId | 200,401,403,404,409 |
| POST | /api/inbox_ops/proposals/{id}/categorize | inbox_ops_post_api_inbox_ops_proposals_id_categorize | 200,400,401,403,404 |
| POST | /api/inbox_ops/proposals/{id}/reject | inbox_ops_post_api_inbox_ops_proposals_id_reject | 200,401,403,404 |
| POST | /api/inbox_ops/proposals/{id}/replies/{replyId}/send | inbox_ops_post_api_inbox_ops_proposals_id_replies_replyId_send | 200,400,401,403,404,409,502,503 |
| GET | /api/inbox_ops/proposals/{id} | inbox_ops_get_api_inbox_ops_proposals_id | 200,401,403,404 |
| POST | /api/inbox_ops/proposals/{id}/translate | inbox_ops_post_api_inbox_ops_proposals_id_translate | 200,400,401,403,404 |
| GET | /api/inbox_ops/proposals/counts | inbox_ops_get_api_inbox_ops_proposals_counts | 200,401,403 |
| GET | /api/inbox_ops/proposals | inbox_ops_get_api_inbox_ops_proposals | 200,401,403 |
| GET | /api/inbox_ops/settings | inbox_ops_get_api_inbox_ops_settings | 200,401,403 |
| PATCH | /api/inbox_ops/settings | inbox_ops_patch_api_inbox_ops_settings | 200,401,403 |
| POST | /api/payment_gateways/cancel | payment_gateways_post_api_payment_gateways_cancel | 200,401,403,409,422,502 |
| POST | /api/payment_gateways/capture | payment_gateways_post_api_payment_gateways_capture | 200,401,403,409,422,502 |
| GET | /api/payment_gateways/providers/{providerKey} | payment_gateways_get_api_payment_gateways_providers_providerKey | 200,401,403,404 |
| GET | /api/payment_gateways/providers | payment_gateways_get_api_payment_gateways_providers | 200,401,403 |
| POST | /api/payment_gateways/refund | payment_gateways_post_api_payment_gateways_refund | 200,401,403,409,422,502 |
| POST | /api/payment_gateways/sessions | payment_gateways_post_api_payment_gateways_sessions | 201,401,403,409,422,502 |
| GET | /api/payment_gateways/status | payment_gateways_get_api_payment_gateways_status | 200,400,401,403,404 |
| POST | /api/payment_gateways/status | payment_gateways_post_api_payment_gateways_status | 200,401,403,404,422,502 |
| GET | /api/payment_gateways/transactions/{id} | payment_gateways_get_api_payment_gateways_transactions_id | 200,401,403,404 |
| GET | /api/payment_gateways/transactions | payment_gateways_get_api_payment_gateways_transactions | 200,401,403 |
| POST | /api/payment_gateways/webhook/{provider} | payment_gateways_post_api_payment_gateways_webhook_provider | 202,401,404,413 |
| GET | /api/checkout/links/{id} | checkout_get_api_checkout_links_id | 200,401,403 |
| PUT | /api/checkout/links/{id} | checkout_put_api_checkout_links_id | 200,401,403 |
| DELETE | /api/checkout/links/{id} | checkout_delete_api_checkout_links_id | 204,401,403 |
| GET | /api/checkout/links | checkout_get_api_checkout_links | 200,401,403 |
| POST | /api/checkout/links | checkout_post_api_checkout_links | 201,401,403 |
| GET | /api/checkout/pay/{slug} | checkout_get_api_checkout_pay_slug | 200 |
| GET | /api/checkout/pay/{slug}/status/{transactionId} | checkout_get_api_checkout_pay_slug_status_transactionId | 200 |
| POST | /api/checkout/pay/{slug}/submit | checkout_post_api_checkout_pay_slug_submit | 201,429,503 |
| POST | /api/checkout/pay/{slug}/verify-password | checkout_post_api_checkout_pay_slug_verify_password | 201,429,503 |
| GET | /api/checkout/templates/{id}/preview | checkout_get_api_checkout_templates_id_preview | 200,401,403 |
| GET | /api/checkout/templates/{id} | checkout_get_api_checkout_templates_id | 200,401,403 |
| PUT | /api/checkout/templates/{id} | checkout_put_api_checkout_templates_id | 200,401,403 |
| DELETE | /api/checkout/templates/{id} | checkout_delete_api_checkout_templates_id | 204,401,403 |
| GET | /api/checkout/templates | checkout_get_api_checkout_templates | 200,401,403 |
| POST | /api/checkout/templates | checkout_post_api_checkout_templates | 201,401,403 |
| GET | /api/checkout/transactions/{id} | checkout_get_api_checkout_transactions_id | 200,401,403 |
| GET | /api/checkout/transactions/by-gateway/{gatewayTransactionId} | checkout_get_api_checkout_transactions_by_gateway_gatewayTransactionId | 200,401,403 |
| GET | /api/checkout/transactions | checkout_get_api_checkout_transactions | 200,401,403 |
| POST | /api/documents/{id}/archive | documents_post_api_documents_id_archive | 200,400,401,403,404,409,422 |
| GET | /api/documents/{id}/attachments/{attachmentId} | documents_get_api_documents_id_attachments_attachmentId | 200,400,401,403,404,422,500,503 |
| DELETE | /api/documents/{id}/attachments/{attachmentId} | documents_delete_api_documents_id_attachments_attachmentId | 200,400,401,403,404,409,422 |
| POST | /api/documents/{id}/attachments | documents_post_api_documents_id_attachments | 201,400,401,403,413,422,503 |
| GET | /api/documents/{id}/collab-token | documents_get_api_documents_id_collab_token | 200,400,401,403,404,422 |
| POST | /api/documents/{id}/comments/access-check | documents_post_api_documents_id_comments_access_check | 200,400,401,403,413,422 |
| GET | /api/documents/{id}/comments | documents_get_api_documents_id_comments | 200,400,401,403,422 |
| POST | /api/documents/{id}/comments | documents_post_api_documents_id_comments | 201,400,401,403,413,422 |
| PATCH | /api/documents/{id}/comments | documents_patch_api_documents_id_comments | 200,400,401,403,404,409,413,422 |
| GET | /api/documents/{id}/content | documents_get_api_documents_id_content | 200,400,401,403,404,413,422 |
| PUT | /api/documents/{id}/content | documents_put_api_documents_id_content | 200,400,401,403,409,413,422 |
| POST | /api/documents/{id}/duplicate | documents_post_api_documents_id_duplicate | 201,400,401,403,404,422 |
| GET | /api/documents/{id}/export | documents_get_api_documents_id_export | 200,400,401,403,404,413,422,503 |
| POST | /api/documents/{id}/export | documents_post_api_documents_id_export | 200,400,401,403,404,413,422,503 |
| POST | /api/documents/{id}/favorite | documents_post_api_documents_id_favorite | 200,400,401,403,404,422 |
| DELETE | /api/documents/{id}/favorite | documents_delete_api_documents_id_favorite | 200,400,401,403,422 |
| DELETE | /api/documents/{id}/links/{linkId} | documents_delete_api_documents_id_links_linkId | 200,400,401,403,404,409,422 |
| GET | /api/documents/{id}/links | documents_get_api_documents_id_links | 200,400,401,403,413,422 |
| POST | /api/documents/{id}/links | documents_post_api_documents_id_links | 201,400,401,403,413,422,503 |
| GET | /api/documents/{id}/principals | documents_get_api_documents_id_principals | 200,400,401,403,422 |
| GET | /api/documents/{id} | documents_get_api_documents_id | 200,400,401,403,404,422 |
| PUT | /api/documents/{id} | documents_put_api_documents_id | 200,400,401,403,409,413,422 |
| DELETE | /api/documents/{id} | documents_delete_api_documents_id | 200,400,401,403,404,409,422 |
| GET | /api/documents/{id}/shares | documents_get_api_documents_id_shares | 200,400,401,403,422 |
| POST | /api/documents/{id}/shares | documents_post_api_documents_id_shares | 201,400,401,403,413,422 |
| PUT | /api/documents/{id}/shares | documents_put_api_documents_id_shares | 200,400,401,403,409,413,422 |
| DELETE | /api/documents/{id}/shares | documents_delete_api_documents_id_shares | 200,400,401,403,409,413,422 |
| POST | /api/documents/{id}/unarchive | documents_post_api_documents_id_unarchive | 200,400,401,403,404,409,422 |
| POST | /api/documents/{id}/versions/{versionId}/restore | documents_post_api_documents_id_versions_versionId_restore | 200,400,401,403,404,409,422 |
| GET | /api/documents/{id}/versions/{versionId} | documents_get_api_documents_id_versions_versionId | 200,400,401,403,404,422 |
| GET | /api/documents/{id}/versions | documents_get_api_documents_id_versions | 200,400,401,403,422 |
| POST | /api/documents/{id}/versions | documents_post_api_documents_id_versions | 201,400,401,403,413,422 |
| POST | /api/documents/{id}/watch | documents_post_api_documents_id_watch | 200,400,401,403,404,422 |
| DELETE | /api/documents/{id}/watch | documents_delete_api_documents_id_watch | 200,400,401,403,422 |
| GET | /api/documents/folders | documents_get_api_documents_folders | 200,400,401,403,422 |
| POST | /api/documents/folders | documents_post_api_documents_folders | 201,400,401,403,413,422 |
| PUT | /api/documents/folders | documents_put_api_documents_folders | 200,400,401,403,409,413,422 |
| DELETE | /api/documents/folders | documents_delete_api_documents_folders | 200,400,401,403,409,413,422 |
| POST | /api/documents/instantiate | documents_post_api_documents_instantiate | 201,400,401,403,404,409,413,422,503 |
| GET | /api/documents | documents_get_api_documents | 200,400,401,403,422 |
| POST | /api/documents | documents_post_api_documents | 201,400,401,403,413,422 |
| POST | /api/documents/templates/{templateId}/preview | documents_post_api_documents_templates_templateId_preview | 200,400,401,403,404,409,413,422,503 |
| GET | /api/documents/templates/{templateId} | documents_get_api_documents_templates_templateId | 200,400,401,403,404,422 |
| GET | /api/documents/templates | documents_get_api_documents_templates | 200,400,401,403,422 |
| POST | /api/documents/templates | documents_post_api_documents_templates | 201,400,401,403,413,422 |
| PUT | /api/documents/templates | documents_put_api_documents_templates | 200,400,401,403,409,413,422 |
| DELETE | /api/documents/templates | documents_delete_api_documents_templates | 200,400,401,403,409,413,422 |
| GET | /api/sync_akeneo/custom-fields | sync_akeneo_get_api_sync_akeneo_custom_fields | 200,401,403 |
| POST | /api/sync_akeneo/custom-fields | sync_akeneo_post_api_sync_akeneo_custom_fields | 201,401,403 |
| POST | /api/sync_akeneo/delete-products | sync_akeneo_post_api_sync_akeneo_delete_products | 201,401,403 |
| GET | /api/sync_akeneo/discovery | sync_akeneo_get_api_sync_akeneo_discovery | 200,401,403 |
| GET | /api/sync_akeneo/first-import | sync_akeneo_get_api_sync_akeneo_first_import | 200,401,403 |
| POST | /api/sync_akeneo/first-import | sync_akeneo_post_api_sync_akeneo_first_import | 201,401,403 |
| DELETE | /api/tillio/operators/{id} | tillio_delete_api_tillio_operators_id | 204,401,403 |
| GET | /api/tillio/operators | tillio_get_api_tillio_operators | 200,401,403 |
| POST | /api/tillio/operators | tillio_post_api_tillio_operators | 201,401,403 |
| GET | /api/tillio/pull | tillio_get_api_tillio_pull | 200,401,403 |
| POST | /api/tillio/pull | tillio_post_api_tillio_pull | 201,401,403 |
| POST | /api/shipping_carriers/cancel | shipping_carriers_post_api_shipping_carriers_cancel | 200,401,403,422,502 |
| GET | /api/shipping_carriers/points | shipping_carriers_get_api_shipping_carriers_points | 200,401,403,422,502 |
| GET | /api/shipping_carriers/providers | shipping_carriers_get_api_shipping_carriers_providers | 200,401,403 |
| POST | /api/shipping_carriers/rates | shipping_carriers_post_api_shipping_carriers_rates | 200,401,403,422,502 |
| POST | /api/shipping_carriers/shipments | shipping_carriers_post_api_shipping_carriers_shipments | 201,401,403,409,422,502 |
| POST | /api/shipping_carriers/tracking/refresh | shipping_carriers_post_api_shipping_carriers_tracking_refresh | 200,401,403,422,502 |
| GET | /api/shipping_carriers/tracking | shipping_carriers_get_api_shipping_carriers_tracking | 200,401,403,404,422,502 |
| POST | /api/shipping_carriers/webhook/{provider} | shipping_carriers_post_api_shipping_carriers_webhook_provider | 202,401,404,413 |
| GET | /api/eudr/dashboard/widgets/compliance-overview | eudr_get_api_eudr_dashboard_widgets_compliance_overview | 200,400,401,403,500 |
| GET | /api/eudr/evidence-submissions | eudr_get_api_eudr_evidence_submissions | 200,401,403 |
| POST | /api/eudr/evidence-submissions | eudr_post_api_eudr_evidence_submissions | 201,401,403 |
| PUT | /api/eudr/evidence-submissions | eudr_put_api_eudr_evidence_submissions | 200,401,403 |
| DELETE | /api/eudr/evidence-submissions | eudr_delete_api_eudr_evidence_submissions | 200,401,403 |
| GET | /api/eudr/mitigation-actions | eudr_get_api_eudr_mitigation_actions | 200,401,403 |
| POST | /api/eudr/mitigation-actions | eudr_post_api_eudr_mitigation_actions | 201,401,403 |
| PUT | /api/eudr/mitigation-actions | eudr_put_api_eudr_mitigation_actions | 200,401,403 |
| DELETE | /api/eudr/mitigation-actions | eudr_delete_api_eudr_mitigation_actions | 200,401,403 |
| POST | /api/eudr/plots/import | eudr_post_api_eudr_plots_import | 200,400,401,403,500 |
| GET | /api/eudr/plots | eudr_get_api_eudr_plots | 200,401,403 |
| POST | /api/eudr/plots | eudr_post_api_eudr_plots | 201,401,403 |
| PUT | /api/eudr/plots | eudr_put_api_eudr_plots | 200,401,403 |
| DELETE | /api/eudr/plots | eudr_delete_api_eudr_plots | 200,401,403 |
| GET | /api/eudr/product-mappings | eudr_get_api_eudr_product_mappings | 200,401,403 |
| POST | /api/eudr/product-mappings | eudr_post_api_eudr_product_mappings | 201,401,403 |
| PUT | /api/eudr/product-mappings | eudr_put_api_eudr_product_mappings | 200,401,403 |
| DELETE | /api/eudr/product-mappings | eudr_delete_api_eudr_product_mappings | 200,401,403 |
| POST | /api/eudr/product-mappings/suggestions/apply | eudr_post_api_eudr_product_mappings_suggestions_apply | 200,400,401,403,500 |
| GET | /api/eudr/product-mappings/suggestions | eudr_get_api_eudr_product_mappings_suggestions | 200,400,401,403,500 |
| GET | /api/eudr/reports/annual | eudr_get_api_eudr_reports_annual | 200,400,401,403,500 |
| GET | /api/eudr/risk-assessments | eudr_get_api_eudr_risk_assessments | 200,401,403 |
| POST | /api/eudr/risk-assessments | eudr_post_api_eudr_risk_assessments | 201,401,403 |
| PUT | /api/eudr/risk-assessments | eudr_put_api_eudr_risk_assessments | 200,401,403 |
| DELETE | /api/eudr/risk-assessments | eudr_delete_api_eudr_risk_assessments | 200,401,403 |
| GET | /api/eudr/statements/{id}/export | eudr_get_api_eudr_statements_id_export | 200,401,403,404 |
| GET | /api/eudr/statements/{id}/readiness | eudr_get_api_eudr_statements_id_readiness | 200,401,403,404 |
| GET | /api/eudr/statements | eudr_get_api_eudr_statements | 200,401,403 |
| POST | /api/eudr/statements | eudr_post_api_eudr_statements | 201,401,403 |
| PUT | /api/eudr/statements | eudr_put_api_eudr_statements | 200,401,403 |
| DELETE | /api/eudr/statements | eudr_delete_api_eudr_statements | 200,401,403 |
| GET | /api/eudr/suppliers/compliance | eudr_get_api_eudr_suppliers_compliance | 200,400,401,403,500 |
| POST | /api/webhooks/{id}/rotate-secret | webhooks_post_api_webhooks_id_rotate_secret | 200,401,403,404 |
| GET | /api/webhooks/{id} | webhooks_get_api_webhooks_id | 200,401,403,404 |
| PUT | /api/webhooks/{id} | webhooks_put_api_webhooks_id | 200,400,401,403,404 |
| DELETE | /api/webhooks/{id} | webhooks_delete_api_webhooks_id | 200,401,403,404 |
| POST | /api/webhooks/{id}/test | webhooks_post_api_webhooks_id_test | 200,400,401,403,404,409 |
| POST | /api/webhooks/deliveries/{id}/retry | webhooks_post_api_webhooks_deliveries_id_retry | 200,401,403,404,409 |
| GET | /api/webhooks/deliveries/{id} | webhooks_get_api_webhooks_deliveries_id | 200,401,403,404 |
| GET | /api/webhooks/deliveries | webhooks_get_api_webhooks_deliveries | 200,400,401,403 |
| GET | /api/webhooks/events | webhooks_get_api_webhooks_events | 200,401,403 |
| POST | /api/webhooks/inbound/{endpointId} | webhooks_post_api_webhooks_inbound_endpointId | 200,400,401,404,413,429,503 |
| GET | /api/webhooks | webhooks_get_api_webhooks | 200,400,401,403 |
| POST | /api/webhooks | webhooks_post_api_webhooks | 201,400,401,403 |
| POST | /api/webhooks/webhook-deliveries/{id}/retry | webhooks_post_api_webhooks_webhook_deliveries_id_retry | 200,401,403,404,409 |
| GET | /api/webhooks/webhook-deliveries/{id} | webhooks_get_api_webhooks_webhook_deliveries_id | 200,401,403,404 |
| GET | /api/webhooks/webhook-deliveries | webhooks_get_api_webhooks_webhook_deliveries | 200,400,401,403 |
| POST | /api/webhooks/webhooks/{id}/rotate-secret | webhooks_post_api_webhooks_webhooks_id_rotate_secret | 200,401,403,404 |
| GET | /api/webhooks/webhooks/{id} | webhooks_get_api_webhooks_webhooks_id | 200,401,403,404 |
| PUT | /api/webhooks/webhooks/{id} | webhooks_put_api_webhooks_webhooks_id | 200,400,401,403,404 |
| DELETE | /api/webhooks/webhooks/{id} | webhooks_delete_api_webhooks_webhooks_id | 200,401,403,404 |
| POST | /api/webhooks/webhooks/{id}/test | webhooks_post_api_webhooks_webhooks_id_test | 200,400,401,403,404,409 |
| GET | /api/webhooks/webhooks | webhooks_get_api_webhooks_webhooks | 200,400,401,403 |
| POST | /api/webhooks/webhooks | webhooks_post_api_webhooks_webhooks | 201,400,401,403 |
| PUT | /api/webhooks/webhooks | webhooks_put_api_webhooks_webhooks | 200,400,401,403,404 |
| DELETE | /api/webhooks/webhooks | webhooks_delete_api_webhooks_webhooks | 200,401,403,404 |
| POST | /api/telemetry/browser-traces | telemetry_post_api_telemetry_browser_traces | 201,401 |
| POST | /api/ratelimit_probe/ping | ratelimit_probe_post_api_ratelimit_probe_ping | 200,429 |
