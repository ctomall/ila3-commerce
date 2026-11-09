/**
 * Tests for the CI release artifact trust chain, safe extraction and installer.
 * Everything runs against a temporary one-file "app"; no network is used.
 */
import {test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-artifact-test-'))
process.env.ILA3_STATE_DIR = path.join(tmp, 'state')
process.env.ILA3_RELEASE_ROOT = path.join(tmp, 'releases')
process.env.ILA3_APP_DIR = path.join(tmp, 'app')
process.env.GITHUB_TOKEN_FILE = path.join(tmp, 'missing-token')
for (const dir of [process.env.ILA3_STATE_DIR, process.env.ILA3_RELEASE_ROOT, process.env.ILA3_APP_DIR]) {
  fs.mkdirSync(dir, {recursive: true})
}

const {
  ARTIFACT_WORKFLOW,
  ARCHIVE_NAME,
  MANIFEST_NAME,
  assertArchiveEntriesSafe,
  contentDigest,
  createArtifactZip,
  createReleasePackage,
  downloadArtifactZip,
  extractAndVerify,
  installFromArtifact,
  normalizeEntryPath,
  scanTree,
  validateManifestMetadata,
} = await import('./artifact.mjs')

const COMMIT = 'a'.repeat(40)
const REPO = 'ctomall/ila3-commerce'
const CHECKS = ['typecheck', 'unit', 'build']

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, contents)
}

function makeFixture(name, {commit = COMMIT, marker = 'v1'} = {}) {
  const root = path.join(tmp, name)
  fs.rmSync(root, {recursive: true, force: true})
  write(path.join(root, 'package.json'), JSON.stringify({name: 'fixture', version: '1.0.0'}))
  write(path.join(root, 'yarn.lock'), '# fixture\n')
  write(path.join(root, '.yarnrc.yml'), 'nodeLinker: node-modules\n')
  write(path.join(root, '.mercato', 'build-info.json'), JSON.stringify({status: 'ok', commit: commit.slice(0, 8)}))
  write(path.join(root, '.mercato', 'next', 'BUILD_ID'), 'fixture-build\n')
  write(path.join(root, '.mercato', 'next', 'server', 'chunk.js'), `// ${marker}\n`)
  write(path.join(root, '.mercato', 'next', 'cache', 'junk.bin'), 'excluded\n')
  write(path.join(root, '.mercato', 'generated', 'modules.generated.ts'), '// generated\n')
  write(path.join(root, 'public', 'logo.txt'), 'logo\n')
  fs.mkdirSync(path.join(root, '.mercato', 'next', 'node_modules'), {recursive: true})
  fs.symlinkSync('../../../node_modules/next', path.join(root, '.mercato', 'next', 'node_modules', 'link'))
  return root
}

function packageFixture(root, {name = 'pkg', runId = 111, commit = COMMIT, repository = REPO} = {}) {
  return createReleasePackage({
    sourceRoot: root,
    includePaths: ['package.json', 'yarn.lock', '.yarnrc.yml', 'public', '.mercato/build-info.json', '.mercato/generated', '.mercato/next'],
    outDir: path.join(tmp, name),
    exclude: (rel) => rel.startsWith('.mercato/next/cache'),
    meta: {
      repository,
      workflowRunId: runId,
      workflow: {path: ARTIFACT_WORKFLOW, name: 'build-artifact'},
      commit,
      ref: 'refs/heads/main',
      nodeMajor: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
      checks: CHECKS,
      excluded: ['.env*'],
    },
  })
}

function makeZip(sourceDir, zipFile) {
  return createArtifactZip({dir: sourceDir, zipFile})
}

function tarDirectory(dir, archive) {
  const result = spawnSync(
    'tar',
    ['-czf', archive, '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-C', dir, '.'],
    {encoding: 'utf8', timeout: 60000},
  )
  assert.equal(result.status, 0, `tar failed: ${result.stderr}`)
  return archive
}

function startServer(handler) {
  const server = http.createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({server, port: server.address().port}))
  })
}

after(() => {
  fs.rmSync(tmp, {recursive: true, force: true})
})

test('content digest is stable regardless of input order', () => {
  const a = {path: 'a', type: 'file', bytes: 1, sha256: '1'.repeat(64)}
  const b = {path: 'b', type: 'symlink', target: '../x'}
  assert.equal(contentDigest([a, b]), contentDigest([b, a]))
  assert.notEqual(contentDigest([a]), contentDigest([{...a, sha256: '2'.repeat(64)}]))
})

test('normalizeEntryPath rejects traversal, absolute paths, backslashes and overlong names', () => {
  assert.equal(normalizeEntryPath('./.mercato/next/BUILD_ID'), '.mercato/next/BUILD_ID')
  assert.equal(normalizeEntryPath('.'), null)
  for (const bad of ['../evil', 'a/../../evil', '/etc/passwd', 'C:/windows', 'a\\b', 'a//b', 'x'.repeat(300), 'a\nb']) {
    assert.throws(() => normalizeEntryPath(bad), (error) => error.code === 'artifact-unsafe-path', `accepted ${JSON.stringify(bad)}`)
  }
})

test('package + extract roundtrip verifies every file and preserves in-tree symlinks', async () => {
  const root = makeFixture('roundtrip')
  const result = await packageFixture(root)
  const manifest = result.manifest
  assert.equal(manifest.repository, REPO)
  assert.equal(manifest.commit, COMMIT)
  assert.ok(fs.statSync(result.archivePath).size > 0)
  assert.ok(manifest.files.some((entry) => entry.path === '.mercato/next/server/chunk.js'))
  assert.ok(!manifest.files.some((entry) => entry.path.includes('/cache/')), 'cache must be excluded')
  const link = manifest.files.find((entry) => entry.type === 'symlink')
  assert.ok(link, 'symlink entry must be in the manifest')

  const dest = path.join(tmp, 'roundtrip-extracted')
  const extracted = await extractAndVerify({archive: result.archivePath, dest, manifest})
  assert.equal(extracted.digest, manifest.sha256)
  assert.equal(fs.readFileSync(path.join(dest, 'public/logo.txt'), 'utf8'), 'logo\n')
  assert.equal(fs.readlinkSync(path.join(dest, '.mercato/next/node_modules/link')), '../../../node_modules/next')
  assert.ok(!fs.existsSync(path.join(dest, '.mercato/next/cache/junk.bin')))
})

test('tampered archive content fails the per-file sha256 check', async () => {
  const root = makeFixture('tampered')
  const result = await packageFixture(root)
  const extracted = path.join(tmp, 'tampered-extract')
  fs.mkdirSync(extracted, {recursive: true})
  const untar = spawnSync('tar', ['-xzf', result.archivePath, '-C', extracted], {encoding: 'utf8'})
  assert.equal(untar.status, 0)
  write(path.join(extracted, '.mercato/next/server/chunk.js'), '// tampered\n')
  const evilArchive = path.join(tmp, 'tampered.tar.gz')
  tarDirectory(extracted, evilArchive)
  await assert.rejects(
    extractAndVerify({archive: evilArchive, dest: path.join(tmp, 'tampered-verify'), manifest: result.manifest}),
    (error) => error.code === 'artifact-file-hash-mismatch',
  )
})

test('symlink escaping the payload root is rejected at package time', async () => {
  const root = makeFixture('escaping-link')
  fs.symlinkSync('../../etc/passwd', path.join(root, 'public', 'escape'))
  await assert.rejects(packageFixture(root, {name: 'pkg-escape'}), (error) => error.code === 'artifact-symlink-escape')
})

test('tar member traversal is rejected before extraction', async () => {
  const source = path.join(tmp, 'traversal-src')
  write(path.join(source, 'payload.txt'), 'x')
  const archive = path.join(tmp, 'traversal.tar.gz')
  const result = spawnSync('tar', ['-czf', archive, '--transform=s|^|../|', '-C', source, 'payload.txt'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  await assert.rejects(assertArchiveEntriesSafe(archive), (error) => error.code === 'artifact-unsafe-path')
})

test('manifest must match the trusted run metadata', async () => {
  const root = makeFixture('metadata')
  const result = await packageFixture(root, {name: 'pkg-metadata', runId: 111})
  const expected = {
    commit: COMMIT,
    repository: REPO,
    workflowRunId: 111,
    nodeMajor: Number(process.versions.node.split('.')[0]),
    platform: process.platform,
    arch: process.arch,
  }
  assert.equal(validateManifestMetadata(result.manifest, expected), true)
  for (const [key, value] of [
    ['commit', 'b'.repeat(40)],
    ['repository', 'other/repo'],
    ['workflowRunId', 222],
    ['runtime', {...result.manifest.runtime, nodeMajor: 20}],
    ['runtime', {...result.manifest.runtime, platform: 'darwin'}],
    ['runtime', {...result.manifest.runtime, arch: 'arm64'}],
  ]) {
    const bad = {...result.manifest, [key]: value}
    assert.throws(
      () => validateManifestMetadata(bad, expected),
      (error) => error.code === 'artifact-manifest-mismatch',
      `accepted ${key}`,
    )
  }
})

test('install refuses an artifact whose sha256 does not match the expected CI digest', async () => {
  const root = makeFixture('digest', {marker: 'digest'})
  const pkg = await packageFixture(root, {name: 'pkg-digest'})
  const zipFile = makeZip(path.dirname(pkg.archivePath), path.join(tmp, 'digest.zip'))
  const installDir = path.join(tmp, 'releases', COMMIT)
  await assert.rejects(
    installFromArtifact({
      sha: COMMIT,
      runId: 111,
      repo: REPO,
      source: {kind: 'file', file: zipFile, sha256: '0'.repeat(64), runId: 111},
      installDir,
    }),
    (error) => error.code === 'artifact-digest-mismatch',
  )
  assert.ok(!fs.existsSync(installDir), 'nothing may be installed when the digest is wrong')
})

test('install refuses a manifest whose run id differs from the trusted metadata', async () => {
  const root = makeFixture('run-mismatch', {marker: 'run'})
  const pkg = await packageFixture(root, {name: 'pkg-run', runId: 111})
  const zipFile = makeZip(path.dirname(pkg.archivePath), path.join(tmp, 'run.zip'))
  const {sha256File} = await import('./lib.mjs')
  const digest = sha256File(zipFile)
  const installDir = path.join(tmp, 'releases', 'b'.repeat(40))
  await assert.rejects(
    installFromArtifact({
      sha: COMMIT,
      runId: 222,
      repo: REPO,
      source: {kind: 'file', file: zipFile, sha256: digest, runId: 222},
      installDir,
    }),
    (error) => error.code === 'artifact-manifest-mismatch',
  )
  assert.ok(!fs.existsSync(installDir))
})

test('download writes the body and returns its size and sha256', async () => {
  const payload = Buffer.from('artifact-bytes'.repeat(1000))
  const {server, port} = await startServer((request, response) => {
    response.statusCode = 200
    response.end(payload)
  })
  try {
    const file = path.join(tmp, 'downloads', 'ok.zip')
    const result = await downloadArtifactZip({url: `http://127.0.0.1:${port}/artifact.zip`, file, timeoutMs: 5000})
    assert.equal(result.bytes, payload.length)
    assert.equal(result.sha256, crypto.createHash('sha256').update(payload).digest('hex'))
    assert.deepEqual(fs.readFileSync(file), payload)
  } finally {
    server.close()
  }
})

test('download reports HTTP 404 and keeps no release behind', async () => {
  const {server, port} = await startServer((request, response) => {
    response.statusCode = 404
    response.end('not found')
  })
  try {
    await assert.rejects(
      downloadArtifactZip({url: `http://127.0.0.1:${port}/artifact.zip`, file: path.join(tmp, '404.zip'), timeoutMs: 5000}),
      (error) => error.code === 'artifact-download-failed' && error.detail?.status === 404,
    )
  } finally {
    server.close()
  }
})

test('download reports a timeout instead of hanging', async () => {
  const {server, port} = await startServer(() => {
    /* never respond */
  })
  try {
    await assert.rejects(
      downloadArtifactZip({url: `http://127.0.0.1:${port}/artifact.zip`, file: path.join(tmp, 'timeout.zip'), timeoutMs: 400}),
      (error) => error.code === 'artifact-download-failed',
    )
  } finally {
    server.closeAllConnections?.()
    server.close()
  }
})

test('scanTree rejects hardlinked payload files', () => {
  const root = path.join(tmp, 'hardlink')
  write(path.join(root, 'a.txt'), 'a')
  fs.linkSync(path.join(root, 'a.txt'), path.join(root, 'b.txt'))
  assert.throws(() => scanTree(root), (error) => error.code === 'artifact-hardlink-rejected')
})
