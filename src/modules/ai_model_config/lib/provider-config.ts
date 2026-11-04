import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { llmProviderRegistry } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-registry'
import { createOpenAICompatibleProvider } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-adapters/openai'
import {
  mergeProviderModels,
  type ModelCatalogEntry,
  type ModelCatalogScope,
  type ModuleConfigServiceLike,
} from './catalog'
import { decryptSecret, encryptSecret } from './credentials'

/**
 * Provider credentials + custom providers.
 *
 * Everything lives in one instance-level `module_configs` document
 * (`ai_assistant / model_providers`) so that a single deployment can manage
 * provider credentials from Settings without editing `.env` or restarting.
 *
 * Two kinds of records:
 *   - `credentials[providerId]` — an API key / base URL override for a
 *     provider that ships with the app (DeepSeek, OpenAI, OpenRouter, …).
 *     It wins over the matching environment variable; clearing it falls back
 *     to `.env`.
 *   - `customProviders[]` — a brand-new OpenAI-compatible provider
 *     (name, id, base URL, API key) registered into the shared provider
 *     registry at runtime.
 *
 * Secrets are encrypted at rest (AES-256-GCM) and are never returned by the
 * API. Registrations are process-global: on a multi-tenant deployment all
 * tenants share the provider connection, while the model catalog itself stays
 * tenant-scoped.
 */

export const PROVIDER_CONFIG_NAME = 'model_providers'

export type ProviderProtocol = 'openai-compatible' | 'anthropic' | 'google' | 'azure'

export type ProviderCredentialRecord = {
  apiKeyEnc: string
  baseURL: string | null
  updatedAt: string
}

export type CustomProviderRecord = {
  id: string
  name: string
  protocol: 'openai-compatible'
  baseURL: string
  apiKeyEnc: string
  defaultModel: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type SystemDefaultModel = {
  providerId: string
  modelId: string
  updatedAt: string
}

export type ProviderConfig = {
  version: 1
  customProviders: CustomProviderRecord[]
  credentials: Record<string, ProviderCredentialRecord>
  defaultModel: SystemDefaultModel | null
}

export type ProviderKeySource = 'env' | 'settings' | 'none'

export type ProviderRow = {
  id: string
  name: string
  builtin: boolean
  protocol: ProviderProtocol
  configured: boolean
  keySource: ProviderKeySource
  envKey: string | null
  baseURL: string | null
  defaultModel: string
  modelCount: number
  enabled: boolean
}

export type ProviderConfigScope = ModelCatalogScope

export function emptyProviderConfig(): ProviderConfig {
  return { version: 1, customProviders: [], credentials: {}, defaultModel: null }
}

function sanitizeCredential(raw: unknown): ProviderCredentialRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (typeof record.apiKeyEnc !== 'string' || record.apiKeyEnc.length === 0) return null
  return {
    apiKeyEnc: record.apiKeyEnc,
    baseURL: typeof record.baseURL === 'string' && record.baseURL.trim().length > 0
      ? record.baseURL.trim()
      : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  }
}

function sanitizeCustomProvider(raw: unknown): CustomProviderRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim().toLowerCase() : ''
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const baseURL = typeof record.baseURL === 'string' ? record.baseURL.trim() : ''
  const apiKeyEnc = typeof record.apiKeyEnc === 'string' ? record.apiKeyEnc : ''
  if (!id || !name || !baseURL || !apiKeyEnc) return null
  const now = new Date().toISOString()
  return {
    id,
    name,
    protocol: 'openai-compatible',
    baseURL,
    apiKeyEnc,
    defaultModel: typeof record.defaultModel === 'string' ? record.defaultModel.trim() : '',
    enabled: record.enabled !== false,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  }
}

export function sanitizeProviderConfig(raw: unknown): ProviderConfig {
  if (!raw || typeof raw !== 'object') return emptyProviderConfig()
  const record = raw as Record<string, unknown>
  const customProviders = Array.isArray(record.customProviders)
    ? record.customProviders
        .map((entry) => sanitizeCustomProvider(entry))
        .filter((entry): entry is CustomProviderRecord => entry !== null)
    : []
  const credentials: Record<string, ProviderCredentialRecord> = {}
  if (record.credentials && typeof record.credentials === 'object') {
    for (const [providerId, value] of Object.entries(record.credentials as Record<string, unknown>)) {
      const sanitized = sanitizeCredential(value)
      if (sanitized) credentials[providerId] = sanitized
    }
  }
  let defaultModel: SystemDefaultModel | null = null
  if (record.defaultModel && typeof record.defaultModel === 'object') {
    const candidate = record.defaultModel as Record<string, unknown>
    if (typeof candidate.providerId === 'string' && typeof candidate.modelId === 'string'
      && candidate.providerId.length > 0 && candidate.modelId.length > 0) {
      defaultModel = {
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
      }
    }
  }
  return { version: 1, customProviders, credentials, defaultModel }
}

export async function loadProviderConfig(
  service: ModuleConfigServiceLike,
  scope: ProviderConfigScope = {},
): Promise<ProviderConfig> {
  const value = await service.getValue<unknown>('ai_assistant', PROVIDER_CONFIG_NAME, {
    scope: { ...scope, tenantId: null, organizationId: null },
  })
  return sanitizeProviderConfig(value)
}

export async function saveProviderConfig(
  service: ModuleConfigServiceLike,
  config: ProviderConfig,
): Promise<void> {
  await service.setValue('ai_assistant', PROVIDER_CONFIG_NAME, config, {
    tenantId: null,
    organizationId: null,
  })
}

export function envSafeId(providerId: string): string {
  return providerId.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

export function customProviderEnvKey(providerId: string): string {
  return `OM_CUSTOM_${envSafeId(providerId)}_API_KEY`
}

export function builtinBaseUrlEnvKey(providerId: string): string {
  return `${envSafeId(providerId)}_BASE_URL`
}

export function inferProtocol(providerId: string): ProviderProtocol {
  if (providerId === 'anthropic') return 'anthropic'
  if (providerId === 'google') return 'google'
  if (providerId === 'azure') return 'azure'
  return 'openai-compatible'
}

/**
 * Ledger of the environment values that existed before a settings-saved
 * credential overrode them. Kept on globalThis because Next.js may load this
 * module in more than one bundle and the ai-assistant bootstrap writes into the
 * same ledger.
 */
function envLedger(): Record<string, string | undefined> {
  const store = globalThis as {
    __OM_AI_PROVIDER_ENV_ORIGINALS__?: Record<string, string | undefined>
  }
  if (!store.__OM_AI_PROVIDER_ENV_ORIGINALS__) store.__OM_AI_PROVIDER_ENV_ORIGINALS__ = {}
  return store.__OM_AI_PROVIDER_ENV_ORIGINALS__
}

let registeredCustomIds = new Set<string>()
let appliedFingerprint: string | null = null

function setEnvOverride(name: string, value: string): void {
  const ledger = envLedger()
  if (!(name in ledger)) ledger[name] = process.env[name]
  process.env[name] = value
}

function restoreEnv(name: string): void {
  const ledger = envLedger()
  if (!(name in ledger)) return
  const original = ledger[name]
  if (original === undefined) delete process.env[name]
  else process.env[name] = original
  delete ledger[name]
}

function unregisterProvider(id: string): void {
  const registry = llmProviderRegistry as unknown as { unregister?: (providerId: string) => void }
  registry.unregister?.(id)
}

function applyProviderConfig(config: ProviderConfig): void {
  const desiredEnv = new Set<string>()
  const nextCustomIds = new Set<string>()

  for (const provider of config.customProviders) {
    if (!provider.enabled) continue
    nextCustomIds.add(provider.id)
    const envKey = customProviderEnvKey(provider.id)
    const apiKey = decryptSecret(provider.apiKeyEnc)
    if (apiKey) {
      setEnvOverride(envKey, apiKey)
      desiredEnv.add(envKey)
    }
    try {
      llmProviderRegistry.register(
        createOpenAICompatibleProvider({
          id: provider.id,
          name: provider.name,
          baseURL: provider.baseURL,
          envKeys: [envKey],
          defaultModel: provider.defaultModel || '',
          defaultModels: [],
        }),
      )
    } catch (error) {
      console.error('[ai_model_config] Failed to register custom provider', provider.id, error)
    }
  }

  for (const id of registeredCustomIds) {
    if (nextCustomIds.has(id)) continue
    unregisterProvider(id)
    restoreEnv(customProviderEnvKey(id))
  }

  for (const [providerId, credential] of Object.entries(config.credentials)) {
    const provider = llmProviderRegistry.get(providerId)
    if (!provider) continue
    const keyName = provider.envKeys?.[0]
    const apiKey = decryptSecret(credential.apiKeyEnc)
    if (keyName && apiKey) {
      setEnvOverride(keyName, apiKey)
      desiredEnv.add(keyName)
    }
    if (credential.baseURL) {
      const baseURLEnv = builtinBaseUrlEnvKey(providerId)
      setEnvOverride(baseURLEnv, credential.baseURL)
      desiredEnv.add(baseURLEnv)
    }
  }

  if (config.defaultModel) {
    setEnvOverride('OM_AI_PROVIDER', config.defaultModel.providerId)
    setEnvOverride('OM_AI_MODEL', config.defaultModel.modelId)
    desiredEnv.add('OM_AI_PROVIDER')
    desiredEnv.add('OM_AI_MODEL')
  }

  for (const name of Object.keys(envLedger())) {
    if (!desiredEnv.has(name)) restoreEnv(name)
  }

  registeredCustomIds = nextCustomIds
  writeProviderRuntimeFile(config)
}

/**
 * Sidecar consumed by the ai-assistant provider bootstrap at process start.
 *
 * Next.js bundles the instrumentation hook and route handlers separately, so a
 * registry mutation performed in one bundle is not guaranteed to be visible in
 * another. Every ai-assistant bundle instead re-applies this file when its
 * provider registry initializes — that is what makes "save in Settings, no
 * restart" survive a `systemctl restart`.
 *
 * Values are encrypted with the same AES-256-GCM envelope used at rest; the
 * file is written with 0600 permissions.
 */
function writeProviderRuntimeFile(config: ProviderConfig): void {
  try {
    const file = process.env.OM_AI_PROVIDERS_FILE
      || join(process.cwd(), 'storage', 'ai-model-providers.json')
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      credentials: Object.fromEntries(
        Object.entries(config.credentials).map(([id, credential]) => [
          id,
          { apiKey: credential.apiKeyEnc, baseURL: credential.baseURL },
        ]),
      ),
      customProviders: config.customProviders
        .filter((provider) => provider.enabled)
        .map((provider) => ({
          id: provider.id,
          name: provider.name,
          baseURL: provider.baseURL,
          apiKey: provider.apiKeyEnc,
          defaultModel: provider.defaultModel,
        })),
      defaultModel: config.defaultModel,
    }
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch (error) {
    console.error('[ai_model_config] Failed to write provider runtime file', error)
  }
}

export async function ensureProviderRuntime(
  container: AppContainer,
  options: { force?: boolean } = {},
): Promise<ProviderConfig | null> {
  let service: ModuleConfigServiceLike | null = null
  try {
    service = container.resolve<ModuleConfigServiceLike>('moduleConfigService')
  } catch {
    return null
  }
  if (!service) return null

  const config = await loadProviderConfig(service)
  const fingerprint = JSON.stringify(config)
  if (!options.force && fingerprint === appliedFingerprint) return config

  applyProviderConfig(config)
  appliedFingerprint = fingerprint
  return config
}

export function providerHasStoredCredential(config: ProviderConfig, providerId: string): boolean {
  return Boolean(config.credentials[providerId]?.apiKeyEnc)
}

export function customProviderIds(config: ProviderConfig): Set<string> {
  return new Set(config.customProviders.map((provider) => provider.id))
}

export function resolveModuleConfigService(container: AppContainer): ModuleConfigServiceLike | null {
  try {
    return container.resolve<ModuleConfigServiceLike>('moduleConfigService')
  } catch {
    return null
  }
}

export function buildProviderRows(
  config: ProviderConfig,
  entries: readonly ModelCatalogEntry[],
): ProviderRow[] {
  const customById = new Map(config.customProviders.map((provider) => [provider.id, provider]))
  const rows: ProviderRow[] = []
  const seen = new Set<string>()

  for (const provider of llmProviderRegistry.list()) {
    seen.add(provider.id)
    const custom = customById.get(provider.id)
    const credential = config.credentials[provider.id]
    const merged = mergeProviderModels(provider.id, provider.defaultModels, entries)
    const configured = provider.isConfigured()
    const keySource: ProviderKeySource = custom
      ? (custom.apiKeyEnc ? 'settings' : 'none')
      : credential?.apiKeyEnc
        ? 'settings'
        : configured
          ? 'env'
          : 'none'
    rows.push({
      id: provider.id,
      name: provider.name,
      builtin: !custom,
      protocol: custom?.protocol ?? inferProtocol(provider.id),
      configured: keySource !== 'none',
      keySource,
      envKey: custom ? customProviderEnvKey(provider.id) : (provider.envKeys?.[0] ?? null),
      baseURL: credential?.baseURL ?? custom?.baseURL ?? null,
      defaultModel: provider.defaultModel || merged[0]?.modelId || '',
      modelCount: merged.length,
      enabled: true,
    })
  }

  for (const custom of config.customProviders) {
    if (seen.has(custom.id)) continue
    rows.push({
      id: custom.id,
      name: custom.name,
      builtin: false,
      protocol: custom.protocol,
      configured: Boolean(decryptSecret(custom.apiKeyEnc)),
      keySource: custom.apiKeyEnc ? 'settings' : 'none',
      envKey: customProviderEnvKey(custom.id),
      baseURL: custom.baseURL,
      defaultModel: custom.defaultModel,
      modelCount: mergeProviderModels(custom.id, [], entries).length,
      enabled: custom.enabled,
    })
  }

  return rows
}

export async function upsertCredential(
  service: ModuleConfigServiceLike,
  providerId: string,
  input: { apiKey?: string; baseURL?: string | null; clear?: boolean },
): Promise<ProviderConfig> {
  const config = await loadProviderConfig(service)
  if (input.clear) {
    delete config.credentials[providerId]
    if (config.defaultModel?.providerId === providerId) config.defaultModel = null
    await saveProviderConfig(service, config)
    return config
  }
  const existing = config.credentials[providerId]
  const apiKeyEnc = input.apiKey && input.apiKey.trim().length > 0
    ? encryptSecret(input.apiKey)
    : existing?.apiKeyEnc
  if (!apiKeyEnc) return config
  config.credentials[providerId] = {
    apiKeyEnc,
    baseURL: input.baseURL === undefined
      ? (existing?.baseURL ?? null)
      : (input.baseURL && input.baseURL.trim().length > 0 ? input.baseURL.trim() : null),
    updatedAt: new Date().toISOString(),
  }
  await saveProviderConfig(service, config)
  return config
}
