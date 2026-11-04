import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  AI_MODEL_TAGS,
  deleteCatalogEntry,
  loadModelCatalog,
  updateCatalogEntry,
  type ModelCatalogScope,
  type ModuleConfigServiceLike,
} from '../../../lib/catalog'
import { ensureProviderRuntime, loadProviderConfig, saveProviderConfig } from '../../../lib/provider-config'

const logger = { error: (...args: unknown[]) => console.error('[ai_model_config]', ...args) }

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'Update or delete a model catalog entry',
  methods: {
    PUT: {
      summary: 'Update a catalog entry (custom model or built-in override)',
      responses: [{ status: 200, description: 'The updated catalog entry.' }],
      errors: [
        { status: 400, description: 'Validation error.' },
        { status: 404, description: 'Entry not found.' },
      ],
    },
    DELETE: {
      summary: 'Delete a catalog entry',
      description:
        'Deleting a built-in override restores the model that ships with the provider; deleting a custom model removes it.',
      responses: [{ status: 200, description: 'Whether an entry was removed.' }],
      errors: [{ status: 404, description: 'Entry not found.' }],
    },
  },
}

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

const updateSchema = z.object({
  providerId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(200).optional(),
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

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
    const scope: ModelCatalogScope = {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    }
    const entry = await updateCatalogEntry(service, scope, id, parsed.data)
    if (!entry) {
      return NextResponse.json({ error: 'Model not found.', code: 'not_found' }, { status: 404 })
    }
    return NextResponse.json({ entry })
  } catch (error) {
    logger.error('PUT failed', error)
    return NextResponse.json({ error: 'Failed to update the model.' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

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
    const entries = await loadModelCatalog(service, scope)
    const target = entries.find((entry) => entry.id === id)
    const removed = await deleteCatalogEntry(service, scope, id)
    if (!removed) {
      return NextResponse.json({ error: 'Model not found.', code: 'not_found' }, { status: 404 })
    }
    if (target) {
      const config = await loadProviderConfig(service)
      if (config.defaultModel
        && config.defaultModel.providerId === target.providerId
        && config.defaultModel.modelId === target.modelId) {
        config.defaultModel = null
        await saveProviderConfig(service, config)
        await ensureProviderRuntime(container, { force: true })
      }
    }
    return NextResponse.json({ removed: true })
  } catch (error) {
    logger.error('DELETE failed', error)
    return NextResponse.json({ error: 'Failed to delete the model.' }, { status: 500 })
  }
}
