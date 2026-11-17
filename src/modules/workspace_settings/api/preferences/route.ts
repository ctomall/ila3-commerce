import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { EMPTY_PREFERENCE, normalizePreference } from '../../lib/preferences'
import { loadPreference, savePreference } from '../../lib/repository'
import { resolveWorkspaceScope, type WorkspaceScope } from '../../lib/scope'

export const metadata = {
  GET: { requireAuth: true },
  PUT: { requireAuth: true },
}

const preferenceSchema = z.object({
  favorites: z.array(z.string()).max(100).optional(),
  recentWorkspace: z.string().nullable().optional(),
  selectedPreset: z.string().nullable().optional(),
})

const responseSchema = z.object({ preference: preferenceSchema, updatedAt: z.string().nullable() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Workspace settings',
  summary: 'Per-user navigation preference',
  methods: {
    GET: {
      summary: 'Read the caller’s navigation preference',
      responses: [
        { status: 200, description: 'Stored preference, or empty when none was saved or no single organization is selected.', schema: responseSchema },
        { status: 401, description: 'Unauthenticated.' },
      ],
    },
    PUT: {
      summary: 'Replace the caller’s navigation preference',
      requestBody: { schema: preferenceSchema },
      responses: [
        { status: 200, description: 'Normalized preference that was stored.', schema: responseSchema },
        { status: 400, description: 'Invalid preference or no organization selected.' },
        { status: 401, description: 'Unauthenticated.' },
      ],
    },
  },
}

type RouteContext =
  | { error: NextResponse; scope?: undefined; em?: undefined }
  | { error?: undefined; scope: WorkspaceScope; em: EntityManager }

async function context(req: NextRequest): Promise<RouteContext> {
  const auth = await getAuthFromRequest(req)
  if (!auth) return { error: NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 }) }
  const scope = await resolveWorkspaceScope(req, auth)
  if (!scope) {
    return {
      error: NextResponse.json(
        { error: 'Select a single organization to store navigation preferences', code: 'organization_required' },
        { status: 400 },
      ),
    }
  }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  return { scope, em }
}

export async function GET(req: NextRequest) {
  // Reading a per-user preference must not fail just because the caller has no
  // single organization selected (superadmin "all organizations", pages opened
  // before a scope is chosen). There is nothing stored at that scope, so the
  // answer is the empty preference; only writing needs a concrete scope.
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const scope = await resolveWorkspaceScope(req, auth)
  if (!scope) {
    return NextResponse.json(
      { preference: EMPTY_PREFERENCE, updatedAt: null },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  const stored = await loadPreference(em, scope)
  return NextResponse.json({ preference: stored.value, updatedAt: stored.updatedAt }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest) {
  const ctx = await context(req)
  if (ctx.error) return ctx.error
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'invalid_json' }, { status: 400 })
  }
  const parsed = normalizePreference(body)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: 'invalid_preference' }, { status: 400 })
  }
  const stored = await savePreference(ctx.em, ctx.scope, parsed.value)
  return NextResponse.json({ preference: stored.value, updatedAt: stored.updatedAt }, { headers: { 'Cache-Control': 'no-store' } })
}
