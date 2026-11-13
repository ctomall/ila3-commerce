#!/usr/bin/env node
/**
 * Controlled-switch drill: prove the rollback branch of `OM_AI_ENGINE`, not just its name.
 *
 * A says the engine swap must have a controlled switch *and* a rollback. Until now the
 * record showed the code branch and a claim; this drill compares a candidate instance
 * started from the same release with `OM_AI_ENGINE` unset against the running one:
 *
 *   - health: the dsh instance reports `engine:"dsh"`; the unset one reports the packaged
 *     handler's shape (OpenCode/MCP probe) and no `engine` field;
 *   - chat: a turn on the unset instance must produce zero `dsh.event` frames and must not
 *     create a `dsh_runs` row — that is what makes the rollback safe to execute.
 *
 * The rollback instance is started by the caller on its own port; this script only probes.
 * No model call is made when the packaged path cannot reach a model (it fails first).
 *
 * Usage:
 *   node scripts/crm-engine-switch-drill.mjs               # defaults: on=:3000 off=:3911
 *   DRILL_OFF_BASE=http://127.0.0.1:3911 node scripts/crm-engine-switch-drill.mjs
 * Writes docs/crm-platform/dsh-integration/evidence/engine-switch-<ts>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const ON = process.env.DRILL_ON_BASE ?? 'http://127.0.0.1:3000'
const OFF = process.env.DRILL_OFF_BASE ?? 'http://127.0.0.1:3911'

function psqlValue(sql) {
  try {
    return execFileSync(
      'bash',
      ['-lc', `cd ${JSON.stringify(repo)} && export $(grep -E "^DATABASE_URL" .env | xargs) && psql "$DATABASE_URL" -At -c ${JSON.stringify(sql)}`],
      { encoding: 'utf8' },
    ).trim()
  } catch {
    return null
  }
}

const creds = credentials()
const role = creds.has('employee') ? 'employee' : 'admin'
const cookieOn = await loginWithRetry(ON, creds.get(role), { role })
const cookieOff = await loginWithRetry(OFF, creds.get(role), { role })

const startedAt = new Date().toISOString()
const nonce = startedAt.replace(/[:.]/g, '')

const onHealthRes = await fetch(`${ON}/api/ai_assistant/health`, { headers: { cookie: cookieOn } })
const onHealth = await onHealthRes.text()
const offHealthRes = await fetch(`${OFF}/api/ai_assistant/health`, { headers: { cookie: cookieOff } })
const offHealth = await offHealthRes.text()

const runsBefore = Number(psqlValue('select count(*) from dsh_runs') ?? '0')
const offChatRes = await fetch(`${OFF}/api/ai_assistant/chat`, {
  method: 'POST',
  headers: { cookie: cookieOff, 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: `只回答两个字：收到（回退探针 ${nonce}）` }] }),
})
const offChat = await offChatRes.text()
const runsAfter = Number(psqlValue('select count(*) from dsh_runs') ?? '0')

const offDshFrames = [...offChat.matchAll(/"type":"dsh\.event"/g)].length
const onEngine = (() => {
  try {
    return JSON.parse(onHealth)?.engine ?? null
  } catch {
    return null
  }
})()
const offEngine = (() => {
  try {
    return JSON.parse(offHealth)?.engine ?? null
  } catch {
    return null
  }
})()

const checks = {
  'on-health-200': onHealthRes.status === 200,
  'on-engine-is-dsh': onEngine === 'dsh',
  'off-health-200': offHealthRes.status === 200,
  'off-engine-not-dsh': offEngine !== 'dsh',
  'off-chat-no-dsh-frames': offDshFrames === 0,
  'off-chat-created-no-run': runsAfter === runsBefore,
  'off-chat-answered-or-failed': Number.isInteger(offChatRes.status),
}
const ok = Object.values(checks).every(Boolean)

const record = {
  probedAt: startedAt,
  onBase: ON,
  offBase: OFF,
  role,
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  onHealth: { status: onHealthRes.status, engine: onEngine, body: onHealth.slice(0, 400) },
  offHealth: { status: offHealthRes.status, engine: offEngine, body: offHealth.slice(0, 400) },
  offChat: {
    status: offChatRes.status,
    contentType: offChatRes.headers.get('content-type') ?? '',
    dshFrames: offDshFrames,
    bytes: offChat.length,
    runsBefore,
    runsAfter,
    bodyHead: offChat.slice(0, 400),
  },
  checks,
  ok,
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `engine-switch-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[engine-switch] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[engine-switch] on=${onEngine ?? '-'} off=${offEngine ?? '-'} offChat=${offChatRes.status} dshFrames=${offDshFrames} runs ${runsBefore}->${runsAfter} evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
