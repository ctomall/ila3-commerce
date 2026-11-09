import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {atomicSymlink, readLink} from './lib.mjs'
import {verifyBuildStamp} from './health.mjs'

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-deploy-test-'))
}

test('atomicSymlink replaces the link atomically and leaves the old target intact', () => {
  const root = tempDir()
  const a = path.join(root, 'a')
  const b = path.join(root, 'b')
  fs.mkdirSync(a)
  fs.mkdirSync(b)
  const link = path.join(root, 'current')
  atomicSymlink(a, link)
  assert.equal(fs.realpathSync(link), fs.realpathSync(a))
  atomicSymlink(b, link)
  assert.equal(fs.realpathSync(link), fs.realpathSync(b))
  assert.equal(readLink(link), b)
  assert.ok(fs.existsSync(a), 'old target must not be removed by the switch')
})

test('build stamp must match the target sha and be ok', () => {
  const root = tempDir()
  const sha = '652039c150f96f76fec0f1c1c2a3e1ad96ef4fd7'
  fs.mkdirSync(path.join(root, '.mercato', 'next'), {recursive: true})
  fs.writeFileSync(path.join(root, '.mercato', 'next', 'BUILD_ID'), 'build-id\n')
  fs.writeFileSync(
    path.join(root, '.mercato', 'build-info.json'),
    JSON.stringify({status: 'ok', commit: sha.slice(0, 8), builtAt: '2026-11-09T00:00:00.000Z'}),
  )
  assert.equal(verifyBuildStamp(root, sha).ok, true)
  assert.equal(verifyBuildStamp(root, '0000000000000000000000000000000000000000').ok, false)

  fs.writeFileSync(
    path.join(root, '.mercato', 'build-info.json'),
    JSON.stringify({status: 'failed', commit: sha.slice(0, 8)}),
  )
  assert.equal(verifyBuildStamp(root, sha).ok, false)
})
