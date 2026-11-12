// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
// - overrides: optional unified per-app override surface — replace or
//   disable any contract a module presents: AI, routes, events, workers,
//   widgets, notifications, interceptors, setup, ACL, DI, encryption, etc.
//   See `.ai/specs/implemented/2026-05-04-modules-ts-unified-overrides.md` and
//   `apps/docs/docs/framework/modules/overrides.mdx`.
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { applyModuleTier, normalizeTier } from './lib/module-tiers'
import type {
  ModuleOverrides,
  PageRouteOverrideDefinition,
  PageRouteOverridesMap,
} from '@open-mercato/shared/modules/overrides'
import type { PageMetadata } from '@open-mercato/shared/modules/registry'
import { officialModuleEntries } from './official-modules.generated'

export type ModuleEntry = {
  id: string
  from?: '@open-mercato/core' | '@app' | string
  overrides?: ModuleOverrides
}

/**
 * Copyable examples for every wired `entry.overrides` domain.
 *
 * This object is intentionally not assigned to any enabled module. Use it as
 * a reference when a downstream app needs to disable or replace contracts
 * from a package-backed module without editing that module's source.
 */
export const moduleOverrideExamples: ModuleOverrides = {
  ai: {
    agents: { 'catalog.catalog_assistant': null },
    tools: { inbox_ops_accept_action: null },
    extensions: [], // additive AiAgentExtension[]; do not use null-map semantics
  },
  routes: {
    api: { 'DELETE /api/example/items': null },
    pages: { '/backend/example/reports': null },
  },
  events: {
    subscribers: { 'example.todo.audit': null },
  },
  workers: { 'example:sync': null },
  widgets: {
    injection: { 'example.sidebar': null },
    components: { 'page:/backend/example': null },
    dashboard: { 'example.kpi': null },
  },
  notifications: {
    types: { 'example.notice': null },
    handlers: { 'example.notice.toast': null },
  },
  interceptors: { 'example.items.interceptor': null },
  commandInterceptors: { 'example.command.interceptor': null },
  enrichers: { 'example.items.enricher': null },
  guards: { 'example.backend.guard': null },
  cli: { 'example seed': null },
  setup: {
    seedExamples: false,
  },
  acl: {
    features: { 'example.manage': null },
  },
  di: { exampleService: null },
  encryption: {
    maps: { 'example:item': null },
  },
  nav: {
    // Prepends sidebar nav group ids ahead of the built-in ordering; unnamed groups keep their
    // current position. Applied beneath role and per-user sidebar preferences.
    groupOrder: ['example.nav.group'],
  },
}

/**
 * Declared navigation ownership — one primary container per page entry.
 *
 * A page states where it belongs in its own metadata (`pageGroupKey`); the app
 * restates it here only for installed package pages it does not own, and only when
 * the page's own metadata would render the wrong container, order, context or
 * visibility. A row that changes nothing is rejected by the declaration test, so
 * this is not a second, per-href copy of the existing declarations. Every key is
 * also the container/category translation key, so the rendered label follows the
 * caller's locale. `src/nav/nav-groups.json` interprets those keys as containers
 * and their order — it never lists an href, so this table (and the `page.meta.ts`
 * of app-owned modules) is the only per-entry ownership source for pages whose
 * classification the app changes.
 *
 * A page that declares no mapped key is reported as unconfigured by the catalogue,
 * never silently dropped and never folded into a catch-all.
 */
type DeclaredNavPage = {
  /** Page-group/category key: also its translation key and container member id. */
  key: string
  /** Only set when the page's own declared order would misplace it in its new container. */
  order?: number
  context?: 'main' | 'settings' | 'profile'
  /** `true` hides the entry from the menu; the route, permission and in-page link stay. */
  hidden?: boolean
  /**
   * Literal label override. Used when two declared pages translate to the same
   * zh label (the nav baseline refuses duplicate names); it clears the package
   * title key so the literal wins instead of being re-translated.
   */
  title?: string
}

const declaredNavPages: Record<string, DeclaredNavPage> = {
  '/backend/staff/time-tracking': { key: 'crmNav.group.home', order: 20 },
  '/backend/work-inbox': { key: 'crmNav.group.home', order: 30 },
  '/backend/calendar': { key: 'crmNav.group.home', order: 40 },
  '/backend/staff/my-availability': { key: 'crmNav.group.scheduling', order: 10 },
  // Both package pages translate to 请假申请; restore the distinct labels the
  // team/my split is supposed to show (nav-baseline rejects duplicate names).
  '/backend/staff/my-leave-requests': { key: 'crmNav.group.scheduling', order: 20, title: '我的请假' },
  '/backend/staff/leave-requests': { key: 'crmNav.group.scheduling', order: 30, title: '团队请假' },
  '/backend/staff/time-tracking/entries': { key: 'crmNav.group.scheduling' },
  '/backend/staff/time-tracking/timesheet': { key: 'crmNav.group.scheduling' },
  '/backend/staff/time-tracking/reports': { key: 'crmNav.group.scheduling' },
  '/backend/planner/availability-rulesets': { key: 'planner.nav.group', order: 70, context: 'main' },
  '/backend/payment-gateways': { key: 'crmNav.group.payments', context: 'main' },
  '/backend/instances': { key: 'crmNav.group.automation' },
  '/backend/users': { key: 'crmNav.manage.category.users' },
  '/backend/roles': { key: 'crmNav.manage.category.users' },
  '/backend/directory/organizations': { key: 'crmNav.manage.category.users' },
  '/backend/directory/branding': { key: 'crmNav.manage.category.users' },
  '/backend/integrations': { key: 'crmNav.manage.category.channels' },
  '/backend/data-sync': { key: 'crmNav.manage.category.channels' },
  '/backend/webhooks': { key: 'crmNav.manage.category.channels' },
  '/backend/config/scheduled-jobs': { key: 'crmNav.manage.category.channels' },
  '/backend/communication_channels/channels': { key: 'crmNav.manage.category.channels', context: 'settings' },
  '/backend/config/ai-assistant/settings': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/agents': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/allowlist': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/moderation-flags': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/playground': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/usage': { key: 'crmNav.manage.category.ai' },
  '/backend/config/ai-assistant/legacy': { key: 'crmNav.manage.category.ai' },
  '/backend/config/customers': { key: 'crmNav.manage.category.business' },
  '/backend/config/customers/pipeline-stages': { key: 'crmNav.manage.category.business' },
  '/backend/config/customers/deals': { key: 'crmNav.manage.category.business', context: 'settings' },
  '/backend/config/catalog': { key: 'crmNav.manage.category.business' },
  '/backend/config/sales': { key: 'crmNav.manage.category.business' },
  '/backend/config/wms': { key: 'crmNav.manage.category.business' },
  '/backend/currencies': { key: 'crmNav.manage.category.business' },
  '/backend/exchange-rates': { key: 'crmNav.manage.category.business' },
  '/backend/config/currency-fetching': { key: 'crmNav.manage.category.business' },
  '/backend/config/dictionaries': { key: 'crmNav.manage.category.business' },
  '/backend/warranty_claims/settings': { key: 'crmNav.manage.category.business', context: 'settings' },
  '/backend/staff/time-tracking/settings': { key: 'crmNav.manage.category.business', context: 'settings' },
  '/backend/inbox-ops/settings': { key: 'crmNav.manage.category.business', context: 'settings', hidden: false },
  '/backend/rules': { key: 'crmNav.manage.category.rules', context: 'settings' },
  '/backend/sets': { key: 'crmNav.manage.category.rules', context: 'settings' },
  '/backend/definitions': { key: 'crmNav.manage.category.rules', context: 'settings' },
  '/backend/config/workflows': { key: 'crmNav.manage.category.rules' },
  '/backend/customer_accounts/users': { key: 'crmNav.manage.category.portal' },
  '/backend/customer_accounts/roles': { key: 'crmNav.manage.category.portal' },
  '/backend/customer_accounts/settings': { key: 'crmNav.manage.category.portal' },
  '/backend/customer_accounts/settings/domain': { key: 'crmNav.manage.category.portal' },
  '/backend/devices': { key: 'crmNav.manage.category.notifications' },
  '/backend/config/notifications': { key: 'crmNav.manage.category.notifications' },
  '/backend/notifications/user-preferences': { key: 'crmNav.manage.category.notifications' },
  '/backend/push_notifications': { key: 'crmNav.manage.category.notifications' },
  '/backend/push_notifications/send': { key: 'crmNav.manage.category.notifications' },
  '/backend/config/system-status': { key: 'crmNav.manage.category.system' },
  '/backend/config/cache': { key: 'crmNav.manage.category.system' },
  '/backend/config/module-telemetry': { key: 'crmNav.manage.category.system' },
  '/backend/query-indexes': { key: 'crmNav.manage.category.system' },
  '/backend/config/attachments': { key: 'crmNav.manage.category.system' },
  '/backend/config/search': { key: 'crmNav.manage.category.system' },
  '/backend/config/translations': { key: 'crmNav.manage.category.system' },
  '/backend/audit-logs': { key: 'crmNav.manage.category.diagnostics' },
  '/backend/instances/failure-queue': { key: 'crmNav.manage.category.diagnostics', context: 'settings' },
  '/backend/events': { key: 'crmNav.manage.category.diagnostics', context: 'settings' },
  '/backend/logs': { key: 'crmNav.manage.category.diagnostics', context: 'settings' },
  '/backend/inbox-ops/log': { key: 'crmNav.manage.category.diagnostics', context: 'settings', hidden: false },
  '/backend/entities/system': { key: 'crmNav.manage.category.advanced' },
  '/backend/entities/user': { key: 'crmNav.manage.category.advanced' },
  // The package zh dictionary renders both this page and /backend/entities/user
  // as 自定义实体; keep the settings page distinct (nav-baseline rejects duplicates).
  '/backend/config/settings': { key: 'crmNav.manage.category.advanced', title: '自定义实体设置' },
  '/backend/config/encryption': { key: 'crmNav.manage.category.advanced' },
  '/backend/feature-toggles/global': { key: 'crmNav.manage.category.advanced' },
  '/backend/feature-toggles/overrides': { key: 'crmNav.manage.category.advanced' },
  '/backend/api-keys': { key: 'crmNav.manage.category.advanced' },
  '/backend/docs': { key: 'crmNav.manage.category.advanced' },
  '/backend/directory/tenants': { key: 'crmNav.manage.category.advanced' },
  '/backend/profile': { key: 'profile.sections.account' },
  '/backend/profile/change-password': { key: 'profile.sections.account' },
  '/backend/sidebar-customization': { key: 'profile.sections.account', order: 3, context: 'profile' },
  '/backend/definitions/create': { key: 'crmNav.manage.category.rules', context: 'settings', hidden: true },
  '/backend/definitions/visual-editor': { key: 'crmNav.manage.category.rules', context: 'settings', hidden: true },
}

/**
 * Create/new routes that are object-level actions, not destinations.
 *
 * Each is reached from the toolbar of the list surface that owns the object
 * (`createHref` / `<Link>`), so keeping them in the sidebar renders the same
 * action twice. `navHidden` only removes the menu entry — the route, its feature
 * and the in-page button stay untouched. The hidden-page matrix under
 * `src/nav/hidden-pages.json` records the verifying file+line for every one of
 * them, plus the routes that are hidden by their own package metadata.
 */
const hiddenActionPages: string[] = [
  '/backend/customers/companies/create',
  '/backend/customers/people/create',
  '/backend/customers/deals/create',
  '/backend/sales/channels/create',
  '/backend/sales/documents/create',
  '/backend/catalog/products/create',
  '/backend/catalog/prices/create',
  '/backend/catalog/categories/create',
  '/backend/warranty_claims/create',
  '/backend/warranty_claims/registrations/create',
  '/backend/warranty_claims/vendor-policies/create',
  '/backend/warranty_claims/troubleshooting-guides/create',
  '/backend/users/create',
  '/backend/roles/create',
  '/backend/currencies/create',
  '/backend/exchange-rates/create',
  '/backend/rules/create',
  '/backend/sets/create',
  '/backend/resources/resources/create',
  '/backend/resources/resource-types/create',
  '/backend/staff/teams/create',
  '/backend/feature-toggles/global/create',
  '/backend/entities/user/create',
]

function pageRouteOverride(decl: DeclaredNavPage): PageRouteOverrideDefinition {
  const metadata: PageMetadata = {
    pageGroupKey: decl.key,
    ...(decl.order === undefined ? {} : { pageOrder: decl.order }),
    ...(decl.context ? { pageContext: decl.context } : {}),
    ...(decl.hidden === undefined ? {} : { navHidden: decl.hidden }),
    ...(decl.title === undefined
      ? {}
      : { title: decl.title, pageTitleKey: undefined, titleKey: undefined }),
  }
  // The `page*` aliases are declared on `PageMetadata` and normalized into the
  // manifest by the override dispatcher before the nav payload reads it; the
  // `routes.pages` metadata type names the resolved fields only.
  return { metadata: metadata as unknown as PageRouteOverrideDefinition['metadata'] }
}

const declaredPageOverrides: PageRouteOverridesMap = Object.fromEntries([
  ...Object.entries(declaredNavPages).map(([href, decl]) => [`backend:${href}`, pageRouteOverride(decl)]),
  ...hiddenActionPages.map((href): [string, PageRouteOverrideDefinition] => [
    `backend:${href}`,
    { metadata: { navHidden: true } },
  ]),
])

export const enabledModules: ModuleEntry[] = [
  // Functional grouping: business flows first, platform/administration last.
  {
    id: 'dashboards',
    from: '@open-mercato/core',
    overrides: {
      nav: {
        // Page-group keys in container order. The catalog in src/nav/nav-groups.json
        // is authoritative at runtime; this keeps the shell's ordering sane when the
        // managed patch is absent (unit tests, a bare dev install).
        groupOrder: [
          'workbench.nav.group',
          'crmNav.group.home',
          'customers.nav.group',
          'customers~sales.nav.group',
          'catalog.nav.group',
          'wms.nav.group',
          'warranty_claims.nav.group',
          'staff.nav.group',
          'staff.time_tracking.nav.group',
          'resources.nav.group',
          'crmNav.group.scheduling',
          'planner.nav.group',
          'checkout.nav.group',
          'crmNav.group.payments',
          'documents.nav.group',
          'attachments.nav.group',
          'messages.nav.group',
          'inbox_ops.nav.group',
          'phone_calls.nav.group',
          'crmNav.group.automation',
          'eudr.nav.group',
        ],
      },
      // The override dispatcher is app-wide, so the app declares installed pages'
      // navigation metadata from one place: `metadata` merges over the page's own
      // `page.meta.ts`, and the `navHidden` entries below are the object-action
      // policy documented in src/nav/hidden-pages.json.
      routes: { pages: declaredPageOverrides },
    },
  },

  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'customers', from: '@open-mercato/core' },
  // customer_groups (Release 2 part 1 — .ai/specs/2026-08-14-customer-groups-and-b2b-terms.md
  // §14 Phase 1-2). The package ships with the scaffold but stays disabled by default:
  // enabling it here makes the scaffold ship the module's fact-sheet, which the
  // `every module fact-sheet a scaffold ships is required by at least one catalog case`
  // guard (packages/create-app/src/lib/module-facts-build.test.ts) then requires a
  // dedicated AI-harness case for — authoring one means running the full
  // om-refresh-standalone-harness / om-evolve-harness workflow (live agentic release-suite
  // evaluation, a knowledge-change manifest, etc.), which is its own explicitly-authorized
  // task, not a one-line edit. Enabling is therefore a maintainer call about that harness
  // work, same as channel_discord's byte-budget call below.
  // { id: 'customer_groups', from: '@open-mercato/core' },
  { id: 'perspectives', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'catalog', from: '@open-mercato/core' },
  { id: 'sales', from: '@open-mercato/core' },
  { id: 'warranty_claims', from: '@open-mercato/core' },
  { id: 'wms', from: '@open-mercato/core' },
  // Availability contract, policy module, and provider registry (Phase 1+2).
  // Ships with the scaffold but stays commented out in the template until
  // standalone-harness coverage lands: no case in
  // packages/create-app/agentic/shared/ai/harness/cases.json lists
  // .ai/guides/modules/availability/index.md in context.required, so enabling it
  // here trips packages/create-app/src/lib/module-facts-build.test.ts ('every
  // module fact-sheet a scaffold ships is required by at least one catalog
  // case'). Run the om-refresh-standalone-harness skill to add that coverage,
  // then enable it in the template.
  // { id: 'availability', from: '@open-mercato/core' },
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'devices', from: '@open-mercato/core' },
  { id: 'dictionaries', from: '@open-mercato/core' },
  { id: 'content', from: '@open-mercato/content' },
  { id: 'onboarding', from: '@open-mercato/onboarding' },
  { id: 'api_docs', from: '@open-mercato/core' },
  { id: 'business_rules', from: '@open-mercato/core' },
  { id: 'feature_toggles', from: '@open-mercato/core' },
  { id: 'workflows', from: '@open-mercato/core' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'currencies', from: '@open-mercato/core' },
  { id: 'planner', from: '@open-mercato/core' },
  { id: 'resources', from: '@open-mercato/core' },
  { id: 'staff', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'integrations', from: '@open-mercato/core' },
  { id: 'data_sync', from: '@open-mercato/core' },
  { id: 'sync_excel', from: '@open-mercato/core' },
  { id: 'messages', from: '@open-mercato/core' },
  // Communication channels hub (SPEC-045d) — bridges external chat/email channels
  // (Slack, WhatsApp, Email) to the unified Messages inbox. Provider packages
  // (channel-slack, channel-whatsapp, future email providers) register adapters here.
  { id: 'communication_channels', from: '@open-mercato/core' },
  // Push notification rails — `push` delivery strategy + delivery log + send-push worker.
  // Fans out to `devices` tokens and sends through the `communication_channels` hub.
  { id: 'push_notifications', from: '@open-mercato/core' },
  { id: 'phone_calls', from: '@open-mercato/core' },
  { id: 'ai_assistant', from: '@open-mercato/ai-assistant' },
  // App-level tenant model catalog for the AI assistant settings page.
  { id: 'ai_model_config', from: '@app' },
  // Superadmin one-click upgrade from the configured git remote.
  { id: 'system_update', from: '@app' },
  { id: 'dsh_runs', from: '@app' },
  // Human approval ledger for DSH CRM writes (write tool + approval page).
  { id: 'dsh_approvals', from: '@app' },
  // Per-employee customer grants (`customer_access`) used by the assistant scope.
  { id: 'customer_access', from: '@app' },
  // Read-only directory of enabled modules for the settings UI.
  { id: 'module_directory', from: '@app' },
  // Searchable settings landing page replacing the stock placeholder.
  { id: 'settings_home', from: '@app' },
  // Bounded loading for installed list surfaces. The installed profile
  // communication-channels page clears its DataTable loading state only when
  // `me/channels` settles and passes no abort signal, so a request that never
  // answers leaves the table on "正在加载表格…" forever. This module decorates the
  // table's UMES handle (`data-table:communication_channels.profile.channels`) and
  // turns a wait past the budget into a readable error with a retry exit. It wraps
  // the installed table instead of replacing the page, so no route/nav contract and
  // no installed file changes; removing this entry restores the stock behaviour.
  { id: 'ui_resilience', from: '@app' },
  // M3 prototype pages (navHidden, non-production demo).
  { id: 'crm_prototype', from: '@app' },
  // Employee-facing mobile facade over communication_channels (own-mailbox send,
  // conversation reads). Additive: no second channel/message table is created.
  { id: 'communications', from: '@app' },
  // WhatsApp Cloud API adapter (ADR-005). Registers with the hub; inert until
  // an admin connects a tenant-wide channel with credentials.
  { id: 'channel_whatsapp', from: '@app' },
  // Facebook Page Messenger adapter (ADR-005). Same Meta webhook security model.
  { id: 'channel_messenger', from: '@app' },
  // P1: named 工作台 entry pointing at the existing /backend dashboard.
  { id: 'workbench', from: '@app' },
  // Declared CRM navigation: module page groups in the rail, generated content strip, management centre.
  { id: 'crm_navigation', from: '@app' },
  // M4-3: the employee assistant's read-only CRM tool. No pages, no entities, no
  // migrations — only a module-root ai-tools.ts that the generator folds into the
  // ai-assistant tool registry.
  { id: 'crm_tools', from: '@app' },
  // Table-style directory of registered AI agents.
  { id: 'agent_directory', from: '@app' },
  // agent_orchestrator moved to the enterprise catalog — enabled below behind
  // OM_ENABLE_ENTERPRISE_MODULES + OM_ENABLE_ENTERPRISE_MODULES_AGENTS.
  { id: 'translations', from: '@open-mercato/core' },
  { id: 'scheduler', from: '@open-mercato/scheduler' },
  { id: 'inbox_ops', from: '@open-mercato/core' },
  { id: 'payment_gateways', from: '@open-mercato/core' },
  { id: 'checkout', from: '@open-mercato/checkout' },
  { id: 'documents', from: '@open-mercato/documents' },
  { id: 'gateway_stripe', from: '@open-mercato/gateway-stripe' },
  // Per-user email channels for the Communications Hub (SPEC-045d / email
  // integration spec). Each provider package registers its `ChannelAdapter`
  // at import time via `setup.ts`; the hub picks them up by `providerKey`.
  { id: 'channel_resend', from: '@open-mercato/channel-resend' },
  { id: 'channel_ses', from: '@open-mercato/channel-ses' },
  { id: 'channel_imap', from: '@open-mercato/channel-imap' },
  { id: 'channel_gmail', from: '@open-mercato/channel-gmail' },
  // Mobile push providers for the push_notifications channel. Each registers a
  // `push` ChannelAdapter at import time; the push delivery strategy routes each
  // device to the channel whose providerKey matches its push_provider.
  { id: 'channel_apns', from: '@open-mercato/channel-apns' },
  { id: 'channel_expo', from: '@open-mercato/channel-expo' },
  { id: 'channel_fcm', from: '@open-mercato/channel-fcm' },
  // Discord bot channel (SPEC 2026-06-19). The package ships with the scaffold
  // but stays disabled by default. #4989 removed the hard overflow this used to
  // cause (the generated root now sheds its module-fact index instead), but the
  // headroom is still gone: enabling it puts the generated root at 12,275 of the
  // 12,288-byte target, so the next module enabled after it drops the inline
  // index to pointer form. Enabling is therefore a maintainer call about that
  // budget, not a one-line edit — see
  // packages/create-app/src/lib/agent-instruction-budget.test.ts
  // ('one more template module still fits the root budget with its inline index
  // intact'), and #4983 for the discussion.
  // { id: 'channel_discord', from: '@open-mercato/channel-discord' },
  { id: 'sync_akeneo', from: '@open-mercato/sync-akeneo' },
  { id: 'tillio', from: '@open-mercato/tillio' },
  { id: 'shipping_carriers', from: '@open-mercato/core' },
  { id: 'eudr', from: '@open-mercato/core' },
  { id: 'webhooks', from: '@open-mercato/webhooks' },
  // Same-origin OTLP proxy for browser RUM spans; inert unless
  // TELEMETRY_BROWSER_ENABLED is set alongside an active telemetry backend.
  { id: 'telemetry', from: '@open-mercato/telemetry' },
  { id: 'customer_accounts', from: '@open-mercato/core' },
  { id: 'portal', from: '@open-mercato/core' },
  // Audit-grade questionnaire/form primitive. The module ships with the scaffold
  // but stays disabled by default, because enabling it here is a governed change
  // rather than a one-line edit: a module enabled in the template gets a
  // generated fact sheet, which `selectModuleFactSheets` then requires an
  // evaluation case for in the standalone AI harness
  // (src/lib/module-facts-build.test.ts, 'every default-controller module fact is
  // exercised by the evaluation catalog'). Adding that case means re-pinning the
  // catalog count in cases.schema.json, validators.json, two test literals and
  // three docs, and re-running the live `harness:release` certification whose
  // results those docs record — see
  // .ai/skills/om-refresh-standalone-harness/SKILL.md step 9. Enabling is
  // therefore a maintainer call that follows that skill.
  // { id: 'forms', from: '@open-mercato/core' },
  { id: 'ratelimit_probe', from: '@app' },
]

// Official modules activated via official-modules.json / official-modules.local.json
// (managed by `yarn official-modules`; backed by the external/official-modules submodule).
for (const entry of officialModuleEntries) {
  if (!enabledModules.some((existing) => existing.id === entry.id)) enabledModules.push(entry)
}

if (enabledModules.some((entry) => entry.id === 'example')) {
  enabledModules.push({ id: 'example_customers_sync', from: '@app' })
}

if (parseBooleanWithDefault(process.env.OM_ENABLE_STORAGE_S3, false)) {
  enabledModules.push({ id: 'storage_s3', from: '@open-mercato/storage-s3' })
}

const enterpriseModulesEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES, false)
const enterpriseSsoEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SSO, false)
const enterpriseSecurityEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SECURITY, false)
const enterpriseAgentsEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_AGENTS, false)

if (enterpriseModulesEnabled) {
  enabledModules.push(
    { id: 'record_locks', from: '@open-mercato/enterprise' },
    { id: 'system_status_overlays', from: '@open-mercato/enterprise' },
  )
}

if (enterpriseModulesEnabled && enterpriseSsoEnabled) {
  enabledModules.push({ id: 'sso', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseSecurityEnabled) {
  enabledModules.push({ id: 'security', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseAgentsEnabled) {
  enabledModules.push({ id: 'agent_orchestrator', from: '@open-mercato/enterprise' })
  // Example app module: shows how to declare an Agent Orchestrator agent from a
  // brand-new module (see apps/mercato/src/modules/agent_examples/README.md).
  // It imports the orchestrator SDK, so it is only enabled alongside it.
  enabledModules.push({ id: 'agent_examples', from: '@app' })
}


// Module tiers (see src/lib/module-tiers.ts). Filtered IN PLACE: consumers hold
// this array reference from module init, so it must not be re-exported later
// (that created a temporal-dead-zone during route collection).
const activeTier = normalizeTier(process.env.OM_MODULE_TIER)
if (activeTier !== 'all') {
  const kept = applyModuleTier(enabledModules, activeTier)
  enabledModules.length = 0
  enabledModules.push(...kept)
}
