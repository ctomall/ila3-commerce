import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { llmProviderRegistry } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-registry'
import {
  loadModelCatalog,
  upsertCatalogEntry,
  type ModelCatalogScope,
} from '../../lib/catalog'
import { encryptSecret } from '../../lib/credentials'
import {
  buildProviderRows,
  customProviderIds,
  ensureProviderRuntime,
  loadProviderConfig,
  resolveModuleConfigService,
  saveProviderConfig,
  type CustomProviderRecord,
  type ProviderRow,
} from '../../lib/provider-config'
import { previewProviderModels } from '../../lib/model-sync'

const logger = { error: (...args: unknown[]) => console.error('[ai_model_config]', ...args) }

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'AI provider credentials and custom providers',
  methods: {
    GET: {
      summary: 'List providers with credential source and model counts',
      responses: [{ status: 200, description: 'Provider rows (keys are never returned).' }],
      errors: [
        { status: 401, description: 'Unauthenticated.' },
        { status: 403, description: 'Caller lacks ai_assistant.view.' },
      ],
    },
    POST: {
      summary: 'Create a custom OpenAI-compatible provider',
      responses: [{ status: 200, description: 'The created provider row.' }],
      errors: [
        { status: 400, description: 'Validation error or duplicate provider id.' },
        { status: 403, description: 'Caller lacks ai_assistant.settings.manage.' },
      ],
    },
  },
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ai_assistant.view'] },
  POST: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

const createSchema = z.object({
  id: z.string().regex(PROVIDER_ID_PATTERN, 'id must be lowercase letters, digits and dashes'),
  name: z.string().min(1).max(120),
  baseURL: z.string().url().max(2048),
  apiKey: z.string().min(1).max(4096),
  defaultModel: z.string().max(256).optional(),
})

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const container = await createRequestContainer()
    const service = resolveModuleConfigService(container)
    if (!service) {
      return NextResponse.json({ error: 'Configuration storage is unavailable.' }, { status: 500 })
    }
    const config = await ensureProviderRuntime(container)
    const effectiveConfig = config ?? await loadProviderConfig(service)
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    const entries = await loadModelCatalog(service, scope)
    const rows: ProviderRow[] = buildProviderRows(effectiveConfig, entries)
    return NextResponse.json({ providers: rows, systemDefault: effectiveConfig.defaultModel })
  } catch (error) {
    logger.error('GET providers failed', error)
    return NextResponse.json({ error: 'Failed to load providers.' }, { status: 500 })
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

  const providerId = parsed.data.id.trim().toLowerCase()
  if (llmProviderRegistry.get(providerId)) {
    return NextResponse.json(
      { error: `Provider "${providerId}" already exists.`, code: 'provider_exists' },
      { status: 400 },
    )
  }

  try {
    const container = await createRequestContainer()
    const service = resolveModuleConfigService(container)
    if (!service) {
      return NextResponse.json({ error: 'Configuration storage is unavailable.' }, { status: 500 })
    }
    const config = await loadProviderConfig(service)
    if (customProviderIds(config).has(providerId)) {
      return NextResponse.json(
        { error: `Provider "${providerId}" already exists.`, code: 'provider_exists' },
        { status: 400 },
      )
    }
    const now = new Date().toISOString()
    const record: CustomProviderRecord = {
      id: providerId,
      name: parsed.data.name.trim(),
      protocol: 'openai-compatible',
      baseURL: parsed.data.baseURL.trim(),
      apiKeyEnc: encryptSecret(parsed.data.apiKey),
      defaultModel: parsed.data.defaultModel?.trim() ?? '',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    config.customProviders.push(record)
    await saveProviderConfig(service, config)

    let discovery: { ok: boolean; models?: Array<{ id: string; name: string }>; error?: string } = { ok: false }
    try {
      const preview = await previewProviderModels(service, record.id)
      discovery = { ok: true, models: preview.models }
    } catch (discoveryError) {
      discovery = {
        ok: false,
        error: discoveryError instanceof Error ? discoveryError.message : 'Model discovery failed.',
      }
    }

    await ensureProviderRuntime(container, { force: true })

    if (!discovery.ok && record.defaultModel) {
      await upsertCatalogEntry(service, scope, {
        providerId: record.id,
        modelId: record.defaultModel,
        name: record.defaultModel,
        enabled: true,
        builtin: false,
      })
    }

    const freshConfig = await loadProviderConfig(service)
    const entries = await loadModelCatalog(service, scope)
    const rows = buildProviderRows(freshConfig, entries)
    return NextResponse.json({ provider: rows.find((row) => row.id === record.id) ?? null, discovery })
  } catch (error) {
    logger.error('POST provider failed', error)
    return NextResponse.json({ error: 'Failed to create the provider.' }, { status: 500 })
  }
}
