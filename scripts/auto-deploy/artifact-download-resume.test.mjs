/**
 * Resumable artifact download: a slow/aborted transfer must continue with an
 * HTTP Range request instead of starting over, and a server that ignores Range
 * must still produce a byte-exact file. No external network is used.
 */
import {test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import {downloadArtifactZip} from './artifact.mjs'

const BYTES = crypto.randomBytes(512 * 1024)
const SHA = crypto.createHash('sha256').update(BYTES).digest('hex')
const FIRST_CHUNK = 64 * 1024

let server
let base
let requests
let mode // 'drop-first' | 'ignore-range' | 'slow'
let dropped

before(async () => {
  server = http.createServer(async (req, res) => {
    requests.push({range: req.headers.range ?? null})
    const range = req.headers.range
    let start = 0
    if (range) {
      const match = /^bytes=(\d+)-$/.exec(range)
      if (match) start = Number(match[1])
    }
    const honourRange = mode !== 'ignore-range' && start > 0
    if (honourRange) {
      res.writeHead(206, {
        'content-type': 'application/zip',
        'content-length': String(BYTES.length - start),
        'content-range': `bytes ${start}-${BYTES.length - 1}/${BYTES.length}`,
        'accept-ranges': 'bytes',
      })
    } else {
      start = 0
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': String(BYTES.length),
        'accept-ranges': 'bytes',
      })
    }
    const body = BYTES.subarray(start)
    if (mode === 'drop-first' && !dropped && start === 0) {
      // Deliver a prefix then cut the socket: the client must keep those bytes.
      res.write(body.subarray(0, FIRST_CHUNK))
      dropped = true
      setTimeout(() => res.destroy(), 10)
      return
    }
    if (mode === 'slow') {
      for (let offset = 0; offset < body.length; offset += 16 * 1024) {
        if (res.destroyed) return
        res.write(body.subarray(offset, offset + 16 * 1024))
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      res.end()
      return
    }
    res.end(body)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/artifact.zip`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

function freshFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-resume-'))
  return {dir, file: path.join(dir, name)}
}

function assertComplete(file) {
  const actual = fs.readFileSync(file)
  assert.equal(actual.length, BYTES.length)
  assert.equal(crypto.createHash('sha256').update(actual).digest('hex'), SHA)
}

test('retries a dropped transfer from the byte it already has', async () => {
  mode = 'drop-first'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    timeoutMs: 10_000,
    retryDelayMs: 10,
  })
  assert.equal(result.bytes, BYTES.length)
  assert.equal(result.sha256, SHA)
  assertComplete(file)
  assert.ok(requests.length >= 2, `expected a retry, saw ${requests.length}`)
  assert.equal(requests[0].range, null)
  assert.match(requests[1].range ?? '', /^bytes=\d+-$/)
  fs.rmSync(dir, {recursive: true, force: true})
})

test('a later call resumes the partial left by an aborted earlier call', async () => {
  mode = 'drop-first'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  await assert.rejects(
    downloadArtifactZip({url: base, file, expectedBytes: BYTES.length, timeoutMs: 10_000, maxAttempts: 1, retryDelayMs: 10}),
    /artifact download/,
  )
  const partialPath = `${file}.part`
  assert.equal(fs.existsSync(file), false, 'a failed attempt must not leave bytes at the final path')
  const partial = fs.statSync(partialPath).size
  assert.ok(partial > 0 && partial < BYTES.length, `expected a partial file, got ${partial}`)
  requests = []
  dropped = false
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    timeoutMs: 10_000,
    retryDelayMs: 10,
  })
  assert.equal(result.sha256, SHA)
  assertComplete(file)
  assert.match(requests[0].range ?? '', /^bytes=\d+-$/)
  fs.rmSync(dir, {recursive: true, force: true})
})

test('a completed artifact is reused without touching the network', async () => {
  mode = 'drop-first'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  fs.writeFileSync(file, BYTES)
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    expectedSha256: SHA,
    timeoutMs: 10_000,
    retryDelayMs: 10,
  })
  assert.equal(result.cached, true)
  assert.equal(result.sha256, SHA)
  assert.equal(requests.length, 0, 'a complete artifact must not be re-downloaded')
  assertComplete(file)
  fs.rmSync(dir, {recursive: true, force: true})
})

test('a same-size corrupt cached file is replaced instead of reused', async () => {
  mode = 'ignore-range'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  // Correct length, wrong bytes: the previous version treated this as a cache
  // hit (size matches), so every later deploy failed on the digest and the file
  // survived until an operator deleted it.
  fs.writeFileSync(file, crypto.randomBytes(BYTES.length))
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    expectedSha256: SHA,
    timeoutMs: 10_000,
    retryDelayMs: 10,
  })
  assert.equal(result.cached, undefined)
  assert.equal(result.sha256, SHA)
  assert.ok(requests.length >= 1, 'a corrupt cache entry must be re-downloaded')
  assertComplete(file)
  fs.rmSync(dir, {recursive: true, force: true})
})

test('a server that ignores Range still yields a byte-exact file', async () => {
  mode = 'ignore-range'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  fs.writeFileSync(file, BYTES.subarray(0, FIRST_CHUNK))
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    timeoutMs: 10_000,
    retryDelayMs: 10,
  })
  assert.equal(result.sha256, SHA)
  assertComplete(file)
  assert.match(requests[0].range ?? '', /^bytes=\d+-$/)
  fs.rmSync(dir, {recursive: true, force: true})
})

test('honours the per-attempt timeout and resumes on the next attempt', async () => {
  mode = 'slow'
  requests = []
  dropped = false
  const {dir, file} = freshFile('artifact.zip')
  const result = await downloadArtifactZip({
    url: base,
    file,
    expectedBytes: BYTES.length,
    timeoutMs: 120,
    maxAttempts: 6,
    retryDelayMs: 10,
  })
  assert.equal(result.sha256, SHA)
  assertComplete(file)
  fs.rmSync(dir, {recursive: true, force: true})
})
