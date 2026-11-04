import { llmProviderRegistry } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-registry'
import {
  importDiscoveredModels,
  type MergedModel,
  type ModelCatalogScope,
  type ModuleConfigServiceLike,
} from './catalog'
import { decryptSecret } from './credentials'
import {
  defaultBaseUrlFor,
  discoverProviderModels,
  resolveDiscoveryProtocol,
  type DiscoveredModel,
} from './provider-discovery'
import {
  loadProviderConfig,
  saveProviderConfig,
  type ProviderConfig,
  type SystemDefaultModel,
} from './provider-config'

export type ProviderSyncResult = {
  imported: number
  total: number
  models: MergedModel[]
  defaultModel: SystemDefaultModel | null
}

export type ProviderPreviewResult = {
  models: DiscoveredModel[]
  baseURL: string
}

async function resolveProviderCredentials(
  service: ModuleConfigServiceLike,
  providerId: string,
): Promise<{ apiKey: string; baseURL: string | null; protocol: 'openai' | 'anthropic' | 'google' }> {
  const config = await loadProviderConfig(service)
  const custom = config.customProviders.find((provider) => provider.id === providerId)
  const credential = config.credentials[providerId]
  const provider = llmProviderRegistry.get(providerId)

  const apiKey = (custom ? decryptSecret(custom.apiKeyEnc) : null)
    ?? (credential ? decryptSecret(credential.apiKeyEnc) : null)
    ?? provider?.resolveApiKey()
    ?? null
  if (!apiKey) {
    throw new Error('Save an API key first, then fetch models.')
  }

  const baseURL = credential?.baseURL
    ?? custom?.baseURL
    ?? defaultBaseUrlFor(providerId)
    ?? null

  return {
    apiKey,
    baseURL,
    protocol: custom ? 'openai' : resolveDiscoveryProtocol(providerId),
  }
}

/**
 * Fetch the provider's model list without touching the catalog. Used by the
 * "save key → preview models → confirm import" flow.
 */
export async function previewProviderModels(
  service: ModuleConfigServiceLike,
  providerId: string,
): Promise<ProviderPreviewResult> {
  const { apiKey, baseURL, protocol } = await resolveProviderCredentials(service, providerId)
  return discoverProviderModels({ providerId, apiKey, baseURL, protocol })
}

/**
 * Import a confirmed set of models. Existing entries keep their edited
 * name/tags/enabled state; the first import also promotes a model to the
 * system-wide default so the whole system has an AI base model.
 */
export async function importProviderModels(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  providerId: string,
  models: ReadonlyArray<{ id: string; name: string }>,
  options: { setDefault?: boolean } = {},
): Promise<ProviderSyncResult> {
  const config = await loadProviderConfig(service)
  const provider = llmProviderRegistry.get(providerId)
  const imported = await importDiscoveredModels(service, scope, providerId, models)

  let defaultModel = config.defaultModel
  if (!defaultModel && options.setDefault !== false) {
    const preferred = provider?.defaultModel
      && models.some((model) => model.id === provider.defaultModel)
      ? provider.defaultModel
      : models[0]?.id
    if (preferred) {
      defaultModel = {
        providerId,
        modelId: preferred,
        updatedAt: new Date().toISOString(),
      }
      config.defaultModel = defaultModel
      await saveProviderConfig(service, config)
    }
  }

  return {
    imported: imported.imported,
    total: models.length,
    models: imported.models,
    defaultModel,
  }
}

/** Discover + import everything in one call (explicit "fetch all" action). */
export async function syncProviderModels(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  providerId: string,
  options: { setDefault?: boolean } = {},
): Promise<ProviderSyncResult> {
  const preview = await previewProviderModels(service, providerId)
  return importProviderModels(service, scope, providerId, preview.models, options)
}

export async function setSystemDefaultModel(
  service: ModuleConfigServiceLike,
  providerId: string,
  modelId: string,
): Promise<ProviderConfig> {
  const config = await loadProviderConfig(service)
  config.defaultModel = {
    providerId,
    modelId,
    updatedAt: new Date().toISOString(),
  }
  await saveProviderConfig(service, config)
  return config
}

export async function clearSystemDefaultModel(
  service: ModuleConfigServiceLike,
): Promise<ProviderConfig> {
  const config = await loadProviderConfig(service)
  config.defaultModel = null
  await saveProviderConfig(service, config)
  return config
}
