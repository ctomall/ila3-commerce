import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { normalizeLayoutConfig } from '../../lib/layout'
import { loadLayout, saveLayout } from '../../lib/repository'
import { resolveWorkspaceScope, type WorkspaceScope } from '../../lib/scope'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['workspace_settings.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['workspace_settings.manage'] },
}

const layoutConfigSchema = z.object({
  version: z.literal(1).optional(),
  order: z.array(z.string()).max(50).optional(),
  hidden: z.array(z.string()).max(50).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  presets: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        workspaces: z.array(z.string()),
        landing: z.string().nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
  assignments: z.record(z.string(), z.array(z.string())).optional(),
})

const responseSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  revision: z.number().nullable(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Workspace settings',
  summary: 'Organization workspace order, visibility, labels and presets',
  methods: {
    GET: {
      summary: 'Read the organization workspace layout',
      responses: [
        { status: 200, description: 'Stored layout, or empty when none was saved.', schema: responseSchema },
        { status: 400, description: 'No single organization is selected.' },
        { status: 401, description: 'Unauthenticated.' },
        { status: 403, description: 'Missing workspace_settings.manage.' },
      ],
    },
    PUT: {
      summary: 'Replace the organization workspace layout',
      requestBody: { schema: z.object({ config: layoutConfigSchema }) },
      responses: [
        { status: 200, description: 'Normalized layout that was stored.', schema: responseSchema },
        { status: 400, description: 'Invalid layout document or no organization selected.' },
        { status: 401, description: 'Unauthenticated.' },
        { status: 403, description: 'Missing workspace_settings.manage.' },
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
        { error: 'Select a single organization to manage its navigation', code: 'organization_required' },
        { status: 400 },
      ),
    }
  }
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  return { scope, em }
}

export async function GET(req: NextRequest) {
  const ctx = await context(req)
  if (ctx.error) return ctx.error
  const stored = await loadLayout(ctx.em, ctx.scope)
  return NextResponse.json(stored, { headers: { 'Cache-Control': 'no-store' } })
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
  const candidate = (body as { config?: unknown } | null)?.config
  const parsed = normalizeLayoutConfig(candidate)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: 'invalid_layout' }, { status: 400 })
  }
  const saved = await saveLayout(ctx.em, ctx.scope, parsed.config)
  return NextResponse.json(saved, { headers: { 'Cache-Control': 'no-store' } })
}
