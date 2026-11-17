import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { assignedPresets } from '../../lib/layout'
import { loadLayout, loadPreference } from '../../lib/repository'
import { resolveWorkspaceScope } from '../../lib/scope'

export const metadata = { GET: { requireAuth: true } }

const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaces: z.array(z.string()),
  landing: z.string().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Workspace settings',
  summary: 'Presets assigned to the caller',
  methods: {
    GET: {
      summary: 'List the presets an administrator assigned to the caller',
      responses: [
        { status: 200, description: 'Assigned presets plus the caller’s current selection.', schema: z.object({ presets: z.array(presetSchema), selectedPreset: z.string().nullable() }) },
        { status: 400, description: 'No single organization is selected.' },
        { status: 401, description: 'Unauthenticated.' },
      ],
    },
  },
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const scope = await resolveWorkspaceScope(req, auth)
  if (!scope) {
    return NextResponse.json(
      { error: 'Select a single organization to read presets', code: 'organization_required' },
      { status: 400 },
    )
  }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  const { config } = await loadLayout(em, scope)
  const { value: preference } = await loadPreference(em, scope)
  const known = new Set(config.presets.map((preset) => preset.id))
  const presets = assignedPresets(config, scope.userId, known)
  const selectedPreset = preference.selectedPreset && presets.some((preset) => preset.id === preference.selectedPreset)
    ? preference.selectedPreset
    : null
  return NextResponse.json({ presets, selectedPreset }, { headers: { 'Cache-Control': 'no-store' } })
}
