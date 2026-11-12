import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMainEntry } from './is-main-entry.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'is-main-'))
const real = path.join(dir, 'cli.mjs')
fs.writeFileSync(real, '// fixture\n')
const link = path.join(dir, 'cli-link.mjs')
fs.symlinkSync(real, link)

test('matches the same real file', () => {
  assert.equal(isMainEntry(pathToFileURL(real).href, real), true)
})

test('matches when invoked through a symlink (release current/ path)', () => {
  assert.equal(isMainEntry(pathToFileURL(real).href, link), true)
})

test('rejects a different file', () => {
  const other = path.join(dir, 'other.mjs')
  fs.writeFileSync(other, '// other\n')
  assert.equal(isMainEntry(pathToFileURL(real).href, other), false)
})

test('rejects a missing argv[1]', () => {
  assert.equal(isMainEntry(pathToFileURL(real).href, undefined), false)
})

test('rejects an argv[1] that does not exist', () => {
  assert.equal(isMainEntry(pathToFileURL(real).href, path.join(dir, 'nope.mjs')), false)
})
