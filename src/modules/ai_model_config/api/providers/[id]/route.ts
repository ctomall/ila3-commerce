import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { llmProviderRegistry } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/llm-registry'
import {
  deleteCatalogEntry,
  loadModelCatalog,
  upsertCatalogEntry,
  type ModelCatalogScope,
} from '../../../lib/catalog'
import { encryptSecret } from '../../../lib/credentials'
import {
  buildProviderRows,
  ensureProviderRuntime,
  loadProviderConfig,
  resolveModuleConfigService,
  saveProviderConfig,
  upsertCredential,
} from '../../../lib/provider-config'
import { previewProviderModels } from '../../../lib/model-sync'

const logger = { error: (...args: unknown[]) => console.error('[ai_model_config]', ...args) }

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'Update credentials / custom provider, or delete a custom provider',
  methods: {
    PUT: {
      summary: 'Update a provider (built-in credentials or custom provider metadata)',
      responses: [{ status: 200, description: 'The updated provider row.' }],
      errors: [
        { status: 400, description: 'Validation error.' },
        { status: 404, description: 'Provider not found.' },
      ],
    },
    DELETE: {
      summary: 'Delete a custom provider and its models',
      responses: [{ status: 200, description: 'Whether the provider was removed.' }],
      errors: [{ status: 400, description: 'Built-in providers cannot be deleted.' }],
    },
  },
}

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  baseURL: z.string().url().max(2048).optional(),
  apiKey: z.string().max(4096).optional(),
  defaultModel: z.string().max(256).optional(),
  enabled: z.boolean().optional(),
  clear: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const providerId = id.trim().toLowerCase()

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.', code: 'validation_error' }, { status: 400 })
  }
  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body.', code: 'validation_error', issues: parsed.error.issues },
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
    const customIndex = config.customProviders.findIndex((provider) => provider.id === providerId)
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }

    let discovery: { ok: boolean; models?: Array<{ id: string; name: string }>; error?: string } = { ok: false }
    let shouldSync = false

    if (customIndex >= 0) {
      const existing = config.customProviders[customIndex]
      const apiKey = parsed.data.apiKey?.trim()
      config.customProviders[customIndex] = {
        ...existing,
        name: parsed.data.name?.trim() || existing.name,
        baseURL: parsed.data.baseURL?.trim() || existing.baseURL,
        apiKeyEnc: apiKey && apiKey.length > 0 ? encryptSecret(apiKey) : existing.apiKeyEnc,
        defaultModel: parsed.data.defaultModel?.trim() ?? existing.defaultModel,
        enabled: parsed.data.enabled === undefined ? existing.enabled : parsed.data.enabled !== false,
        updatedAt: new Date().toISOString(),
      }
      await saveProviderConfig(service, config)
      shouldSync = true
    } else {
      if (!llmProviderRegistry.get(providerId)) {
        return NextResponse.json({ error: 'Provider not found.', code: 'not_found' }, { status: 404 })
      }
      await upsertCredential(service, providerId, {
        apiKey: parsed.data.apiKey,
        baseURL: parsed.data.baseURL,
        clear: parsed.data.clear,
      })
      shouldSync = parsed.data.clear !== true
    }

    if (shouldSync) {
      try {
        const preview = await previewProviderModels(service, providerId)
        discovery = { ok: true, models: preview.models }
      } catch (discoveryError) {
        discovery = {
          ok: false,
          error: discoveryError instanceof Error ? discoveryError.message : 'Model discovery failed.',
        }
      }
    }

    await ensureProviderRuntime(container, { force: true })

    if (!discovery.ok && customIndex >= 0) {
      const defaultModel = config.customProviders[customIndex]?.defaultModel
      if (defaultModel) {
        await upsertCatalogEntry(service, scope, {
          providerId,
          modelId: defaultModel,
          name: defaultModel,
          enabled: true,
          builtin: false,
        })
      }
    }

    const entries = await loadModelCatalog(service, scope)
    const effectiveConfig = await loadProviderConfig(service)
    const rows = buildProviderRows(effectiveConfig, entries)
    return NextResponse.json({ provider: rows.find((row) => row.id === providerId) ?? null, discovery })
  } catch (error) {
    logger.error('PUT provider failed', error)
    return NextResponse.json({ error: 'Failed to update the provider.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const providerId = id.trim().toLowerCase()

  try {
    const container = await createRequestContainer()
    const service = resolveModuleConfigService(container)
    if (!service) {
      return NextResponse.json({ error: 'Configuration storage is unavailable.' }, { status: 500 })
    }
    const config = await loadProviderConfig(service)
    const exists = config.customProviders.some((provider) => provider.id === providerId)
    if (!exists) {
      return NextResponse.json(
        { error: 'Only custom providers can be deleted.', code: 'not_custom' },
        { status: 400 },
      )
    }
    config.customProviders = config.customProviders.filter((provider) => provider.id !== providerId)
    delete config.credentials[providerId]
    if (config.defaultModel?.providerId === providerId) config.defaultModel = null
    await saveProviderConfig(service, config)
    await ensureProviderRuntime(container, { force: true })

    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    const entries = await loadModelCatalog(service, scope)
    for (const entry of entries.filter((model) => model.providerId === providerId)) {
      await deleteCatalogEntry(service, scope, entry.id)
    }
    return NextResponse.json({ removed: true })
  } catch (error) {
    logger.error('DELETE provider failed', error)
    return NextResponse.json({ error: 'Failed to delete the provider.' }, { status: 500 })
  }
}
