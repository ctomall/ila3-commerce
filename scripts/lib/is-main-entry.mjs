import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Is this module the entry point the user invoked?
 *
 * The obvious comparison (`path.resolve(argv[1]) === fileURLToPath(import.meta.url)`)
 * silently fails when the script is reached through a symlink — and releases are
 * served from `/home/pro/releases/mercato/current`, a symlink. Running one of
 * these CLIs via that path then exits 0 without doing anything, which looks like
 * "nothing to report" instead of "never ran".
 *
 * Both sides are realpath-normalised before comparing. A path that cannot be
 * resolved (e.g. argv[1] missing) simply does not match.
 */
export function isMainEntry(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false
  let here
  try {
    here = fs.realpathSync(fileURLToPath(importMetaUrl))
  } catch {
    here = fileURLToPath(importMetaUrl)
  }
  let invoked
  try {
    invoked = fs.realpathSync(path.resolve(argv1))
  } catch {
    invoked = path.resolve(argv1)
  }
  return here === invoked
}
