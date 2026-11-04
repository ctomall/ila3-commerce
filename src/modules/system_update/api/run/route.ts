import { NextResponse, type NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import {
  isSelfUpdateEnabled,
  isSuperAdmin,
  isUpdateUnitRunning,
  normalizeRef,
  readRepoInfo,
  readState,
  requestSelfUpdate,
} from '../../lib/update'

export const metadata = {
  POST: { requireAuth: true },
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Same-origin guard. The session cookie is the primary control; this rejects a
 * cross-site form/fetch that somehow carries it.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser clients (curl) have no Origin; auth still applies
  try {
    return new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ error: 'forbidden', detail: 'superadmin role required' }, { status: 403 })
  }
  if (!isSelfUpdateEnabled()) {
    return NextResponse.json(
      { error: 'disabled', detail: 'ENABLE_SELF_UPDATE is not true' },
      { status: 503 },
    )
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'cross-origin request rejected' }, { status: 403 })
  }

  let body: { ref?: unknown; force?: unknown; confirm?: unknown } = {}
  try {
    body = (await req.json()) as { ref?: unknown; force?: unknown; confirm?: unknown }
  } catch {
    body = {}
  }

  const rawRef = typeof body.ref === 'string' ? body.ref.trim() : ''
  const ref = rawRef ? normalizeRef(rawRef) : null
  if (rawRef && !ref) {
    return NextResponse.json({ error: 'invalid ref' }, { status: 400 })
  }

  // Explicit confirmation: the caller must echo the commit it believes is
  // deployed. This makes an accidental click, a replayed request or a stale tab
  // fail instead of restarting production.
  const repo = await readRepoInfo()
  const expected = repo.shortCommit ?? ''
  const provided = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : ''
  if (!expected || provided !== expected.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'confirmation required',
        detail: `send {"confirm":"${expected}"} — the short commit currently deployed`,
      },
      { status: 409 },
    )
  }

  const current = await readState()
  if (current?.status === 'running' || (await isUpdateUnitRunning())) {
    return NextResponse.json(
      { error: 'already running', state: current },
      { status: 409 },
    )
  }

  const actor = typeof auth.email === 'string' && auth.email ? auth.email : String(auth.sub ?? 'unknown')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  console.log(
    `[system_update] upgrade requested actor=${actor} ip=${ip} from=${expected} ref=${ref ?? 'origin/HEAD'} force=${body.force === true}`,
  )
  try {
    await requestSelfUpdate({ ref, force: body.force === true, actor })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'start failed', detail: message }, { status: 500 })
  }

  return NextResponse.json({ started: true, ref, force: body.force === true, actor }, { status: 202 })
}
