import { NextResponse, type NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

export const metadata = {
  GET: { requireAuth: true },
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Identity of the caller, for shell widgets that render outside the routed page.
 *
 * The sidebar footer needs the account name but sits above the page tree, where
 * the server-rendered layout props are not available. Only the caller's own
 * identity is returned.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const record = auth as unknown as { email?: string | null; name?: string | null; sub?: string }
  return NextResponse.json({
    email: record.email ?? null,
    name: record.name ?? null,
  })
}
