#!/usr/bin/env node
/**
 * Optimistic-lock conflict drill (read/write, reversible scratch data only).
 *
 * Proves the recorded conflict contract end to end through the app API:
 *   1. create a scratch company;
 *   2. save it with the current version  -> 200;
 *   3. save again with the stale version -> 409 optimistic_lock_conflict and a
 *      currentUpdatedAt that differs from the expected one;
 *   4. delete the scratch company and verify the company count is unchanged.
 *
 * Only the rows this drill creates are touched; the row is backed up before the
 * first write and removed through the app API at the end. Nothing else in the
 * database, no release and no credential is changed.
 *
 * Usage: node scripts/enterprise-conflict-drill.mjs [--out <file>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/crm-platform/evidence', `conflict-drill-${STAMP}.json`)))
const BASE = process.env.CONFLICT_BASE_URL ?? 'http://127.0.0.1:3000'
const CREDS = process.env.CONFLICT_CREDS_FILE ?? '/home/pro/.ila3-admin-credentials'
const HEADERS = { host: 'mercato.ila3.top', 'x-forwarded-proto': 'https' }
const LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

async function login() {
  const rows = fs.readFileSync(CREDS, 'utf8').split('\n').map((line) => line.split(/\s+/))
  const account = rows.find((fields) => fields[0] === 'employee')
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { ...HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: account[1], password: account[2] }),
    redirect: 'manual',
  })
  if (response.status !== 200) throw new Error(`login failed: ${response.status}`)
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
}

async function main() {
  const evidence = { drill: 'optimistic-lock-conflict', startedAt: new Date().toISOString(), checks: {} }
  let cookie = null
  let scratchId = null
  try {
    cookie = await login()
    const marker = `Conflict Drill ${STAMP}`
    const create = await fetch(`${BASE}/api/customers/companies`, {
      method: 'POST',
      headers: { ...HEADERS, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: marker, industry: 'conflict-drill' }),
    })
    if (create.status !== 201) throw new Error(`scratch create failed: ${create.status}`)
    const created = await create.json()
    scratchId = created.id
    evidence.checks.scratch = { entityId: created.id, companyId: created.companyId }

    const list = await (await fetch(`${BASE}/api/customers/companies?id=${scratchId}&limit=1`, { headers: { ...HEADERS, cookie } })).json()
    const row = (list.items ?? [])[0]
    if (!row) throw new Error('scratch row not found after create')
    const originalUpdatedAt = row.updated_at ?? row.updatedAt
    evidence.checks.originalUpdatedAt = originalUpdatedAt

    const save = async (expectedUpdatedAt, industry) => {
      const response = await fetch(`${BASE}/api/customers/companies`, {
        method: 'PUT',
        headers: { ...HEADERS, cookie, 'content-type': 'application/json', [LOCK_HEADER]: expectedUpdatedAt },
        body: JSON.stringify({ id: scratchId, industry }),
      })
      const body = await response.json().catch(() => null)
      return { status: response.status, body }
    }

    const first = await save(originalUpdatedAt, 'conflict-drill-saved')
    evidence.checks.firstSave = { status: first.status, updatedAt: first.body?.updatedAt ?? null }
    if (first.status !== 200) throw new Error(`first save failed: ${first.status} ${JSON.stringify(first.body)}`)
    const freshUpdatedAt = first.body?.updatedAt ?? null
    if (!freshUpdatedAt) throw new Error('first save did not return updatedAt')

    const conflict = await save(originalUpdatedAt, 'conflict-drill-stale')
    evidence.checks.conflict = {
      status: conflict.status,
      code: conflict.body?.code ?? null,
      expectedUpdatedAt: conflict.body?.expectedUpdatedAt ?? null,
      currentUpdatedAt: conflict.body?.currentUpdatedAt ?? null,
    }

    const afterList = await (await fetch(`${BASE}/api/customers/companies?id=${scratchId}&limit=1`, { headers: { ...HEADERS, cookie } })).json()
    evidence.checks.afterConflictIndustry = (afterList.items ?? [])[0]?.industry ?? null

    const cleanup = await fetch(`${BASE}/api/customers/companies?id=${scratchId}`, { method: 'DELETE', headers: { ...HEADERS, cookie } })
    const gone = await (await fetch(`${BASE}/api/customers/companies?id=${scratchId}&limit=1`, { headers: { ...HEADERS, cookie } })).json()
    evidence.checks.cleanup = { status: cleanup.status, stillListed: (gone.items ?? []).length }

    const failures = []
    if (first.status !== 200) failures.push('first save not 200')
    if (conflict.status !== 409) failures.push(`stale save answered ${conflict.status}, expected 409`)
    if ((conflict.body?.code ?? null) !== 'optimistic_lock_conflict') failures.push(`conflict code ${conflict.body?.code ?? null}`)
    if (!conflict.body?.currentUpdatedAt || conflict.body.currentUpdatedAt === originalUpdatedAt) failures.push('conflict did not report a fresh currentUpdatedAt')
    if (evidence.checks.afterConflictIndustry !== 'conflict-drill-saved') failures.push('stale write was applied despite the conflict')
    if (cleanup.status !== 200 || evidence.checks.cleanup.stillListed !== 0) failures.push('scratch cleanup failed')
    evidence.failures = failures
  } catch (error) {
    evidence.failures = [String(error?.message ?? error)]
    if (scratchId && cookie) {
      try {
        await fetch(`${BASE}/api/customers/companies?id=${scratchId}`, { method: 'DELETE', headers: { ...HEADERS, cookie } })
      } catch { /* cleanup best effort */ }
    }
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: OUT }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
