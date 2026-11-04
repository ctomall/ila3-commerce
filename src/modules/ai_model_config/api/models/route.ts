import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { llmProviderRegistry } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-registry'
import {
  AI_MODEL_TAGS,
  loadModelCatalog,
  mergeProviderModels,
  saveModelCatalog,
  upsertCatalogEntry,
  type MergedModel,
  type ModelCatalogEntry,
  type ModelCatalogScope,
  type ModuleConfigServiceLike,
} from '../../lib/catalog'

const logger = { error: (...args: unknown[]) => console.error('[ai_model_config]', ...args) }

export type ModelCatalogProvider = {
  id: string
  name: string
  configured: boolean
  envKey: string | null
  builtinModelCount: number
  customModelCount: number
  enabledModelCount: number
}

export type ModelCatalogListResponse = {
  providers: ModelCatalogProvider[]
  models: MergedModel[]
  scope: { tenantId: string | null }
  canManage: boolean
}

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'Tenant-managed AI model catalog',
  methods: {
    GET: {
      summary: 'List providers and the merged model catalog',
      responses: [{ status: 200, description: 'Providers, merged models and the effective scope.' }],
      errors: [
        { status: 401, description: 'Unauthenticated.' },
        { status: 403, description: 'Caller lacks ai_assistant.view.' },
      ],
    },
    POST: {
      summary: 'Create a custom model or override a built-in model',
      responses: [{ status: 200, description: 'The saved catalog entry.' }],
      errors: [
        { status: 400, description: 'Validation error or unknown provider.' },
        { status: 403, description: 'Caller lacks ai_assistant.settings.manage.' },
      ],
    },
  },
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ai_assistant.view'] },
  POST: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

const createSchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
  name: z.string().min(1).max(200),
  contextWindow: z.number().int().min(1).max(100_000_000).nullable().optional(),
  tags: z.array(z.enum(AI_MODEL_TAGS)).max(10).optional(),
  enabled: z.boolean().optional(),
})

function resolveModuleConfigService(container: Awaited<ReturnType<typeof createRequestContainer>>): ModuleConfigServiceLike | null {
  try {
    return container.resolve<ModuleConfigServiceLike>('moduleConfigService')
  } catch {
    return null
  }
}

export function buildProviderCatalog(
  entries: readonly ModelCatalogEntry[],
): { providers: ModelCatalogProvider[]; models: MergedModel[] } {
  const providers: ModelCatalogProvider[] = []
  const models: MergedModel[] = []
  for (const provider of llmProviderRegistry.list()) {
    const merged = mergeProviderModels(provider.id, provider.defaultModels, entries)
    models.push(...merged)
    providers.push({
      id: provider.id,
      name: provider.name,
      configured: provider.isConfigured(),
      envKey: (() => {
        try {
          return provider.getConfiguredEnvKey()
        } catch {
          return provider.envKeys?.[0] ?? null
        }
      })(),
      builtinModelCount: provider.defaultModels.length,
      customModelCount: merged.filter((model) => !model.builtin).length,
      enabledModelCount: merged.filter((model) => model.enabled).length,
    })
  }
  return { providers, models }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const container = await createRequestContainer()
    const service = resolveModuleConfigService(container)
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    let entries = service ? await loadModelCatalog(service, scope) : []
    const initial = buildProviderCatalog(entries)
    // The catalog only exposes providers that have credentials. Entries kept
    // for providers without a key are pruned so a later key save repopulates
    // them from the provider's own /models endpoint.
    const configuredProviderIds = new Set(
      initial.providers.filter((provider) => provider.configured).map((provider) => provider.id),
    )
    if (service) {
      const prunedEntries = entries.filter((entry) => configuredProviderIds.has(entry.providerId))
      if (prunedEntries.length !== entries.length) {
        await saveModelCatalog(service, scope, prunedEntries)
        entries = prunedEntries
      }
    }
    const { providers, models } = buildProviderCatalog(entries)
    const body: ModelCatalogListResponse = {
      providers: providers.filter((provider) => configuredProviderIds.has(provider.id)),
      models: models.filter((model) => configuredProviderIds.has(model.providerId)),
      scope: { tenantId: auth.tenantId ?? null },
      canManage: true,
    }
    return NextResponse.json(body)
  } catch (error) {
    logger.error('GET failed', error)
    return NextResponse.json({ error: 'Failed to load the model catalog.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.', code: 'validation_error' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body.', code: 'validation_error', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const provider = llmProviderRegistry.get(parsed.data.providerId)
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider "${parsed.data.providerId}".`, code: 'provider_unknown' },
      { status: 400 },
    )
  }

  try {
    const container = await createRequestContainer()
    const service = resolveModuleConfigService(container)
    if (!service) {
      return NextResponse.json({ error: 'Configuration storage is unavailable.' }, { status: 500 })
    }
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    const builtin = provider.defaultModels.some(
      (model) => model.id.toLowerCase() === parsed.data.modelId.trim().toLowerCase(),
    )
    const result = await upsertCatalogEntry(service, scope, { ...parsed.data, builtin })
    return NextResponse.json({ entry: result.entry, created: result.created })
  } catch (error) {
    logger.error('POST failed', error)
    return NextResponse.json({ error: 'Failed to save the model.' }, { status: 500 })
  }
}
