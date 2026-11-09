/**
 * Drill: a release whose NEW migration is destructive must be refused by the
 * deploy executor BEFORE any switch. The previous release must stay current and
 * no app process may be started.
 *
 * The two releases are synthetic fixtures (release.json + build-info + BUILD_ID
 * + a migration file); nothing is installed, built or started. ILA3_RELEASE_ROOT
 * and ILA3_STATE_DIR point into a temp directory so production state is never
 * read or written, and ILA3_APP_DIR points at this checkout so the executor's
 * checker state lands here, not in the production worktree.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-migration-refusal-'))
const RELEASES = path.join(BASE, 'releases')
const STATE = path.join(BASE, 'state')
const OLD_SHA = spawnSync('git', ['rev-parse', 'HEAD~1'], {cwd: REPO, encoding: 'utf8'}).stdout.trim()
const NEW_SHA = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).stdout.trim()
if (!/^[0-9a-f]{40}$/.test(OLD_SHA) || !/^[0-9a-f]{40}$/.test(NEW_SHA)) {
  throw new Error('could not resolve drill SHAs')
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

function makeRelease(dir, sha, {migration = null} = {}) {
  fs.rmSync(dir, {recursive: true, force: true})
  write(path.join(dir, 'package.json'), JSON.stringify({name: 'migration-refusal-drill', version: '0.0.0'}))
  write(path.join(dir, 'release.json'), JSON.stringify({schema: 1, status: 'ok', sha, shortSha: sha.slice(0, 8)}))
  write(
    path.join(dir, '.mercato', 'build-info.json'),
    JSON.stringify({status: 'ok', commit: sha.slice(0, 8), version: '0.0.0'}),
  )
  write(path.join(dir, '.mercato', 'next', 'BUILD_ID'), 'refusal-drill\n')
  if (migration) {
    write(path.join(dir, 'src', 'modules', 'demo', 'migrations', 'MigrationRefusal.ts'), migration)
  }
  return dir
}

const tsMigration = (sql) => `import { Migration } from '@mikro-orm/migrations'
export class MigrationRefusal extends Migration {
  override up(): void {
    this.addSql(\`${sql}\`)
  }
}`

const oldDir = makeRelease(path.join(RELEASES, OLD_SHA), OLD_SHA)
const newDir = makeRelease(path.join(RELEASES, NEW_SHA), NEW_SHA, {
  migration: tsMigration('drop table "communication_channels_send_requests";'),
})
fs.symlinkSync(oldDir, path.join(RELEASES, 'current'))

const run = spawnSync(
  process.execPath,
  [
    path.join(REPO, 'scripts', 'auto-deploy', 'deploy.mjs'),
    '--drill',
    '--pid-mode',
    '--skip-ci-gate',
    '--json',
    '--release-dir', newDir,
    '--sha', NEW_SHA,
    '--target-port', '3217',
    '--candidate-port', '3117',
    '--drain-timeout-ms', '0',
  ],
  {
    cwd: REPO,
    encoding: 'utf8',
    env: {
      ...process.env,
      ILA3_RELEASE_ROOT: RELEASES,
      ILA3_STATE_DIR: STATE,
      ILA3_APP_DIR: REPO,
      ILA3_LOCK_PATH: path.join(STATE, 'deploy.lock'),
    },
    timeout: 300000,
  },
)

let summary = null
try {
  summary = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')))
} catch {
  summary = null
}
const currentLink = fs.readlinkSync(path.join(RELEASES, 'current'))
const result = {
  drill: 'migration-refusal',
  exitCode: run.status,
  errorCode: summary?.error?.code ?? null,
  result: summary?.result ?? null,
  switchedToOld: path.resolve(currentLink) === path.resolve(oldDir),
  candidateStarted: Boolean(summary?.candidate),
  record: summary?.record ?? null,
  passed:
    run.status !== 0 &&
    (summary?.error?.code === 'migration-preflight-failed') &&
    path.resolve(currentLink) === path.resolve(oldDir) &&
    !summary?.candidate,
}
console.log(JSON.stringify(result, null, 2))
fs.rmSync(BASE, {recursive: true, force: true})
process.exit(result.passed ? 0 : 1)
