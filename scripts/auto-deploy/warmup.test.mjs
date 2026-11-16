import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {readCredentials, warmAiModule} from './warmup.mjs'

test('readCredentials parses the operator file format', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ila3-warmup-'))
  const file = path.join(dir, 'creds')
  fs.writeFileSync(file, '# comment\nsuperadmin  a@example.com  secret\nadmin b@example.com p2\n')
  const map = readCredentials(file)
  assert.equal(map.size, 2)
  assert.deepEqual(map.get('superadmin'), {email: 'a@example.com', password: 'secret'})
})

test('readCredentials returns an empty map when the file is missing', () => {
  assert.equal(readCredentials('/nonexistent/creds').size, 0)
})

test('warmAiModule reports a missing base instead of throwing', async () => {
  const result = await warmAiModule({})
  assert.equal(result.ok, false)
  assert.equal(result.checks[0].name, 'warmup-config')
})

test('warmAiModule reports missing credentials instead of throwing', async () => {
  const result = await warmAiModule({base: 'http://127.0.0.1:9', credentialsPath: '/nonexistent/creds'})
  assert.equal(result.ok, false)
  assert.equal(result.checks[0].name, 'warmup-credentials')
})
