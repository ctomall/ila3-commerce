/**
 * Resolve the CRM's configured model provider into the environment a DSH child
 * needs. The API key exists only inside the child env: this module never logs
 * it, returns it to the browser, or persists it.
 *
 * Injected deps keep the resolution testable without the app container.
 */

export type ProviderConfigLike = {
  defaultModel?: { providerId?: string; modelId?: string } | null
  customProviders: Array<{ id: string; enabled: boolean; baseURL?: string; apiKeyEnc?: string }>
  credentials: Record<string, { apiKeyEnc?: string; baseURL?: string }>
}

export type ModelEnvDeps = {
  loadConfig: () => Promise<ProviderConfigLike>
  decrypt: (ciphertext: string | null | undefined) => string | null
}

export type ModelEnv = {
  env: Record<string, string>
  provider?: string
  model?: string
}

export const EMPTY_MODEL_ENV: ModelEnv = { env: {} }

/** DSH's SDK profile mounts the deepseek provider; the CRM only chooses its model id. */
const DSH_PROVIDER = 'deepseek-official'

export async function resolveModelEnv(deps: ModelEnvDeps): Promise<ModelEnv> {
  let config: ProviderConfigLike
  try {
    config = await deps.loadConfig()
  } catch {
    return EMPTY_MODEL_ENV
  }

  const providerId = config.defaultModel?.providerId
  if (!providerId) return EMPTY_MODEL_ENV

  const custom = config.customProviders.find((p) => p.id === providerId && p.enabled)
  const credential = config.credentials[providerId]
  const ciphertext = custom?.apiKeyEnc ?? credential?.apiKeyEnc
  if (!ciphertext) return EMPTY_MODEL_ENV

  let apiKey: string | null = null
  try {
    apiKey = deps.decrypt(ciphertext)
  } catch {
    return EMPTY_MODEL_ENV
  }
  if (!apiKey) return EMPTY_MODEL_ENV

  const baseURL = custom?.baseURL ?? credential?.baseURL
  const env: Record<string, string> = { DEEPSEEK_API_KEY: apiKey }
  if (baseURL) env.DEEPSEEK_BASE_URL = baseURL

  const model = config.defaultModel?.modelId
  return { env, provider: DSH_PROVIDER, ...(model ? { model } : {}) }
}
