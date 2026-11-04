import { NextResponse, type NextRequest } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { loadModelCatalog, type ModelCatalogScope } from '../../../../lib/catalog'
import { ensureProviderRuntime, resolveModuleConfigService } from '../../../../lib/provider-config'
import { importProviderModels, previewProviderModels, syncProviderModels } from '../../../../lib/model-sync'

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'Fetch and import the models exposed by a provider',
  methods: {
    POST: {
      summary: "Call the provider's /models endpoint and import new model ids",
      responses: [{ status: 200, description: 'Import summary and the refreshed model list.' }],
      errors: [
        { status: 400, description: 'Discovery failed (missing key, bad endpoint, provider error).' },
        { status: 404, description: 'Provider not found.' },
      ],
    },
  },
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }

    let body: { preview?: boolean; models?: Array<{ id: string; name?: string }> } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    if (body.preview === true) {
      const preview = await previewProviderModels(service, providerId)
      return NextResponse.json({ ok: true, preview: true, models: preview.models })
    }

    if (Array.isArray(body.models) && body.models.length > 0) {
      const models = body.models
        .filter((model) => typeof model?.id === 'string' && model.id.trim().length > 0)
        .map((model) => ({ id: model.id.trim(), name: (model.name ?? model.id).trim() }))
      const result = await importProviderModels(service, scope, providerId, models, { setDefault: true })
      await ensureProviderRuntime(container, { force: true })
      const entries = await loadModelCatalog(service, scope)
      return NextResponse.json({
        ok: true,
        imported: result.imported,
        total: result.total,
        defaultModel: result.defaultModel,
        models: entries.filter((entry) => entry.providerId === providerId),
      })
    }

    const result = await syncProviderModels(service, scope, providerId, { setDefault: true })
    await ensureProviderRuntime(container, { force: true })
    const entries = await loadModelCatalog(service, scope)
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      total: result.total,
      defaultModel: result.defaultModel,
      models: entries.filter((entry) => entry.providerId === providerId),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch models from the provider.',
        code: 'discovery_failed',
      },
      { status: 400 },
    )
  }
}
