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
import { readDeploymentStatus } from '../../lib/deployment-reader'
import { readVersionSurfaces } from '../../lib/version-reader'
import type { VersionSurfaces } from '../../lib/versions'

export const metadata = {
  GET: { requireAuth: true },
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Read-only operator status. The release details (paths, run records, version
 * surfaces) are only returned to a superadmin: hiding the page is not a server
 * control, so a non-superadmin session gets a minimal payload instead of the
 * deployment inventory.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!isSuperAdmin(auth)) {
    return NextResponse.json({
      enabled: isSelfUpdateEnabled(),
      canManage: false,
      unitActive: false,
      state: null,
      repo: { isRepo: false },
      log: [],
      deployment: null,
      versions: null,
    })
  }

  const [repo, state, log, unitActive, deployment] = await Promise.all([
    readRepoInfo(),
    readState(),
    readLogTail(),
    isUpdateUnitRunning(),
    readDeploymentStatus(),
  ])

  // A `running` record whose unit is gone is a dead build, not a live one: the process
  // that would have written the final state is the one that died. The record is kept and
  // the display is derived, so the page cannot show "running" for a failed update.
  const reconciled = reconcileLiveness(state, { unitActive, now: new Date() })

  // Version surfaces are a distinct, optional contract: a release that is still
  // rolling out may not have them, and a read failure must not hide the rest of
  // the page. `readVersionSurfaces` degrades per surface instead of throwing.
  let versions: VersionSurfaces | null = null
  let versionsError: string | null = null
  try {
    versions = await readVersionSurfaces(deployment)
  } catch (error) {
    versionsError = error instanceof Error ? error.message : String(error)
  }

  return NextResponse.json({
    enabled: isSelfUpdateEnabled(),
    canManage: true,
    unitActive,
    // Compatibility surface: the legacy updater's request state, reconciled for
    // liveness. `deployment` below is the authoritative release record.
    state: reconciled.state,
    stateDerived: reconciled.derived,
    repo,
    log,
    deployment,
    versions,
    versionsError,
  })
}
