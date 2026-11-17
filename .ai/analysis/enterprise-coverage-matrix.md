# Page coverage matrix

Generated: 2026-11-17T12:17:37.964Z
Inventory commit: `71c54aba96613d7b3d28061d6e809bbd4ef10215`

## Totals

| Metric | Value |
| --- | --- |
| Declared pages | 319 |
| Render-evidenced | 318 |
| Defects | 0 |
| Observations | 1 |
| Page API references (distinct per page) | 169 |
| Resolved against OpenAPI | 157 |
| Unresolved references | 0 |
| Not probed safely (POST-only / side effects) | 12 |
| Gaps | 0 |
| Backend module routes | 290 |
| OpenAPI operations | 1006 |
| Frontend routes | 29 |
| Unresolved metadata | 12 |

## By class

| Class | Total | Evidenced | Defects | Observations | Gaps |
| --- | --- | --- | --- | --- | --- |
| backend-profile | 1 | 1 | 0 | 0 | 0 |
| backend-business | 123 | 123 | 0 | 0 | 0 |
| backend-create-edit | 68 | 68 | 0 | 0 | 0 |
| backend-settings | 37 | 37 | 0 | 0 | 0 |
| backend-detail-dynamic | 61 | 61 | 0 | 0 | 0 |
| frontend-public | 9 | 8 | 0 | 1 | 0 |
| frontend-other | 2 | 2 | 0 | 0 | 0 |
| frontend-portal | 15 | 15 | 0 | 0 | 0 |
| frontend-pay | 3 | 3 | 0 | 0 | 0 |

## Backend contract evidence

Static references are matched against the generated OpenAPI paths
(595 paths); query strings are stripped and {param}
placeholders are matched as one path segment. A reference is evidence that the
page names the endpoint, not that the page calls it at runtime.

| Contract status | Pages |
| --- | --- |
| all references exist in OpenAPI | 78 |
| resolved, but at least one reference not probeable safely (POST-only) | 10 |
| at least one reference is missing | 0 |
| no API reference extracted | 231 |

No page references a confirmed-missing endpoint.

## Page evidence (all pages)

| Class | Route | Evidence | Contract |
| --- | --- | --- | --- |
| backend-profile | `/backend/auth/profile` | evidenced (rendered) | resolved |
| backend-business | `/backend/profile/change-password` | evidenced (rendered) | resolved |
| backend-business | `/backend/profile` | evidenced (rendered) | no-references |
| backend-business | `/backend/roles` | evidenced (rendered) | no-references |
| backend-business | `/backend/settings` | evidenced (rendered) | no-references |
| backend-business | `/backend/sidebar-customization` | evidenced (rendered) | no-references |
| backend-business | `/backend/users` | evidenced (rendered) | no-references |
| backend-business | `/backend/directory/branding` | evidenced (rendered) | resolved |
| backend-business | `/backend/directory/organizations` | evidenced (rendered) | resolved |
| backend-business | `/backend/directory/tenants` | evidenced (rendered) | resolved |
| backend-business | `/backend/calendar` | evidenced (rendered) | no-references |
| backend-business | `/backend/customer-tasks` | evidenced (rendered) | no-references |
| backend-business | `/backend/customers/companies` | evidenced (rendered) | no-references |
| backend-business | `/backend/customers/deals/map` | evidenced (rendered) | no-references |
| backend-business | `/backend/customers/deals` | evidenced (rendered) | resolved |
| backend-business | `/backend/customers/deals/pipeline` | evidenced (rendered) | resolved |
| backend-business | `/backend/customers/people` | evidenced (rendered) | no-references |
| backend-business | `/backend/entities/system` | evidenced (rendered) | no-references |
| backend-business | `/backend/entities/user` | evidenced (rendered) | no-references |
| backend-business | `/backend/query-indexes` | evidenced (rendered) | no-references |
| backend-business | `/backend/audit-logs` | evidenced (rendered) | no-references |
| backend-business | `/backend/storage/attachments` | evidenced (rendered) | no-references |
| backend-business | `/backend/catalog/categories` | evidenced (rendered) | no-references |
| backend-business | `/backend/catalog/prices` | evidenced (rendered) | no-references |
| backend-business | `/backend/catalog/products` | evidenced (rendered) | no-references |
| backend-business | `/backend/sales/channels/offers` | evidenced (rendered) | no-references |
| backend-business | `/backend/sales/channels` | evidenced (rendered) | no-references |
| backend-business | `/backend/sales/orders` | evidenced (rendered) | no-references |
| backend-business | `/backend/sales/quotes` | evidenced (rendered) | no-references |
| backend-business | `/backend/warranty_claims` | evidenced (rendered) | resolved |
| backend-business | `/backend/warranty_claims/registrations` | evidenced (rendered) | no-references |
| backend-business | `/backend/warranty_claims/settings` | evidenced (rendered) | resolved |
| backend-business | `/backend/warranty_claims/troubleshooting-guides` | evidenced (rendered) | no-references |
| backend-business | `/backend/warranty_claims/vendor-policies` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/inventory` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/locations` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/lots` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/movements` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/reservations` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/warehouses` | evidenced (rendered) | no-references |
| backend-business | `/backend/wms/zones` | evidenced (rendered) | no-references |
| backend-business | `/backend/api-keys` | evidenced (rendered) | no-references |
| backend-business | `/backend/devices` | evidenced (rendered) | no-references |
| backend-business | `/backend/docs` | evidenced (rendered) | no-references |
| backend-business | `/backend/logs` | evidenced (rendered) | no-references |
| backend-business | `/backend/rules` | evidenced (rendered) | resolved |
| backend-business | `/backend/sets` | evidenced (rendered) | resolved |
| backend-business | `/backend/feature-toggles/global` | evidenced (rendered) | no-references |
| backend-business | `/backend/feature-toggles/overrides` | evidenced (rendered) | no-references |
| backend-business | `/backend/definitions` | evidenced (rendered) | resolved |
| backend-business | `/backend/definitions/visual-editor` | evidenced (rendered) | resolved |
| backend-business | `/backend/events` | evidenced (rendered) | no-references |
| backend-business | `/backend/instances/failure-queue` | evidenced (rendered) | resolved |
| backend-business | `/backend/instances` | evidenced (rendered) | no-references |
| backend-business | `/backend/tasks` | evidenced (rendered) | no-references |
| backend-business | `/backend/work-inbox` | evidenced (rendered) | resolved |
| backend-business | `/backend/currencies` | evidenced (rendered) | resolved |
| backend-business | `/backend/exchange-rates` | evidenced (rendered) | resolved |
| backend-business | `/backend/planner/availability-rulesets` | evidenced (rendered) | no-references |
| backend-business | `/backend/resources/resource-types` | evidenced (rendered) | no-references |
| backend-business | `/backend/resources/resources` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/leave-requests` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/my-availability` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/my-leave-requests` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/team-members` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/team-roles` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/teams` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/time-tracking/board` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking/entries` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking/projects` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking/reports` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking/settings` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/time-tracking/timesheet` | evidenced (rendered) | resolved |
| backend-business | `/backend/staff/timesheets` | evidenced (rendered) | no-references |
| backend-business | `/backend/staff/timesheets/projects` | evidenced (rendered) | no-references |
| backend-business | `/backend/notifications/user-preferences` | evidenced (rendered) | no-references |
| backend-business | `/backend/profile/notification-preferences` | evidenced (rendered) | no-references |
| backend-business | `/backend/integrations` | evidenced (rendered) | no-references |
| backend-business | `/backend/data-sync` | evidenced (rendered) | resolved-with-unverified |
| backend-business | `/backend/messages/compose` | evidenced (not-found-state) | no-references |
| backend-business | `/backend/messages` | evidenced (rendered) | no-references |
| backend-business | `/backend/communication_channels/channels` | evidenced (rendered) | no-references |
| backend-business | `/backend/profile/communication-channels` | evidenced (rendered) | resolved |
| backend-business | `/backend/push_notifications` | evidenced (rendered) | no-references |
| backend-business | `/backend/push_notifications/send` | evidenced (rendered) | resolved |
| backend-business | `/backend/phone_calls` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype/accounts/detail` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype/accounts` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype/candidates` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype/drafts` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype` | evidenced (rendered) | no-references |
| backend-business | `/backend/prototype/tasks` | evidenced (rendered) | no-references |
| backend-business | `/backend/communications/channels/connect` | evidenced (rendered) | no-references |
| backend-business | `/backend/communications/channels` | evidenced (rendered) | no-references |
| backend-business | `/backend/communications/exceptions` | evidenced (rendered) | no-references |
| backend-business | `/backend/communications/inbox` | evidenced (rendered) | no-references |
| backend-business | `/backend/workbench` | evidenced (rendered) | no-references |
| backend-business | `/backend/business` | evidenced (rendered) | no-references |
| backend-business | `/backend/manage` | evidenced (rendered) | no-references |
| backend-business | `/backend/leadgen/candidates` | evidenced (rendered) | no-references |
| backend-business | `/backend/leadgen/suppressions` | evidenced (rendered) | no-references |
| backend-business | `/backend/inbox-ops/log` | evidenced (rendered) | no-references |
| backend-business | `/backend/inbox-ops` | evidenced (rendered) | resolved |
| backend-business | `/backend/inbox-ops/settings` | evidenced (rendered) | resolved |
| backend-business | `/backend/payment-gateways` | evidenced (rendered) | resolved |
| backend-business | `/backend/checkout/pay-links` | evidenced (rendered) | no-references |
| backend-business | `/backend/checkout/templates` | evidenced (rendered) | no-references |
| backend-business | `/backend/checkout/transactions` | evidenced (rendered) | no-references |
| backend-business | `/backend/checkout` | evidenced (rendered) | no-references |
| backend-business | `/backend/documents` | evidenced (rendered) | no-references |
| backend-business | `/backend/documents/templates` | evidenced (rendered) | no-references |
| backend-business | `/backend/eudr/evidence-submissions` | evidenced (rendered) | no-references |
| backend-business | `/backend/eudr` | evidenced (rendered) | resolved |
| backend-business | `/backend/eudr/plots` | evidenced (rendered) | resolved |
| backend-business | `/backend/eudr/product-mappings` | evidenced (rendered) | no-references |
| backend-business | `/backend/eudr/risk-assessments` | evidenced (rendered) | no-references |
| backend-business | `/backend/eudr/statements` | evidenced (rendered) | no-references |
| backend-business | `/backend/webhooks` | evidenced (rendered) | no-references |
| backend-business | `/backend/customer_accounts/roles` | evidenced (rendered) | no-references |
| backend-business | `/backend/customer_accounts/settings/domain` | evidenced (rendered) | resolved-with-unverified |
| backend-business | `/backend/customer_accounts/settings` | evidenced (rendered) | no-references |
| backend-business | `/backend/customer_accounts/users` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/roles/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/users/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/roles/[id]/edit` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/users/[id]/edit` | evidenced (not-found-state) | resolved |
| backend-create-edit | `/backend/directory/organizations/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/directory/tenants/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/directory/organizations/[id]/edit` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/directory/tenants/[id]/edit` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/customers/companies/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/customers/deals/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/customers/people/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/entities/user/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/entities/user/[entityId]/records/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/catalog/categories/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/catalog/prices/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/catalog/products/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/catalog/categories/[id]/edit` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/catalog/prices/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/catalog/products/[productId]/variants/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/sales/channels/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/sales/documents/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/sales/channels/[channelId]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/sales/channels/[channelId]/offers/[offerId]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/sales/channels/[channelId]/offers/create` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/warranty_claims/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/warranty_claims/registrations/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/warranty_claims/troubleshooting-guides/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/warranty_claims/vendor-policies/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/warranty_claims/[id]/edit` | evidenced (not-found-state) | resolved |
| backend-create-edit | `/backend/warranty_claims/registrations/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/warranty_claims/troubleshooting-guides/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/warranty_claims/vendor-policies/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/api-keys/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/devices/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/rules/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/sets/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/feature-toggles/global/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/feature-toggles/global/[id]/edit` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/definitions/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/currencies/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/exchange-rates/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/planner/availability-rulesets/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/resources/resource-types/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/resources/resources/create` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/resources/resource-types/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/staff/leave-requests/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/staff/my-leave-requests/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/staff/profile/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/staff/team-members/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/staff/team-roles/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/staff/teams/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/staff/time-tracking/projects/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/staff/time-tracking/reports/create` | evidenced (rendered) | resolved |
| backend-create-edit | `/backend/staff/timesheets/projects/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/staff/team-roles/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/staff/teams/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/staff/time-tracking/projects/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/staff/timesheets/projects/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-create-edit | `/backend/checkout/pay-links/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/checkout/templates/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/shipping-carriers/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/eudr/evidence-submissions/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/eudr/plots/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/eudr/product-mappings/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/eudr/risk-assessments/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/eudr/statements/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/webhooks/create` | evidenced (rendered) | no-references |
| backend-create-edit | `/backend/customer_accounts/roles/create` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/customers/deals` | evidenced (rendered) | resolved |
| backend-settings | `/backend/config/customers` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/customers/pipeline-stages` | evidenced (rendered) | resolved |
| backend-settings | `/backend/config/encryption` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/settings` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/cache` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/module-telemetry` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/system-status` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/attachments` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/catalog` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/sales` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/wms` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/dictionaries` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/workflows` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/search` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/currency-fetching` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/notifications` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/agents` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/allowlist` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/legacy` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/moderation-flags` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/playground` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/settings` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/usage` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-assistant/models` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/system-update` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-write-approvals` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/modules` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/home` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/navigation` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/ai-agents` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/translations` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/scheduled-jobs/new` | evidenced (rendered) | no-references |
| backend-settings | `/backend/config/scheduled-jobs` | evidenced (rendered) | resolved |
| backend-settings | `/backend/config/scheduled-jobs/[id]/edit` | evidenced (not-found-state) | no-references |
| backend-settings | `/backend/config/scheduled-jobs/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/customers/companies-v2/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/customers/companies/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/customers/deals/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/customers/people-v2/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/customers/people/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/entities/system/[entityId]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/entities/user/[entityId]` | evidenced (rendered) | resolved-with-unverified |
| backend-detail-dynamic | `/backend/entities/user/[entityId]/records/[recordId]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/entities/user/[entityId]/records` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/catalog/products/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/catalog/products/[productId]/variants/[variantId]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/sales/documents/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/sales/orders/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/sales/quotes/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/warranty_claims/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/wms/location/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/wms/lot/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/wms/sku/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/devices/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/logs/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/rules/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/sets/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/feature-toggles/global/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/definitions/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/events/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/instances/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/tasks/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/currencies/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/exchange-rates/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/planner/availability-rulesets/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/resources/resources/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/staff/leave-requests/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/staff/my-leave-requests/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/staff/team-members/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/staff/time-tracking/projects/[id]/board` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/staff/time-tracking/projects/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/staff/time-tracking/reports/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/staff/timesheets/projects/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/integrations/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/integrations/bundle/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/data-sync/runs/[id]` | evidenced (not-found-state) | resolved |
| backend-detail-dynamic | `/backend/messages/[id]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/communication_channels/channels/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/push_notifications/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/communications/inbox/[thread]/before/[cursor]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/communications/inbox/[thread]` | evidenced (denied) | no-references |
| backend-detail-dynamic | `/backend/business/[category]` | evidenced (rendered) | no-references |
| backend-detail-dynamic | `/backend/inbox-ops/proposals/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/checkout/pay-links/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/checkout/templates/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/checkout/templates/[id]/preview` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/checkout/transactions/[id]` | evidenced (rendered) | resolved |
| backend-detail-dynamic | `/backend/documents/[id]` | evidenced (denied) | no-references |
| backend-detail-dynamic | `/backend/eudr/evidence-submissions/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/eudr/plots/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/eudr/product-mappings/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/eudr/risk-assessments/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/eudr/statements/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/webhooks/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/customer_accounts/roles/[id]` | evidenced (not-found-state) | no-references |
| backend-detail-dynamic | `/backend/customer_accounts/users/[id]` | evidenced (not-found-state) | no-references |
| frontend-public | `/reset/[token]` | evidenced (rendered) | resolved-with-unverified |
| frontend-public | `/login` | evidenced (rendered) | resolved |
| frontend-public | `/reset` | evidenced (rendered) | resolved-with-unverified |
| frontend-public | `/privacy` | evidenced (rendered) | no-references |
| frontend-public | `/terms` | evidenced (rendered) | no-references |
| frontend-public | `/onboarding` | evidenced (rendered) | no-references |
| frontend-public | `/onboarding/preparing` | evidenced (rendered) | no-references |
| frontend-public | `/docs/api` | observation (navigation-failure) | resolved |
| frontend-public | `/checkout-demo` | evidenced (rendered) | resolved |
| frontend-other | `/quote/[token]` | evidenced (rendered) | resolved |
| frontend-other | `/messages/view/[token]` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/claims/[id]` | evidenced (rendered) | resolved |
| frontend-portal | `/[orgSlug]/portal/claims/new` | evidenced (rendered) | resolved |
| frontend-portal | `/[orgSlug]/portal/claims` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/tasks/[id]` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/tasks` | evidenced (rendered) | resolved |
| frontend-portal | `/[orgSlug]/portal/time-reports/[id]` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/time-reports` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/dashboard` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/invite` | evidenced (rendered) | resolved-with-unverified |
| frontend-portal | `/[orgSlug]/portal/login` | evidenced (rendered) | resolved-with-unverified |
| frontend-portal | `/[orgSlug]/portal` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/profile` | evidenced (rendered) | no-references |
| frontend-portal | `/[orgSlug]/portal/reset-password` | evidenced (rendered) | resolved-with-unverified |
| frontend-portal | `/[orgSlug]/portal/signup` | evidenced (rendered) | resolved-with-unverified |
| frontend-portal | `/[orgSlug]/portal/verify` | evidenced (rendered) | resolved-with-unverified |
| frontend-pay | `/pay/[slug]/cancel/[transactionId]` | evidenced (rendered) | no-references |
| frontend-pay | `/pay/[slug]` | evidenced (not-found-state) | no-references |
| frontend-pay | `/pay/[slug]/success/[transactionId]` | evidenced (rendered) | no-references |

## Observations

- `/docs/api` — navigation-failure (public-audit); access/behaviour to confirm, not a confirmed page defect.

## Gaps (next sweeps)

| Route | Module | Reason |
| --- | --- | --- |
| - | - | - |

## Evidence sources

- authorized-navigation sweep: `.ai/analysis/enterprise-page-render-findings.json`
- dynamic placeholder sweep: `.ai/analysis/enterprise-dynamic-page-audit-after.json`
- public/portal/pay sweep: `.ai/analysis/enterprise-public-page-audit.json`
- direct gap sweep: `.ai/analysis/enterprise-direct-page-audit.json`
- contract check: `.mercato/generated/openapi.generated.json`
- inventory contract: `.ai/analysis/enterprise-inventory-baseline.json`

Render evidence is not business acceptance: a page that renders may still reject a
write, and API references are static literals unless a runtime test says otherwise.
