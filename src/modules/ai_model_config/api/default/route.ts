import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { loadModelCatalog, type ModelCatalogScope } from '../../lib/catalog'
import {
  ensureProviderRuntime,
  resolveModuleConfigService,
} from '../../lib/provider-config'
import { clearSystemDefaultModel, setSystemDefaultModel } from '../../lib/model-sync'

export const openApi: OpenApiRouteDoc = {
  tag: 'AI Model Configuration',
  summary: 'System-wide default (base) model',
  methods: {
    PUT: {
      summary: 'Set the system-wide AI base model',
      responses: [{ status: 200, description: 'The new system default.' }],
      errors: [{ status: 400, description: 'Unknown provider or model not in the catalog.' }],
    },
    DELETE: {
      summary: 'Clear the system-wide default model',
      responses: [{ status: 200, description: 'Default cleared; environment values are restored.' }],
    },
  },
}

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['ai_assistant.settings.manage'] },
}

const bodySchema = z.object({
  providerId: z.string().min(1).max(64),
  modelId: z.string().min(1).max(256),
})

export async function PUT(req: NextRequest) {
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
  const parsed = bodySchema.safeParse(payload)
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
    const entries = await loadModelCatalog(service, scope)
    const model = entries.find(
      (entry) => entry.providerId === parsed.data.providerId
        && entry.modelId === parsed.data.modelId
        && entry.enabled,
    )
    if (!model) {
      return NextResponse.json(
        { error: 'Choose an enabled model from the catalog first.', code: 'model_not_found' },
        { status: 400 },
      )
    }
    const config = await setSystemDefaultModel(service, parsed.data.providerId, parsed.data.modelId)
    await ensureProviderRuntime(container, { force: true })
    return NextResponse.json({ systemDefault: config.defaultModel })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set the default model.' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: NextRequest) {
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
    const config = await clearSystemDefaultModel(service)
    await ensureProviderRuntime(container, { force: true })
    return NextResponse.json({ systemDefault: config.defaultModel })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clear the default model.' },
      { status: 500 },
    )
  }
}
