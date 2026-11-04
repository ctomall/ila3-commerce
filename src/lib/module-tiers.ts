/**
 * Module tiers.
 *
 * 68 modules are enabled and every page pays for the whole set (dictionary
 * payload, boot work, nav length). Tiers make that set a deliberate choice:
 *
 *   core       — the commercial backbone; nothing works without it
 *   business   — industry/compliance surfaces a tenant may or may not sell
 *   extension  — integrations, channel providers, AI agents, samples
 *
 * `OM_MODULE_TIER` selects a tier at boot (`all` by default, so behaviour is
 * unchanged unless someone opts in). `business` means core + business;
 * `extension` is the full set and is exactly equivalent to `all`.
 */

export type ModuleTier = 'core' | 'business' | 'extension' | 'all'

export const MODULE_TIERS: readonly ModuleTier[] = ['core', 'business', 'extension', 'all'] as const

/** Core commerce backbone — the product is not usable without these. */
const CORE = new Set([
  'dashboards', 'auth', 'customers', 'sales', 'catalog', 'wms', 'checkout',
  'settings_home', 'settings', 'configs', 'dictionaries', 'currencies', 'entities',
  'query_index', 'search', 'cache', 'events', 'notifications', 'audit_logs',
  'api_keys', 'security', 'sso', 'api_docs', 'module_directory', 'system_update',
  'payment_gateways', 'gateway_stripe', 'shipping_carriers', 'tillio',
])

/** Extension surface: integrations, channel providers, AI, samples. */
const EXTENSION_PATTERNS: RegExp[] = [
  /^ai_/, /^agent_/, /^channel_/, /^sync_/, /^example/, /^phone_calls$/,
  /^communication_channels$/, /^inbox_ops$/, /^messages$/, /^integrations$/,
  /^webhooks$/, /^telemetry$/, /^storage_s3$/, /^ratelimit_probe$/,
  /^documents$/, /^attachments$/, /^content$/, /^media/,
]

export function moduleTierOf(moduleId: string): Exclude<ModuleTier, 'all'> {
  if (CORE.has(moduleId)) return 'core'
  if (EXTENSION_PATTERNS.some((pattern) => pattern.test(moduleId))) return 'extension'
  return 'business'
}

/** Whether a module belongs to the requested tier (inclusive). */
export function tierIncludes(tier: ModuleTier, moduleId: string): boolean {
  if (tier === 'all' || tier === 'extension') return true
  const own = moduleTierOf(moduleId)
  if (tier === 'core') return own === 'core'
  return own === 'core' || own === 'business'
}

export function normalizeTier(raw: string | undefined | null): ModuleTier {
  const value = String(raw ?? '').trim().toLowerCase()
  return (MODULE_TIERS as readonly string[]).includes(value) ? (value as ModuleTier) : 'all'
}

/** Filter a module list to a tier. `all` returns the input unchanged. */
export function applyModuleTier<T extends { id: string }>(modules: T[], tier: ModuleTier): T[] {
  if (tier === 'all' || tier === 'extension') return modules
  return modules.filter((module) => tierIncludes(tier, module.id))
}
