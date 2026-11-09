import { NextResponse, type NextRequest } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { buildCrmNavigation, SCENE_MAP, type CoreNavPayload } from '@/nav/crm-navigation'

/**
 * Backend chrome payload for the CRM five-scene shell.
 *
 * The core endpoint stays the single source of truth for what a caller may see:
 * this route calls it with the caller's own cookies, then re-buckets the result.
 * The shell receives no default nav groups (the left rail is rendered by the
 * app-owned scene widget), no settings/profile section rails (so the left rail
 * never turns into a second- or third-level tree), and a `crm` catalogue that
 * the scene pages and the sidebar consume.
 *
 * `settingsPathPrefixes` / `profilePathPrefixes` are preserved because the shell
 * uses them for organization-scope behaviour; only the section *lists* are
 * emptied, which is what keeps the rail constant.
 */

export const metadata = {
  GET: { requireAuth: true },
}

export const openApi: OpenApiRouteDoc = {
  tag: 'CRM Navigation',
  summary: 'Five-scene CRM navigation and management-centre catalogue',
  methods: {
    GET: {
      summary: 'Authorized navigation re-bucketed into five scenes, management centre and account area',
      responses: [
        { status: 200, description: 'Backend chrome payload with the CRM catalogue attached.' },
        { status: 401, description: 'Unauthenticated.' },
        { status: 502, description: 'The core navigation payload could not be read.' },
      ],
    },
  },
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let upstream: Response
  try {
    const url = new URL('/api/auth/admin/nav', req.url)
    const headers = new Headers({ accept: 'application/json' })
    const cookie = req.headers.get('cookie')
    if (cookie) headers.set('cookie', cookie)
    upstream = await fetch(url, { headers, cache: 'no-store' })
  } catch (error) {
    console.error('[crm_navigation] core nav request failed', error)
    return NextResponse.json({ error: 'Navigation is unavailable.' }, { status: 502 })
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Navigation is unavailable.' }, { status: upstream.status === 401 ? 401 : 502 })
  }

  let payload: CoreNavPayload
  try {
    payload = (await upstream.json()) as CoreNavPayload
  } catch (error) {
    console.error('[crm_navigation] core nav response was not JSON', error)
    return NextResponse.json({ error: 'Navigation is unavailable.' }, { status: 502 })
  }

  const catalog = buildCrmNavigation(payload, SCENE_MAP)
  if (catalog.unknown.length > 0) {
    // Explicit ownership is the invariant: a new entry must be mapped, not
    // absorbed by a catch-all group. The CI check fails on this; production
    // logs it so a silently-missing entry is visible without a rebuild.
    console.warn('[crm_navigation] unauthorized or unmapped nav entries:', catalog.unknown)
  }

  return NextResponse.json({
    ...payload,
    // Rendered by the app-owned scene widget instead of the shell's group list.
    groups: [],
    // Section rails would replace the scene rail on settings/profile paths.
    settingsSections: [],
    profileSections: [],
    crm: catalog,
  })
}
