import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {atomicSymlink, pruneReleases, protectedReleases} from './lib.mjs'

const SHA_A = 'af8134157a44ec7236cc02739c4040b2f1bbce85'
const SHA_B = '652039c150f96f76fec0f1c1c2a3e1ad96ef4fd7'
const SHA_C = 'ffada1a820665997999a8dc2bec877a8504a1536'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-prune-test-'))
}

function makeRelease(root, sha, padding = 1024) {
  const dir = path.join(root, sha)
  fs.mkdirSync(dir, {recursive: true})
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify({sha}))
  fs.writeFileSync(path.join(dir, 'payload.bin'), Buffer.alloc(padding, 0x41))
  return dir
}

test('releaseInUse finds a live process whose cwd is inside the release', async () => {
  const {releaseInUse} = await import('./lib.mjs')
  // This test process runs with the repository as its cwd, so the helper must
  // resolve a pid for that directory (and none for a path nobody runs from).
  assert.match(String(releaseInUse(process.cwd())), /^\d+$/)
  assert.equal(releaseInUse('/nonexistent-release-dir-for-test'), null)
})

test('pruneReleases keeps current and previous and removes every other release', () => {
  const root = tempRoot()
  const a = makeRelease(root, SHA_A)
  makeRelease(root, SHA_B)
  makeRelease(root, SHA_C)
  atomicSymlink(a, path.join(root, 'current'))
  atomicSymlink(a, path.join(root, 'previous'))

  const result = pruneReleases({root})

  assert.deepEqual(
    fs.readdirSync(root).sort(),
    ['current', 'previous', SHA_A].sort(),
    'only the live release directory may survive',
  )
  assert.equal(result.removed.length, 2)
  assert.ok(fs.existsSync(path.join(a, 'release.json')), 'current release must be untouched')
  assert.ok(result.freedBytes > 0, 'freed bytes must be reported')
  assert.equal(result.skipped.length, 1, 'current and previous name one directory, so it is kept once')
})

test('pruneReleases keeps a distinct previous release for rollback', () => {
  const root = tempRoot()
  const a = makeRelease(root, SHA_A)
  const b = makeRelease(root, SHA_B)
  makeRelease(root, SHA_C)
  atomicSymlink(a, path.join(root, 'current'))
  atomicSymlink(b, path.join(root, 'previous'))

  const result = pruneReleases({root})

  assert.equal(result.removed.length, 1)
  assert.ok(fs.existsSync(a), 'current survives')
  assert.ok(fs.existsSync(b), 'previous rollback target survives')
  assert.ok(!fs.existsSync(path.join(root, SHA_C)), 'unreferenced release is gone')
})

test('pruneReleases ignores symlinks, non-sha directories and plain files', () => {
  const root = tempRoot()
  const a = makeRelease(root, SHA_A)
  atomicSymlink(a, path.join(root, 'current'))
  fs.mkdirSync(path.join(root, 'worktrees'))
  fs.writeFileSync(path.join(root, 'notes.txt'), 'keep me')

  const result = pruneReleases({root})

  assert.equal(result.removed.length, 0)
  assert.ok(fs.existsSync(path.join(root, 'worktrees')), 'non-sha directory must not be a candidate')
  assert.ok(fs.existsSync(path.join(root, 'notes.txt')), 'plain file must not be a candidate')
})

test('dryRun reports candidates without deleting anything', () => {
  const root = tempRoot()
  const a = makeRelease(root, SHA_A)
  makeRelease(root, SHA_B)
  atomicSymlink(a, path.join(root, 'current'))

  const preview = pruneReleases({root, dryRun: true})

  assert.equal(preview.removed.length, 1)
  assert.equal(preview.candidates, 2)
  assert.ok(fs.existsSync(path.join(root, SHA_B)), 'dryRun must not delete the candidate')
})

test('protectedReleases resolves the current and previous link targets', () => {
  const root = tempRoot()
  const a = makeRelease(root, SHA_A)
  const b = makeRelease(root, SHA_B)
  atomicSymlink(a, path.join(root, 'current'))
  atomicSymlink(b, path.join(root, 'previous'))

  assert.deepEqual([...protectedReleases({root})].sort(), [a, b].sort())
})
