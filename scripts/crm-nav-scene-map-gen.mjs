#!/usr/bin/env node
/**
 * Generate the CRM scene map from an explicit, per-entry decision table.
 *
 * The left rail now has five scenes (工作台 / AI助手 / 客户 / 业务 / 消息) plus
 * 管理中心 and 个人账户. Every entry the server currently serves still needs an
 * owner, so this file states where each href goes:
 *
 *   scene     -> one of the five primary scenes
 *   manage    -> the management centre (with a category)
 *   personal  -> the account area
 *   action    -> an in-page action (create/import/export); not a nav destination
 *
 * The table is exact-href, not prefix fallback: `crm-nav-scene-check.mjs` fails
 * on any live entry the map does not name, so a new module cannot silently leak
 * into a "misc" bucket. Regenerate only after reviewing the payload diff:
 *
 *   node scripts/crm-nav-scene-map-gen.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ADMIN = path.join(ROOT, 'docs/crm-platform/appendix/nav-admin.json')
const SUPERADMIN = path.join(ROOT, 'docs/crm-platform/appendix/nav-superadmin.json')
const OUT = path.join(ROOT, 'src/nav/scene-map.json')

/** scene -> category -> hrefs */
const BUSINESS = {
  sales: ['/backend/sales/quotes', '/backend/sales/orders', '/backend/sales/channels', '/backend/sales/channels/offers'],
  catalog: ['/backend/catalog/products', '/backend/catalog/prices', '/backend/catalog/categories'],
  inventory: [
    '/backend/wms',
    '/backend/wms/inventory',
    '/backend/wms/warehouses',
    '/backend/wms/zones',
    '/backend/wms/locations',
    '/backend/wms/lots',
    '/backend/wms/movements',
    '/backend/wms/reservations',
  ],
  fulfillment: [
    '/backend/checkout/pay-links',
    '/backend/checkout/templates',
    '/backend/checkout/transactions',
    '/backend/warranty_claims',
    '/backend/warranty_claims/vendor-policies',
    '/backend/warranty_claims/registrations',
    '/backend/warranty_claims/troubleshooting-guides',
    '/backend/eudr',
    '/backend/eudr/product-mappings',
    '/backend/eudr/plots',
    '/backend/eudr/statements',
    '/backend/eudr/evidence-submissions',
    '/backend/eudr/risk-assessments',
  ],
  finance: ['/backend/rules', '/backend/sets', '/backend/logs'],
  team: [
    '/backend/resources/resource-types',
    '/backend/resources/resources',
    '/backend/staff/teams',
    '/backend/staff/team-members',
    '/backend/staff/team-roles',
    '/backend/staff/leave-requests',
    '/backend/staff/my-leave-requests',
    '/backend/staff/my-availability',
    '/backend/staff/time-tracking',
    '/backend/staff/time-tracking/projects',
    '/backend/staff/time-tracking/board',
    '/backend/staff/time-tracking/entries',
    '/backend/staff/time-tracking/timesheet',
    '/backend/staff/time-tracking/reports',
  ],
  automation: [
    '/backend/definitions',
    '/backend/definitions/visual-editor',
    '/backend/instances',
    '/backend/instances/failure-queue',
    '/backend/events',
    '/backend/work-inbox',
  ],
  content: ['/backend/documents', '/backend/documents/templates', '/backend/storage/attachments'],
}

const CUSTOMERS = {
  companies: ['/backend/customers/companies'],
  people: ['/backend/customers/people'],
  deals: ['/backend/customers/deals'],
  insights: ['/backend/customers/deals/map', '/backend/customers/deals/pipeline'],
  followup: ['/backend/customer-tasks', '/backend/calendar'],
}

const MESSAGES = [
  '/backend/messages',
  '/backend/inbox-ops',
  '/backend/communication_channels/channels',
  '/backend/phone_calls',
]

const PROFILE = ['/backend/profile/change-password', '/backend/profile/communication-channels', '/backend/profile/notification-preferences']

const WORKBENCH = ['/backend/workbench']

const MANAGE = {
  system: ['/backend/config/system-status', '/backend/config/module-telemetry', '/backend/config/modules', '/backend/config/cache', '/backend/config/system-update'],
  access: [
    '/backend/users',
    '/backend/roles',
    '/backend/api-keys',
    '/backend/devices',
    '/backend/notifications/user-preferences',
    '/backend/directory/branding',
    '/backend/directory/organizations',
    '/backend/directory/tenants',
  ],
  portal: ['/backend/customer_accounts/users', '/backend/customer_accounts/roles', '/backend/customer_accounts/settings', '/backend/customer_accounts/settings/domain'],
  data: [
    '/backend/entities/system',
    '/backend/entities/user',
    '/backend/query-indexes',
    '/backend/webhooks',
    '/backend/integrations',
    '/backend/data-sync',
    '/backend/payment-gateways',
    '/backend/push_notifications',
    '/backend/push_notifications/send',
  ],
  moduleConfigs: [
    '/backend/config/sales',
    '/backend/config/catalog',
    '/backend/config/customers',
    '/backend/config/customers/pipeline-stages',
    '/backend/config/dictionaries',
    '/backend/config/settings',
    '/backend/config/encryption',
    '/backend/config/translations',
    '/backend/config/notifications',
    '/backend/config/attachments',
    '/backend/config/workflows',
    '/backend/config/scheduled-jobs',
    '/backend/config/wms',
    '/backend/config/search',
    '/backend/planner/availability-rulesets',
    '/backend/staff/time-tracking/settings',
  ],
  ai: [
    '/backend/config/ai-assistant/agents',
    '/backend/config/ai-assistant/settings',
    '/backend/config/ai-assistant/usage',
    '/backend/config/ai-assistant/playground',
    '/backend/config/ai-assistant/models',
    '/backend/config/ai-assistant/legacy',
    '/backend/config/ai-assistant/allowlist',
    '/backend/config/ai-assistant/moderation-flags',
    '/backend/config/ai-agents',
  ],
  org: ['/backend/currencies', '/backend/exchange-rates', '/backend/config/currency-fetching'],
  dev: ['/backend/feature-toggles/global', '/backend/feature-toggles/overrides', '/backend/sidebar-customization', '/backend/docs'],
  security: ['/backend/audit-logs'],
  'business-config': ['/backend/config/customers/deals', '/backend/warranty_claims/settings'],
}

/** Create forms that already have a button on their list page. */
const PAGE_ACTIONS = ['/backend/resources/resource-types/create', '/backend/definitions/create']

const entries = {}
const add = (href, spec) => {
  if (entries[href]) throw new Error(`duplicate map decision for ${href}`)
  entries[href] = spec
}
for (const href of WORKBENCH) add(href, { surface: 'workbench', disposition: 'nav' })
for (const [tab, hrefs] of Object.entries(CUSTOMERS)) {
  for (const href of hrefs) add(href, { surface: 'customers', tab: tab === 'followup' ? 'followup' : tab, disposition: 'nav' })
}
for (const [category, hrefs] of Object.entries(BUSINESS)) {
  for (const href of hrefs) add(href, { surface: 'business', category, disposition: 'nav' })
}
for (const href of MESSAGES) add(href, { surface: 'messages', disposition: 'nav' })
for (const href of PROFILE) add(href, { surface: 'personal', disposition: 'nav' })
for (const [category, hrefs] of Object.entries(MANAGE)) {
  for (const href of hrefs) add(href, { surface: 'manage', category, disposition: 'nav' })
}
for (const href of PAGE_ACTIONS) add(href, { surface: 'workbench', disposition: 'in-page-action' })

const map = {
  version: 1,
  generatedFrom: ['docs/crm-platform/appendix/nav-admin.json', 'docs/crm-platform/appendix/nav-superadmin.json'],
  scenes: [
    { id: 'workbench', label: '工作台', order: 10, href: '/backend/workbench', icon: 'LayoutDashboard' },
    { id: 'assistant', label: 'AI助手', order: 20, action: 'open-ai-assistant', icon: 'Sparkles' },
    { id: 'customers', label: '客户', order: 30, href: '/backend/customers/companies', icon: 'Users' },
    { id: 'business', label: '业务', order: 40, href: '/backend/business', icon: 'Briefcase' },
    { id: 'messages', label: '消息', order: 50, href: '/backend/messages', icon: 'MessageSquare' },
  ],
  utility: [
    { id: 'manage', label: '管理中心', href: '/backend/manage', icon: 'Settings' },
    { id: 'account', label: '个人账户', href: '/backend/profile', icon: 'UserCircle' },
  ],
  customers: {
    tabs: [
      { id: 'companies', label: '公司', href: '/backend/customers/companies' },
      { id: 'people', label: '联系人', href: '/backend/customers/people' },
      { id: 'deals', label: '商机', href: '/backend/customers/deals' },
    ],
    related: [
      { id: 'followup', label: '跟进', hrefs: CUSTOMERS.followup },
      { id: 'insights', label: '分析视图', hrefs: ['/backend/customers/deals/map', '/backend/customers/deals/pipeline'] },
    ],
  },
  businessPinned: [
    '/backend/sales/quotes',
    '/backend/sales/orders',
    '/backend/catalog/products',
    '/backend/wms',
    '/backend/warranty_claims',
    '/backend/definitions',
  ],
  businessCategories: [
    { id: 'sales', label: '销售', order: 10 },
    { id: 'catalog', label: '商品目录', order: 20 },
    { id: 'inventory', label: '库存与仓储', order: 30 },
    { id: 'fulfillment', label: '履约与售后', order: 40 },
    { id: 'finance', label: '财务与规则', order: 50 },
    { id: 'team', label: '团队与排程', order: 60 },
    { id: 'automation', label: '自动化与流程', order: 70 },
    { id: 'content', label: '内容与资料', order: 80 },
  ],
  manageCategories: [
    { id: 'system', label: '系统', order: 10 },
    { id: 'access', label: '身份与权限', order: 20 },
    { id: 'portal', label: '客户门户', order: 30 },
    { id: 'data', label: '数据与集成', order: 40 },
    { id: 'moduleConfigs', label: '模块配置', order: 50 },
    { id: 'org', label: '财务与组织', order: 60 },
    { id: 'ai', label: 'AI 与助手', order: 70 },
    { id: 'business-config', label: '业务配置', order: 80 },
    { id: 'dev', label: '开发者与定制', order: 90 },
    { id: 'security', label: '安全', order: 100 },
  ],
  entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))),
}

// Every href the live payload can contain must be decided. The two superadmin-only
// entries are included above, so this is a real assertion, not a warning.
const live = new Set()
const collect = (items) => {
  for (const item of items ?? []) {
    if (item?.href) live.add(item.href)
    collect(item.children)
  }
}
for (const file of [ADMIN, SUPERADMIN]) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const group of payload.groups ?? []) collect(group.items)
  for (const section of payload.settingsSections ?? []) collect(section.items)
  for (const section of payload.profileSections ?? []) collect(section.items)
}
const unmapped = [...live].filter((href) => !entries[href])
const stale = Object.keys(entries).filter((href) => !live.has(href))
if (unmapped.length) {
  console.error(`[scene-map] unmapped live entries:\n  ${unmapped.join('\n  ')}`)
  process.exit(1)
}
if (stale.length) {
  console.error(`[scene-map] decisions for entries no longer served:\n  ${stale.join('\n  ')}`)
  process.exit(1)
}

fs.writeFileSync(OUT, `${JSON.stringify(map, null, 2)}\n`)
console.log(`[scene-map] ${Object.keys(entries).length} entries across ${live.size} live hrefs -> ${path.relative(ROOT, OUT)}`)
