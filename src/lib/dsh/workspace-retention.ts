/**
 * Bounded retention for per-run DSH workspaces.
 *
 * Every chat allocates `<root>/workspaces/<identity>/<runId>`. Without a sweep
 * these directories accumulate forever. This prunes run directories whose mtime
 * is older than the TTL; it never follows symlinks and only touches the two
 * expected levels under the workspace root.
 */
import { lstatSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export type PruneResult = { scanned: number; removed: number; skipped: number; errors: number }

export function pruneOldWorkspaces(input: {
  root: string
  ttlMs: number
  now?: number
}): PruneResult {
  const now = input.now ?? Date.now()
  const cutoff = now - input.ttlMs
  const workspacesRoot = join(input.root, 'workspaces')
  const result: PruneResult = { scanned: 0, removed: 0, skipped: 0, errors: 0 }

  let identities: string[]
  try {
    identities = readdirSync(workspacesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return result
  }

  for (const identity of identities) {
    const identityDir = join(workspacesRoot, identity)
    let runs: string[]
    try {
      runs = readdirSync(identityDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      result.errors += 1
      continue
    }
    for (const runName of runs) {
      const runDir = join(identityDir, runName)
      result.scanned += 1
      try {
        const stat = lstatSync(runDir)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          result.skipped += 1
          continue
        }
        if (stat.mtimeMs >= cutoff) continue
        rmSync(runDir, { recursive: true, force: true })
        result.removed += 1
      } catch {
        result.errors += 1
      }
    }
  }
  return result
}
