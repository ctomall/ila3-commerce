import { NextResponse, type NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import {
  isSelfUpdateEnabled,
  isSuperAdmin,
  isUpdateUnitRunning,
  readLogTail,
  readRepoInfo,
  readState,
} from '../../lib/update'

export const metadata = {
  GET: { requireAuth: true },
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const [repo, state, log, unitActive] = await Promise.all([
    readRepoInfo(),
    readState(),
    readLogTail(),
    isUpdateUnitRunning(),
  ])

  return NextResponse.json({
    enabled: isSelfUpdateEnabled(),
    canManage: isSuperAdmin(auth),
    unitActive,
    state,
    repo,
    log,
  })
}
