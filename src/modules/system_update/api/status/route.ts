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
import { reconcileLiveness } from '../../lib/liveness'

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

  // A `running` record whose unit is gone is a dead build, not a live one: the process
  // that would have written the final state is the one that died. The record is kept and
  // the display is derived, so the page cannot show "running" for a failed update.
  const reconciled = reconcileLiveness(state, { unitActive, now: new Date() })

  return NextResponse.json({
    enabled: isSelfUpdateEnabled(),
    canManage: isSuperAdmin(auth),
    unitActive,
    state: reconciled.state,
    stateDerived: reconciled.derived,
    repo,
    log,
  })
}
