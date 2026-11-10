import { NextResponse, type NextRequest } from 'next/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { buildCrmNavigation } from '@/nav/crm-navigation'
import { buildShellChrome } from '@/nav/shell-chrome'
import { NAV_GROUP_CATALOG } from '@/lib/nav/group-catalog'
import { coreNavigationUrl, fetchCoreNavigation } from '../../lib/core-nav'

/**
 * Backend chrome payload for the declared CRM navigation.
 *
 * The core endpoint stays the single source of truth for what a caller may see:
 * this route calls it with the caller's own cookies, then arranges the result.
 *
 * The installed `AppShell` renders the sidebar itself (`renderSidebar` in
 * `@open-mercato/ui/src/backend/AppShell.tsx`): logo, search, uppercase group
 * headers, icon + label items, collapse and mobile drawer. v1 therefore returns
 * the catalogue's declared groups as real shell `groups` instead of leaving the
 * shell empty for an app-owned rail. `/backend/manage` is appended as its own
 * entry so the hidden management hub stays reachable; see `@/nav/shell-chrome`.
 *
 * `settingsSections` / `profileSections` are returned empty on purpose: v1 keeps
 * the sidebar constant on settings/profile routes (every settings page is listed
 * by `/backend/manage`, and per-user pages are reachable from the profile
 * dropdown). `settingsPathPrefixes` / `profilePathPrefixes` are emptied with
 * them so the shell never switches into an empty second-level panel.
 */

export const metadata = {
  GET: { requireAuth: true },
}

export const openApi: OpenApiRouteDoc = {
  tag: 'CRM Navigation',
  summary: 'Declared CRM navigation and management-centre catalogue',
  methods: {
    GET: {
      summary: 'Authorized navigation organized into declared top-level groups, management centre and account area',
      responses: [
        { status: 200, description: 'Backend chrome payload with the CRM catalogue attached.' },
        { status: 401, description: 'Unauthenticated.' },
        { status: 502, description: 'The core navigation payload could not be read.' },
        { status: 504, description: 'The core navigation payload timed out after bounded retries.' },
      ],
    },
  },
}

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Internal origin on purpose: the request URL may be the public tunnel host,
  // which this host cannot reach, and a self-fetch through it failed every nav read.
  const url = coreNavigationUrl()
  const timeoutMsRaw = Number(process.env.CRM_NAV_TIMEOUT_MS ?? '')
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw >= 500 ? Math.min(timeoutMsRaw, 15000) : 4000
  const result = await fetchCoreNavigation({
    url,
    cookie: req.headers.get('cookie'),
    timeoutMs,
    attempts: 2,
    onAttempt: (attempt) => {
      // Sanitized: attempt/status only. No headers, no cookie, no URL query.
      if (attempt.reason || (attempt.status ?? 0) >= 500) {
        console.warn('[crm_navigation] core nav attempt', attempt)
      }
    },
  })

  if (!result.ok) {
    const status = result.reason === 'upstream' && result.status === 401 ? 401 : result.status === 504 ? 504 : 502
    console.error('[crm_navigation] core nav unavailable', {
      reason: result.reason,
      status: result.status,
      attempts: result.attempts,
    })

    // The shell's injection provider refuses to mount ANY sidebar widget while
    // the chrome payload is absent. A real 502 therefore produced a blank rail
    // with no retry affordance. The API keeps its truthful 502 for callers; the
    // shell explicitly asks for this typed chrome fallback so its provider can
    // become ready and the app-owned rail can render the error + retry. No
    // groups are synthesized here.
    if (req.nextUrl.searchParams.get('chrome') === '1') {
      return NextResponse.json(
        {
          groups: [],
          settingsSections: [],
          profileSections: [],
          settingsPathPrefixes: [],
          profilePathPrefixes: [],
          grantedFeatures: [],
          crm: {
            version: 2,
            error: true,
            groups: [],
            railActions: [],
            utility: [],
            manage: { categories: [] },
            personal: { items: [] },
            unknown: [],
            unconfiguredGroups: [],
            actions: [],
            authorized: [],
            duplicates: [],
          },
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ error: 'Navigation is unavailable.' }, { status })
  }

  const payload = result.payload

  const catalog = buildCrmNavigation(payload, NAV_GROUP_CATALOG)
  if (catalog.unknown.length > 0) {
    // A declared entry with no usable owner must be visible, not absorbed by a
    // catch-all. The CI check fails on this; production logs it too.
    console.warn('[crm_navigation] unauthorized or unowned nav entries:', catalog.unknown)
  }
  if (catalog.unconfiguredGroups.length > 0) {
    // New module groups are still rendered (the shell appends them), but the
    // app-level catalogue should name them on the next IA pass.
    console.warn('[crm_navigation] page groups not yet organized:', catalog.unconfiguredGroups)
  }
  if (catalog.duplicates.length > 0) {
    console.warn('[crm_navigation] duplicate daily nav hrefs:', catalog.duplicates)
  }

  const { translate } = await resolveTranslations()
  // The shell renders these groups directly; the catalogue stays attached for
  // the management centre and the contract gate.
  const shell = buildShellChrome(catalog, translate)

  return NextResponse.json({
    ...payload,
    ...shell,
    crm: catalog,
  })
}
