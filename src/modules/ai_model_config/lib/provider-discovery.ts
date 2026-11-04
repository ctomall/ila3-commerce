/**
 * Provider model discovery.
 *
 * After a provider key is saved, ask the upstream API for its model list so the
 * administrator does not have to type model ids by hand. Supports the three
 * protocol families the app ships with:
 *
 *   - OpenAI-compatible  GET {base}/models            Authorization: Bearer
 *   - Anthropic          GET {base}/models            x-api-key + version
 *   - Google GenAI       GET {base}/models?key=...    API key query
 *
 * Azure and exotic gateways may not expose `/models`; callers get a typed
 * error and can still add models manually.
 */

export type DiscoveredModel = {
  id: string
  name: string
}

export type DiscoveryResult = {
  models: DiscoveredModel[]
  baseURL: string
}

export type DiscoveryErrorCode =
  | 'no_credentials'
  | 'no_base_url'
  | 'unsupported_provider'
  | 'unauthorized'
  | 'http_error'
  | 'network_error'
  | 'bad_response'

export class ProviderDiscoveryError extends Error {
  code: DiscoveryErrorCode
  status?: number
  constructor(code: DiscoveryErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'ProviderDiscoveryError'
    this.code = code
    this.status = status
  }
}

const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  litellm: 'http://localhost:4000/v1',
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  requesty: 'https://router.requesty.ai/v1',
  'lm-studio': 'http://localhost:1234/v1',
}

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'

export function defaultBaseUrlFor(providerId: string): string | null {
  return OPENAI_COMPATIBLE_BASE_URLS[providerId] ?? null
}

export function resolveDiscoveryProtocol(providerId: string): 'openai' | 'anthropic' | 'google' {
  if (providerId === 'anthropic') return 'anthropic'
  if (providerId === 'google') return 'google'
  return 'openai'
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function uniqueModels(models: DiscoveredModel[]): DiscoveredModel[] {
  const seen = new Set<string>()
  const result: DiscoveredModel[] = []
  for (const model of models) {
    const id = model.id.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, name: model.name.trim() || id })
  }
  return result.sort((a, b) => a.id.localeCompare(b.id))
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    throw new ProviderDiscoveryError('bad_response', 'The provider returned a non-JSON response.')
  }
}

function parseOpenAiModels(payload: Record<string, unknown>): DiscoveredModel[] {
  const list = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : null
  if (!list) {
    throw new ProviderDiscoveryError('bad_response', 'The provider response does not contain a model list.')
  }
  return uniqueModels(
    list
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        const id = typeof record.id === 'string' ? record.id : typeof record.name === 'string' ? record.name : ''
        if (!id) return null
        const name = typeof record.name === 'string' && record.name !== id ? record.name : id
        return { id, name }
      })
      .filter((model): model is DiscoveredModel => model !== null),
  )
}

function parseAnthropicModels(payload: Record<string, unknown>): DiscoveredModel[] {
  const list = Array.isArray(payload.data) ? payload.data : []
  return uniqueModels(
    list
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        const id = typeof record.id === 'string' ? record.id : ''
        if (!id) return null
        const name = typeof record.display_name === 'string' ? record.display_name : id
        return { id, name }
      })
      .filter((model): model is DiscoveredModel => model !== null),
  )
}

function parseGoogleModels(payload: Record<string, unknown>): DiscoveredModel[] {
  const list = Array.isArray(payload.models) ? payload.models : []
  return uniqueModels(
    list
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const record = entry as Record<string, unknown>
        const rawName = typeof record.name === 'string' ? record.name : ''
        if (!rawName) return null
        const id = rawName.startsWith('models/') ? rawName.slice('models/'.length) : rawName
        const name = typeof record.displayName === 'string' ? record.displayName : id
        return { id, name }
      })
      .filter((model): model is DiscoveredModel => model !== null),
  )
}

export type DiscoverModelsInput = {
  providerId: string
  apiKey: string | null
  baseURL: string | null
  protocol?: 'openai' | 'anthropic' | 'google'
}

export async function discoverProviderModels(input: DiscoverModelsInput): Promise<DiscoveryResult> {
  const protocol = input.protocol ?? resolveDiscoveryProtocol(input.providerId)
  const baseURL = stripTrailingSlash(
    input.baseURL
      ?? (protocol === 'anthropic'
        ? ANTHROPIC_BASE_URL
        : protocol === 'google'
          ? GOOGLE_BASE_URL
          : defaultBaseUrlFor(input.providerId) ?? ''),
  )
  if (!baseURL) {
    throw new ProviderDiscoveryError(
      'no_base_url',
      'This provider has no default endpoint. Save a Base URL first, then fetch its models.',
    )
  }
  if (!input.apiKey) {
    throw new ProviderDiscoveryError('no_credentials', 'Save an API key first, then fetch models.')
  }

  let url = `${baseURL}/models`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (protocol === 'anthropic') {
    headers['x-api-key'] = input.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (protocol === 'google') {
    url += `?key=${encodeURIComponent(input.apiKey)}`
  } else {
    headers.authorization = `Bearer ${input.apiKey}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new ProviderDiscoveryError(
      'network_error',
      error instanceof Error ? `Could not reach ${url}: ${error.message}` : `Could not reach ${url}.`,
    )
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderDiscoveryError('unauthorized', 'The provider rejected the API key (401/403).', response.status)
  }
  if (!response.ok) {
    throw new ProviderDiscoveryError(
      'http_error',
      `The provider returned HTTP ${response.status} for ${url}.`,
      response.status,
    )
  }

  const payload = await readJson(response)
  const models = protocol === 'anthropic'
    ? parseAnthropicModels(payload)
    : protocol === 'google'
      ? parseGoogleModels(payload)
      : parseOpenAiModels(payload)

  return { models, baseURL }
}
