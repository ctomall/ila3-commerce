#!/usr/bin/env node
/**
 * Duplicate-request drill for the chat entry: an identical turn must replay the stored
 * run instead of calling the model again, and a genuinely new turn must create a new run.
 *
 * This is the live half of the idempotency contract in B. The unit tests pin the key
 * derivation; this proves the deployed route behaves that way with a real account, and
 * that a replay does not add a second `dsh_runs` row (the observable that a duplicate
 * model call would leave behind).
 *
 * Costs two short model calls (first turn + one new turn). The replay itself is free.
 *
 * Usage: node scripts/crm-dsh-idempotency-drill.mjs
 * Writes docs/crm-platform/dsh-integration/evidence/idempotency-<ts>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { credentials, loginWithRetry } from './lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(__dirname, '..')
const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000'

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
const cookie = await loginWithRetry(BASE, creds.get(role), { role })

const startedAt = new Date().toISOString()
const nonce = startedAt.replace(/[:.]/g, '')
const promptA = `只回答两个字：收到（幂等探针 A ${nonce}）`
const promptB = `只回答两个字：明白（幂等探针 B ${nonce}）`

async function turn(content) {
  const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  })
  const text = await res.text()
  const sessionId = (text.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null
  const row = sessionId
    ? psqlValue(
        `select id || '|' || status from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}' order by created_at desc limit 1`,
      )
    : null
  const [runId, runStatus] = (row ?? '').split('|')
  const runsForSession = sessionId
    ? Number(psqlValue(`select count(*) from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}'`) ?? '0')
    : 0
  return {
    status: res.status,
    sessionId,
    runId: runId ?? null,
    runStatus: runStatus ?? null,
    runsForSession,
    done: text.includes('"type":"done"'),
    dshFrames: [...text.matchAll(/"type":"dsh\.event"/g)].length,
    bytes: text.length,
  }
}

const first = await turn(promptA)
const replay = await turn(promptA)
const second = await turn(promptB)

const checks = {
  'first-200': first.status === 200,
  'first-run-completed': first.runStatus === 'completed',
  'replay-200': replay.status === 200,
  'replay-same-run': Boolean(first.runId) && replay.runId === first.runId,
  'replay-no-extra-run': replay.runsForSession === 1,
  'replay-has-done': replay.done,
  'new-turn-new-run': Boolean(second.runId) && second.runId !== first.runId,
  'new-turn-completed': second.runStatus === 'completed',
}
const ok = Object.values(checks).every(Boolean)

const record = {
  probedAt: startedAt,
  base: BASE,
  role,
  path: '/api/ai_assistant/chat',
  release: (() => {
    try {
      return JSON.parse(fs.readFileSync('/home/pro/releases/mercato/current/release.json', 'utf8')).sha
    } catch {
      return null
    }
  })(),
  nonce,
  first,
  replay,
  second,
  checks,
  ok,
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `idempotency-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[idempotency] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[idempotency] release=${record.release?.slice(0, 8) ?? '?'} run=${first.runId ?? '-'} replay=${replay.runId ?? '-'} new=${second.runId ?? '-'} evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
