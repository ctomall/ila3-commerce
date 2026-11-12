import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate } from './communications-readiness.mjs'

const base = {
  ledgerTable: true,
  payloadHashColumn: true,
  migrationRows: 2,
  channels: { total: 1, active: 1, connected: 1 },
  webhookVerifyToken: true,
  stuck: { minutes: 30, staleLinks: 0, danglingLedger: 0, completedWithoutLink: 0 },
}

test('ready when ledger, payload hash, migrations and a channel are present', () => {
  const verdict = evaluate(base)
  assert.equal(verdict.ready, true)
  assert.deepEqual(verdict.blockers, [])
  assert.deepEqual(verdict.warnings, [])
})

test('missing ledger table blocks with the migration reason', () => {
  const verdict = evaluate({ ...base, ledgerTable: false, payloadHashColumn: false, migrationRows: 0 })
  assert.equal(verdict.ready, false)
  assert.match(verdict.blockers.join(' '), /communications_send_requests is missing/)
})

test('half-applied migration is blocked, not ready', () => {
  const verdict = evaluate({ ...base, payloadHashColumn: false })
  assert.equal(verdict.ready, false)
  assert.match(verdict.blockers.join(' '), /payload_hash/)
})

test('stuck sends and a missing verify token are warnings, not blockers', () => {
  const verdict = evaluate({
    ...base,
    webhookVerifyToken: false,
    stuck: { minutes: 30, staleLinks: 2, danglingLedger: 1, completedWithoutLink: 3 },
  })
  assert.equal(verdict.ready, true)
  assert.match(verdict.warnings.join(' '), /stale outbound link/)
  assert.match(verdict.warnings.join(' '), /META_WEBHOOK_VERIFY_TOKEN/)
})

test('unknown-outcome sends are a warning, not a blocker', () => {
  const verdict = evaluate({
    ledgerTable: true,
    payloadHashColumn: true,
    migrationRows: 2,
    channels: { total: 1, connected: 1 },
    webhookVerifyToken: true,
    stuck: { minutes: 30, staleLinks: 0, danglingLedger: 0, completedWithoutLink: 0, unknownLinks: 3 },
  })
  assert.equal(verdict.ready, true)
  assert.ok(verdict.warnings.some((w) => w.includes('3 unknown-outcome')))
})

test('recent dead letters are a warning above the threshold, and quiet below it', () => {
  const quiet = evaluate({ ...base, deadLetters: { total: 3, recent24h: 3 } })
  assert.equal(quiet.warnings.some((w) => w.includes('dead-letter')), false)

  const loud = evaluate({ ...base, deadLetters: { total: 40, recent24h: 30 } })
  assert.equal(loud.ready, true)
  assert.ok(loud.warnings.some((w) => w.includes('30 channel ingest dead-letter row(s)')))

  const raised = evaluate({ ...base, deadLetters: { total: 40, recent24h: 30, warningThreshold: 100 } })
  assert.equal(raised.warnings.some((w) => w.includes('dead-letter')), false)
})

test('an unavailable dead-letter table is not reported as "no dead letters"', () => {
  const verdict = evaluate({ ...base, deadLetters: { unavailable: true } })
  assert.equal(verdict.ready, true)
  assert.equal(verdict.warnings.some((w) => w.includes('dead-letter')), false)
})
