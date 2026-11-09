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
import type { ModuleOverrides } from '@open-mercato/shared/modules/overrides'
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

export const enabledModules: ModuleEntry[] = [
  // Functional grouping: business flows first, platform/administration last.
  {
    id: 'dashboards',
    from: '@open-mercato/core',
    overrides: {
      nav: {
        groupOrder: [
          'customers.nav.group',
          'customers~sales.nav.group',
          'sales.nav.group',
          'catalog.nav.group',
          'customers~catalog.nav.group',
          'wms.nav.group',
          'checkout.nav.group',
          'warranty_claims.nav.group',
          'eudr.nav.group',
          'resources.nav.group',
          'staff.nav.group',
          'staff.time_tracking.nav.group',
          'availability.nav.group',
          'planner.nav.group',
          'currencies.nav.group',
          'business_rules.nav.group',
          'rules.nav.group',
          'workflows.module.name',
          'documents.nav.group',
          'attachments.nav.group',
          'messages.nav.group',
          'inbox_ops.nav.group',
          'communication_channels.nav.group',
          'integrations.nav.group',
          'phone_calls.nav.group',
          'notifications.nav.group',
          'customer_accounts.nav.group',
          'customer_groups.nav.group',
          'feature_toggles.nav.group',
          'entities.nav.group',
          'directory.nav.group',
          'auth.nav.group',
          'agent_orchestrator.nav.group',
        ],
      },
      // M7 导航收敛（对象级动作从顶层菜单下沉到列表页操作区）。
      //
      // These routes are *object-level mutations*, not destinations: every one of them is
      // reached from the create button of its own list surface, so keeping them in the
      // sidebar renders the same action twice (one of the two paths is always a detour).
      // `navHidden` only removes the nav entry — the route, its permissions and its
      // in-page button stay untouched, so the action is still one click away where the
      // user already is. The rule applied to the whole class, not just the first ten:
      // a route is hidden only when its list surface declares `createHref` / a `Link`
      // to it (verified per surface, not assumed):
      //   customers companies|people|deals      -> Link / createHref
      //   sales channels; quotes+orders (SalesDocumentsTable) -> Link (documents/create?kind=…)
      //   catalog products|prices|categories    -> createHref (prices/categories gated on canManage)
      //   warranty claims|registrations|vendor-policies|troubleshooting-guides -> Link / createHref
      //   auth users|roles, currencies, exchange-rates, rules, sets,
      //   resources, staff teams, feature toggles, user entities -> createHref / Link
      // Left untouched on purpose: /backend/definitions/create and
      // /backend/resources/resource-types/create — their list surfaces do NOT expose a
      // create action, so hiding the menu entry would remove the only way in.
      //
      // Declared on the module that already owns the app-wide nav ordering so the
      // navigation policy lives in one place; the override dispatcher is app-wide.
      routes: {
        pages: {
          'backend:/backend/customers/companies/create': { metadata: { navHidden: true } },
          'backend:/backend/customers/people/create': { metadata: { navHidden: true } },
          'backend:/backend/customers/deals/create': { metadata: { navHidden: true } },
          'backend:/backend/sales/channels/create': { metadata: { navHidden: true } },
          'backend:/backend/sales/documents/create': { metadata: { navHidden: true } },
          'backend:/backend/catalog/products/create': { metadata: { navHidden: true } },
          'backend:/backend/catalog/prices/create': { metadata: { navHidden: true } },
          'backend:/backend/catalog/categories/create': { metadata: { navHidden: true } },
          'backend:/backend/warranty_claims/create': { metadata: { navHidden: true } },
          'backend:/backend/warranty_claims/registrations/create': { metadata: { navHidden: true } },
          'backend:/backend/warranty_claims/vendor-policies/create': { metadata: { navHidden: true } },
          'backend:/backend/warranty_claims/troubleshooting-guides/create': { metadata: { navHidden: true } },
          'backend:/backend/users/create': { metadata: { navHidden: true } },
          // Configuration screens that already live in the settings area. Without this
          // they render twice: once under a "管理后台"-style group and once behind the
          // settings gear, so a salesperson sees two paths to the same screen (measured:
          // 11 duplicate hrefs). Hiding the main-nav entry leaves the settings path — the
          // canonical one — untouched.
          'backend:/backend/webhooks': { metadata: { navHidden: true } },
          'backend:/backend/integrations': { metadata: { navHidden: true } },
          'backend:/backend/data-sync': { metadata: { navHidden: true } },
          'backend:/backend/payment-gateways': { metadata: { navHidden: true } },
          'backend:/backend/config/sales': { metadata: { navHidden: true } },
          'backend:/backend/config/translations': { metadata: { navHidden: true } },
          'backend:/backend/config/scheduled-jobs': { metadata: { navHidden: true } },
          'backend:/backend/config/wms': { metadata: { navHidden: true } },
          'backend:/backend/users': { metadata: { navHidden: true } },
          'backend:/backend/audit-logs': { metadata: { navHidden: true } },
          'backend:/backend/docs': { metadata: { navHidden: true } },
          'backend:/backend/roles/create': { metadata: { navHidden: true } },
          'backend:/backend/currencies/create': { metadata: { navHidden: true } },
          'backend:/backend/exchange-rates/create': { metadata: { navHidden: true } },
          'backend:/backend/rules/create': { metadata: { navHidden: true } },
          'backend:/backend/sets/create': { metadata: { navHidden: true } },
          'backend:/backend/resources/resources/create': { metadata: { navHidden: true } },
          'backend:/backend/staff/teams/create': { metadata: { navHidden: true } },
          'backend:/backend/feature-toggles/global/create': { metadata: { navHidden: true } },
          'backend:/backend/entities/user/create': { metadata: { navHidden: true } },
        },
      },
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
  // Read-only directory of enabled modules for the settings UI.
  { id: 'module_directory', from: '@app' },
  // Searchable settings landing page replacing the stock placeholder.
  { id: 'settings_home', from: '@app' },
  // M3 prototype pages (navHidden, non-production demo).
  { id: 'crm_prototype', from: '@app' },
  // P1: named 工作台 entry pointing at the existing /backend dashboard.
  { id: 'workbench', from: '@app' },
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
