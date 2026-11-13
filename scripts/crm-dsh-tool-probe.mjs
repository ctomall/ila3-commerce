#!/usr/bin/env node
/**
 * Prove the controlled CRM tool bridge runs from a real model turn on the shipping
 * release: the assistant must emit a `tool-call` for `crm_find_companies`, receive a
 * `tool-result`, and finish the run — the "CRM account → assistant → DSH → controlled
 * CRM tool → event/result" loop, end to end, without a fixture.
 *
 * This is the real-model half. The mock half lives in the route/MCP tests, which is
 * why the two are reported separately rather than one standing in for the other.
 *
 * Costs one short model call; run it on purpose, not in a loop.
 *
 * Usage: node scripts/crm-dsh-tool-probe.mjs
 * Writes docs/crm-platform/dsh-integration/evidence/tool-bridge-<ts>.json
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
const res = await fetch(`${BASE}/api/ai_assistant/chat`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: `请调用 crm_find_companies 工具（参数 limit=2），然后在回答里写出你拿到的第一家公司名字，并附上探针号 ${nonce}。`,
    }],
  }),
})
const text = await res.text()
const contentType = res.headers.get('content-type') ?? ''

/** Every SSE frame of one `type`, parsed. */
function frames(type) {
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload.startsWith('{')) continue
    try {
      const parsed = JSON.parse(payload)
      if (parsed?.type === type) out.push(parsed)
    } catch {
      // A partial or non-JSON data line is not a frame.
    }
  }
  return out
}

const toolCalls = frames('tool-call')
const toolResults = frames('tool-result')
const toolNames = [...new Set(toolCalls.map((frame) => String(frame.toolName ?? '')))]
const callsCrmTool = toolNames.some((name) => /find_companies/i.test(name))

const sessionId = (text.match(/"sessionId":"([a-z0-9-]+)"/) ?? [])[1] ?? null
const runRow = sessionId
  ? psqlValue(
      `select id || '|' || status || '|' || coalesce(error, '') from dsh_runs where session_id = '${sessionId.replace(/'/g, "''")}' order by created_at desc limit 1`,
    )
  : null
const [runId, runStatus, runError] = (runRow ?? '').split('|')

const checks = {
  'status-200': res.status === 200,
  'sse-content-type': contentType.includes('text/event-stream'),
  'tool-call-present': toolCalls.length > 0,
  'tool-name-is-crm': callsCrmTool,
  'tool-result-present': toolResults.length > 0,
  'run-persisted': Boolean(runId),
  'run-completed': runStatus === 'completed',
  'done-frame': frames('done').length > 0,
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
  status: res.status,
  contentType,
  bytes: text.length,
  nonce,
  sessionId,
  toolNames,
  toolCallCount: toolCalls.length,
  toolResultCount: toolResults.length,
  firstToolCall: toolCalls[0] ?? null,
  firstToolResult: toolResults[0] ? JSON.stringify(toolResults[0]).slice(0, 400) : null,
  dshRunId: runId ?? null,
  dshRunStatus: runStatus ?? null,
  dshRunError: runError ?? null,
  checks,
  ok,
  firstBytes: text.slice(0, 400),
  lastBytes: text.slice(-300),
}
const outDir = path.join(repo, 'docs/crm-platform/dsh-integration/evidence')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `tool-bridge-${startedAt.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(outFile, `${JSON.stringify(record, null, 1)}\n`)

console.log(`[tool-bridge] ${ok ? 'PASS' : 'FAIL'} — ${JSON.stringify(checks)}`)
console.log(`[tool-bridge] release=${record.release?.slice(0, 8) ?? '?'} tools=${JSON.stringify(toolNames)} run=${runId ?? '-'} (${runStatus ?? '-'}) evidence=${path.relative(repo, outFile)}`)
process.exit(ok ? 0 : 1)
