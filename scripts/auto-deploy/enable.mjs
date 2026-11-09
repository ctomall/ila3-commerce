/**
 * Install/enable gate for the auto-deploy timer.
 *
 * Usage:
 *   node scripts/auto-deploy/enable.mjs --dry-run
 *   sudo -n node scripts/auto-deploy/enable.mjs --enable --allow-production
 *
 * --enable refuses unless a successful CI gate, both failure drills, and a
 * verified release for HEAD are all present. This script is intentionally NOT
 * run by the task that created it because the repository CI has no test step.
 */
import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {
  CURRENT_LINK,
  DRILLS_DIR,
  STATE_DIR,
  ensureDirs,
  readJson,
  readLink,
  resolveSha,
} from './lib.mjs'
import {verifyRelease} from './release.mjs'

const UNIT_DIR = '/etc/systemd/system'
const SERVICE = 'ila3-auto-deploy.service'
const APP_SERVICE = 'ila3-auto-deploy-app.service'
const TIMER = 'ila3-auto-deploy.timer'
const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'systemd')

function checkPrerequisites({allowProduction, replaceMercato}) {
  const reasons = []
  const sha = resolveSha('HEAD')
  const gate = readJson(path.join(STATE_DIR, 'gates', 'latest.json'))
  if (!gate) reasons.push('no CI gate evidence at state/gates/latest.json')
  else if (gate.sha !== sha) reasons.push(`CI gate is for ${gate.sha}, HEAD is ${sha}`)
  else if (!gate.allow) reasons.push(`CI gate denies: ${gate.reason}`)

  const drills = readJson(path.join(DRILLS_DIR, 'latest.json'))
  if (!drills) reasons.push('no drill evidence at state/drills/latest.json')
  else if (!drills.passed) reasons.push('failure drills have not both passed')
  else if (drills.sha !== sha) reasons.push(`drills are for ${drills.sha}, HEAD is ${sha}`)

  const currentRaw = readLink(CURRENT_LINK)
  if (!currentRaw) reasons.push('no current release symlink')
  else {
    const current = path.isAbsolute(currentRaw) ? currentRaw : path.resolve(path.dirname(CURRENT_LINK), currentRaw)
    const verified = verifyRelease(current, sha)
    if (!verified.ok) reasons.push(`current release is not verified for HEAD: ${verified.reason}`)
  }

  if (!allowProduction && process.env.ILA3_ALLOW_PRODUCTION !== '1') {
    reasons.push('production switch not authorized (pass --allow-production or set ILA3_ALLOW_PRODUCTION=1)')
  }
  const mercato = run('systemctl', ['is-active', 'mercato.service'])
  if (mercato.stdout === 'active' && !replaceMercato) {
    reasons.push('mercato.service still owns port 3000; pass --replace-mercato for an explicit cutover')
  }
  return {sha, gate, drills, reasons}
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {encoding: 'utf8', timeout: 60000})
  return {status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim()}
}

function main() {
  ensureDirs()
  const argv = process.argv.slice(2)
  const enable = argv.includes('--enable')
  const allowProduction = argv.includes('--allow-production')
  const prereq = checkPrerequisites({allowProduction, replaceMercato: argv.includes('--replace-mercato')})
  const summary = {sha: prereq.sha, enable, allowProduction, reasons: prereq.reasons, installed: false, enabled: false}
  if (prereq.reasons.length > 0) {
    console.log(JSON.stringify({...summary, decision: 'refuse'}, null, 2))
    process.exit(2)
  }
  if (!enable) {
    console.log(JSON.stringify({...summary, decision: 'dry-run-ok'}, null, 2))
    process.exit(0)
  }
  const replaceMercato = argv.includes('--replace-mercato')
  if (replaceMercato) {
    const stopped = run('sudo', ['-n', 'systemctl', 'disable', '--now', 'mercato.service'])
    if (stopped.status !== 0) throw new Error(`stopping mercato.service failed: ${stopped.stderr}`)
  }
  for (const unit of [SERVICE, APP_SERVICE, TIMER]) {
    const source = path.join(TEMPLATE_DIR, unit)
    const target = path.join(UNIT_DIR, unit)
    const copy = run('sudo', ['-n', 'install', '-m', '0644', source, target])
    if (copy.status !== 0) throw new Error(`install ${unit} failed: ${copy.stderr}`)
  }
  const reload = run('sudo', ['-n', 'systemctl', 'daemon-reload'])
  if (reload.status !== 0) throw new Error(`daemon-reload failed: ${reload.stderr}`)
  const started = run('sudo', ['-n', 'systemctl', 'enable', '--now', TIMER])
  if (started.status !== 0) throw new Error(`enable ${TIMER} failed: ${started.stderr}`)
  const isActive = run('systemctl', ['is-active', TIMER])
  console.log(JSON.stringify({...summary, decision: 'enabled', installed: true, enabled: true, active: isActive.stdout}, null, 2))
}

try {
  main()
} catch (error) {
  console.error(`[enable] fatal: ${error?.stack || error}`)
  process.exit(3)
}
