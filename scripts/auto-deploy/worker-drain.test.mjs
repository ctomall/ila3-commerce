import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {listQueueNames, probeQueues, waitForDrain} from './worker-drain.mjs'

function tempApp(queues = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-drain-'))
  for (const [name, jobs] of Object.entries(queues)) {
    const dir = path.join(root, '.mercato', 'queue', name)
    fs.mkdirSync(dir, {recursive: true})
    fs.writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(jobs))
  }
  return root
}

test('no local queue directory means drained', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-drain-empty-'))
  const result = await waitForDrain({appDir: root, timeoutMs: 50, intervalMs: 10})
  assert.equal(result.drained, true)
  assert.equal(result.reason, 'no local queues')
})

test('enumerates queue directories', () => {
  const root = tempApp({b: [], a: []})
  assert.deepEqual(listQueueNames(root), ['a', 'b'])
})

test('empty queue is drained', async () => {
  const root = tempApp({'communication-channels-outbound': []})
  const result = await waitForDrain({appDir: root, timeoutMs: 200, intervalMs: 10})
  assert.equal(result.drained, true)
  assert.ok(result.rounds >= 1)
  assert.equal(result.remaining.length, 0)
})

test('ready job blocks until timeout and is reported, not dropped', async () => {
  const root = tempApp({'communication-channels-outbound': [{id: 'job-1', payload: {}}]})
  const before = fs.readFileSync(path.join(root, '.mercato', 'queue', 'communication-channels-outbound', 'queue.json'), 'utf8')
  const result = await waitForDrain({appDir: root, timeoutMs: 80, intervalMs: 20})
  assert.equal(result.drained, false)
  assert.equal(result.timedOut, true)
  assert.deepEqual(result.remaining, [{queue: 'communication-channels-outbound', ready: 1, delayedFuture: 0}])
  const after = fs.readFileSync(path.join(root, '.mercato', 'queue', 'communication-channels-outbound', 'queue.json'), 'utf8')
  assert.equal(after, before, 'drain probing must never rewrite queue files')
})

test('delayed future job does not block', async () => {
  const future = new Date(Date.now() + 3600_000).toISOString()
  const root = tempApp({'communication-channels-outbound': [{id: 'later', availableAt: future}]})
  const result = await waitForDrain({appDir: root, timeoutMs: 120, intervalMs: 20})
  assert.equal(result.drained, true)
})

test('a queue that empties while waiting becomes drained', async () => {
  const root = tempApp({'q': [{id: 'one'}]})
  const file = path.join(root, '.mercato', 'queue', 'q', 'queue.json')
  const timer = setTimeout(() => fs.writeFileSync(file, '[]'), 250)
  const result = await waitForDrain({appDir: root, timeoutMs: 2000, intervalMs: 20})
  clearTimeout(timer)
  assert.equal(result.drained, true)
  assert.ok(result.rounds >= 2)
})

test('probe results carry queue names and no error for readable files', async () => {
  const root = tempApp({'q': []})
  const probes = await probeQueues(root, ['q'])
  assert.equal(probes.length, 1)
  assert.equal(probes[0].queueName, 'q')
  assert.equal(probes[0].error, false)
})
