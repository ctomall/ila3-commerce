/**
 * Health endpoint the assistant UI probes before it offers the chat panel.
 *
 * The packaged route asks an OpenCode server at `localhost:4096`; on a host
 * without that server it reports `{status:"error","message":"fetch failed"}`
 * and the UI hides/denies the assistant even though the DSH engine is healthy.
 * This handler answers the same shape for the switched engine, with the same
 * authentication and feature gate as the packaged route.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ai_assistant.view'] },
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const container = await createRequestContainer()
    const rbac = container.resolve<RbacService>('rbacService')
    const allowed = await rbac.userHasAllFeatures(auth.sub, ['ai_assistant.view'], {
      tenantId: auth.tenantId ?? null,
      organizationId: auth.orgId ?? null,
    })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Failed to check health' }, { status: 500 })
  }

  const bridge = process.env.OM_DSH_BRIDGE_URL?.trim() || null
  return NextResponse.json({
    status: 'ok',
    engine: 'dsh',
    healthy: true,
    url: null,
    mcpUrl: bridge,
  })
}
