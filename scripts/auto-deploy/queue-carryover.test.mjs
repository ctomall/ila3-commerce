import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {carryoverQueues} from './queue-carryover.mjs'

function releaseWith(queues) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-carryover-'))
  for (const [name, jobs] of Object.entries(queues)) {
    const dir = path.join(root, '.mercato', 'queue', name)
    fs.mkdirSync(dir, {recursive: true})
    if (jobs !== undefined) fs.writeFileSync(path.join(dir, 'queue.json'), JSON.stringify(jobs))
  }
  return root
}

function readQueue(root, name) {
  return JSON.parse(fs.readFileSync(path.join(root, '.mercato', 'queue', name, 'queue.json'), 'utf8'))
}

test('moves ready jobs into the new release and empties the source', () => {
  const from = releaseWith({outbound: [{id: 'a'}, {id: 'b'}]})
  const to = releaseWith({})
  const result = carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'run-1'})
  assert.equal(result.errors.length, 0)
  assert.equal(result.moved, 2)
  assert.deepEqual(readQueue(to, 'outbound'), [{id: 'a'}, {id: 'b'}])
  assert.deepEqual(readQueue(from, 'outbound'), [])
  const sidecar = path.join(from, '.mercato', 'queue', 'outbound', 'carried-run-1.json')
  assert.ok(fs.existsSync(sidecar), 'source audit sidecar must exist')
  assert.deepEqual(JSON.parse(fs.readFileSync(sidecar, 'utf8')).jobs, [{id: 'a'}, {id: 'b'}])
})

test('merges without duplicating a job already in the target', () => {
  const from = releaseWith({outbound: [{id: 'a'}, {id: 'b'}]})
  const to = releaseWith({outbound: [{id: 'b'}, {id: 'c'}]})
  const result = carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'run-2'})
  assert.equal(result.moved, 1)
  assert.deepEqual(readQueue(to, 'outbound'), [{id: 'b'}, {id: 'c'}, {id: 'a'}])
  assert.equal(result.queues[0].alreadyPresent, 1)
})

test('is idempotent: a second run after truncation moves nothing', () => {
  const from = releaseWith({outbound: [{id: 'a'}]})
  const to = releaseWith({})
  carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'run-3'})
  const again = carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'run-4'})
  assert.equal(again.moved, 0)
  assert.deepEqual(readQueue(to, 'outbound'), [{id: 'a'}])
})

test('dry run writes nothing on either side', () => {
  const from = releaseWith({outbound: [{id: 'a'}]})
  const to = releaseWith({})
  const before = fs.readFileSync(path.join(from, '.mercato', 'queue', 'outbound', 'queue.json'), 'utf8')
  const result = carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'dry', dryRun: true})
  assert.equal(result.moved, 0)
  assert.equal(result.queues[0].wouldMove, 1)
  assert.equal(fs.readFileSync(path.join(from, '.mercato', 'queue', 'outbound', 'queue.json'), 'utf8'), before)
  assert.equal(fs.existsSync(path.join(to, '.mercato', 'queue', 'outbound', 'queue.json')), false)
})

test('a corrupt source queue is reported and left untouched', () => {
  const from = releaseWith({})
  const dir = path.join(from, '.mercato', 'queue', 'broken')
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, 'queue.json'), '{not json')
  const to = releaseWith({})
  const result = carryoverQueues({fromAppDir: from, toAppDir: to, runId: 'run-5'})
  assert.equal(result.moved, 0)
  assert.match(result.errors.join(' '), /broken/)
  assert.equal(fs.readFileSync(path.join(dir, 'queue.json'), 'utf8'), '{not json')
})

test('same release path is a no-op error', () => {
  const from = releaseWith({q: [{id: 'a'}]})
  const result = carryoverQueues({fromAppDir: from, toAppDir: from, runId: 'run-6'})
  assert.equal(result.moved, 0)
  assert.match(result.errors.join(' '), /same release/)
})
