/**
 * CI release artifact: download, trust checks, safe extraction and installation.
 *
 * The production path is "download a CI-produced release package and install it",
 * never "run the Next build on the server". This module owns that path end to end:
 *
 *   artefact (zip from GitHub Actions) -> sha256 vs GitHub artifact digest
 *     -> release-manifest.json -> archive sha256 -> safe tar extraction
 *     -> per-file sha256 + content digest -> yarn install --immutable
 *     -> release.json (source.method = "ci-artifact")
 *
 * Trust chain (see docs/deployment/auto-deploy.md):
 *   1. GitHub API gives the artifact digest for the *specific* workflow run; the
 *      locally recomputed zip sha256 must equal it. This is the root of trust.
 *   2. The manifest (inside that digest-verified zip) binds repository, run id,
 *      commit, runtime and the sha256 of the inner release.tar.gz.
 *   3. Every extracted file is re-hashed against the manifest; the manifest's
 *      content digest is recomputed from the extracted tree.
 *   4. Path traversal, absolute paths, symlink escape, hardlinks and unexpected
 *      files fail closed and the staging directory is removed.
 *
 * Artifact layout (produced by package-release.mjs, uploaded as one artifact):
 *   release.tar.gz          runtime tree (build output + tracked runtime sources)
 *   release-manifest.json   metadata + per-file hashes + archive hash
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawn, spawnSync} from 'node:child_process'
import {
  APP_DIR,
  FAILED_DIR,
  LOGS_DIR,
  RELEASE_ROOT,
  STATE_DIR,
  CURRENT_LINK,
  ensureDirs,
  killTree,
  makeRunId,
  nowIso,
  parseRemoteSlug,
  readJson,
  readLink,
  runStreaming,
  sha256File,
  shortSha,
  writeJsonAtomic,
} from './lib.mjs'
import {validateArtifact} from './artifact-contract.mjs'
import {verifyRelease} from './release.mjs'

export const ARTIFACT_WORKFLOW = '.github/workflows/build-artifact.yml'
export const ARTIFACT_PREFIX = 'mercato-release-'
export const MANIFEST_NAME = 'release-manifest.json'
export const ARCHIVE_NAME = 'release.tar.gz'
export const ARTIFACTS_DIR = path.join(STATE_DIR, 'artifacts')

const TOKEN_FILE = process.env.GITHUB_TOKEN_FILE || '/home/pro/.config/ila3/github-token'
const MAX_ENTRY_PATH = 240
const MAX_ENTRIES = 300000
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
const ENV_FILES = ['.env', '.env.local', '.env.production']

export class ArtifactError extends Error {
  constructor(code, message, detail = null) {
    super(message)
    this.name = 'ArtifactError'
    this.code = code
    this.detail = detail
  }
}

function fail(code, message, detail) {
  return new ArtifactError(code, message, detail)
}

export function artifactName(sha) {
  return `${ARTIFACT_PREFIX}${sha}`
}

function isInside(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Validate one archive entry name and return its normalised relative path.
 * `null` means "the archive root itself", which callers ignore.
 */
export function normalizeEntryPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw fail('artifact-unsafe-path', 'empty member name in archive', {raw})
  }
  if (raw.includes('\0') || raw.includes('\\')) {
    throw fail('artifact-unsafe-path', 'NUL or backslash in archive member name', {raw})
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(raw)) {
    throw fail('artifact-unsafe-path', 'control character in archive member name', {raw})
  }
  if (path.posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw fail('artifact-unsafe-path', 'absolute path in archive', {raw})
  }
  let normalized = raw
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  normalized = normalized.replace(/\/+$/, '')
  if (normalized === '' || normalized === '.') return null
  const segments = normalized.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw fail('artifact-unsafe-path', 'empty, dot or dot-dot segment in archive member name', {raw})
  }
  if (normalized.length > MAX_ENTRY_PATH || segments.some((segment) => segment.length > 255)) {
    throw fail('artifact-unsafe-path', 'archive member path too long', {raw, length: normalized.length})
  }
  return normalized
}

/** Deterministic digest over every payload entry (path + type + hash/target). */
export function contentDigest(entries) {
  const lines = entries
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((entry) =>
      entry.type === 'symlink'
        ? `${entry.path}\0l\0${entry.target}`
        : `${entry.path}\0f\0${entry.sha256}\0${entry.bytes}`,
    )
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex')
}

/**
 * Walk a directory and return file/symlink entries with hashes.
 * Symlinks must be relative and stay inside `root`; hardlinked files are rejected
 * because nothing this pipeline packages is hardlinked and a hardlink is the
 * classic tar escape primitive.
 */
export function scanTree(root, {exclude = null, maxEntries = MAX_ENTRIES, relBase = '', containmentRoot = null} = {}) {
  const entries = []
  const contained = containmentRoot || root
  const walk = (absDir, relDir) => {
    let names
    try {
      names = fs.readdirSync(absDir).sort()
    } catch (error) {
      throw fail('artifact-scan-failed', `cannot read ${absDir}: ${error?.message || error}`)
    }
    for (const name of names) {
      const entryRel = relDir ? `${relDir}/${name}` : name
      const rel = relBase ? `${relBase}/${entryRel}` : entryRel
      if (exclude && exclude(rel)) continue
      const full = path.join(absDir, name)
      const stat = fs.lstatSync(full)
      if (stat.isDirectory()) {
        walk(full, entryRel)
        continue
      }
      if (entries.length >= maxEntries) {
        throw fail('artifact-too-many-files', `archive has more than ${maxEntries} entries`)
      }
      if (stat.isFile()) {
        if (stat.nlink > 1) {
          throw fail('artifact-hardlink-rejected', `hardlinked payload file is not allowed: ${rel}`, {path: rel, nlink: stat.nlink})
        }
        entries.push({path: rel, type: 'file', bytes: stat.size, sha256: sha256File(full), mode: stat.mode & 0o777})
        continue
      }
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(full)
        const resolved = path.resolve(path.dirname(full), target)
        if (path.isAbsolute(target) || !isInside(contained, resolved)) {
          throw fail('artifact-symlink-escape', `symlink escapes the payload root: ${rel} -> ${target}`, {path: rel, target})
        }
        entries.push({path: rel, type: 'symlink', target})
        continue
      }
      throw fail('artifact-unsupported-file-type', `unsupported file type in payload: ${rel}`)
    }
  }
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw fail('artifact-source-missing', `payload root is not a directory: ${root}`)
  }
  walk(root, '')
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/**
 * Build release.tar.gz + release-manifest.json from explicit include paths.
 *
 * Paths are relative to `sourceRoot`. Directories are expanded; `exclude(rel)`
 * filters both the manifest and the tar list, so the two always agree.
 */
export async function createReleasePackage({
  sourceRoot,
  includePaths,
  outDir,
  meta,
  exclude = null,
  logPath = null,
  timeoutMs = 1800000,
  compression = 'gzip -1 -n',
}) {
  ensureDirs()
  const root = path.resolve(sourceRoot)
  fs.mkdirSync(outDir, {recursive: true})
  const archivePath = path.join(outDir, ARCHIVE_NAME)
  const manifestPath = path.join(outDir, MANIFEST_NAME)
  for (const stale of [archivePath, manifestPath]) {
    try {
      fs.unlinkSync(stale)
    } catch {
      /* absent */
    }
  }

  const entries = []
  for (const include of includePaths) {
    const rel = path.posix.normalize(String(include).replace(/\\/g, '/')).replace(/^\.\//, '')
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw fail('artifact-unsafe-path', `include path escapes the source root: ${include}`)
    }
    const full = path.join(root, rel)
    let stat
    try {
      stat = fs.lstatSync(full)
    } catch {
      throw fail('artifact-source-missing', `include path does not exist: ${rel}`)
    }
    if (stat.isDirectory()) {
      entries.push(...scanTree(full, {exclude, relBase: rel, containmentRoot: root}))
    } else if (stat.isFile() && !(exclude && exclude(rel))) {
      entries.push({path: rel, type: 'file', bytes: stat.size, sha256: sha256File(full), mode: stat.mode & 0o777})
    } else if (stat.isSymbolicLink() && !(exclude && exclude(rel))) {
      const target = fs.readlinkSync(full)
      if (path.isAbsolute(target) || !isInside(root, path.resolve(path.dirname(full), target))) {
        throw fail('artifact-symlink-escape', `symlink escapes the source root: ${rel} -> ${target}`)
      }
      entries.push({path: rel, type: 'symlink', target})
    }
  }
  // Expanding two includes may overlap: keep one entry per path.
  const byPath = new Map()
  for (const entry of entries) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, entry)
  }
  const files = [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (files.length === 0) throw fail('artifact-empty-package', 'no files matched the include paths')
  if (files.length > MAX_ENTRIES) throw fail('artifact-too-many-files', `package has more than ${MAX_ENTRIES} entries`)

  const listFile = path.join(outDir, `.tar-list-${process.pid}.nul`)
  fs.writeFileSync(listFile, `${files.map((entry) => entry.path).join('\0')}\0`)
  try {
    const tar = await runStreaming({
      cmd: 'tar',
      args: [
        '-I',
        compression,
        '-cf',
        archivePath,
        '--no-recursion',
        '--sort=name',
        '--mtime=@0',
        '--owner=0',
        '--group=0',
        '--numeric-owner',
        '--hard-dereference',
        '--null',
        '-C',
        root,
        '-T',
        listFile,
      ],
      cwd: root,
      timeoutMs,
      logPath,
      label: 'release-tar',
      echo: false,
      maxTailLines: 40,
    })
    if (tar.status !== 0) {
      throw fail('artifact-package-failed', `tar failed: ${tar.tail}`, {exit: tar.status, log: logPath})
    }
  } finally {
    try {
      fs.unlinkSync(listFile)
    } catch {
      /* absent */
    }
  }

  const archiveBytes = fs.statSync(archivePath).size
  const archiveSha256 = sha256File(archivePath)
  const symlinks = files.filter((entry) => entry.type === 'symlink').length
  const bytes = files.reduce((sum, entry) => sum + (entry.type === 'file' ? entry.bytes : 0), 0)
  const manifest = {
    schema: 1,
    sha256: contentDigest(files),
    repository: meta.repository,
    workflowRunId: Number(meta.workflowRunId),
    workflow: meta.workflow || {path: ARTIFACT_WORKFLOW, name: 'build-artifact'},
    commit: meta.commit,
    shortSha: String(meta.commit).slice(0, 8),
    ref: meta.ref || null,
    createdAt: meta.createdAt || nowIso(),
    runtime: {
      nodeMajor: Number(meta.nodeMajor),
      platform: meta.platform,
      arch: meta.arch,
    },
    checks: meta.checks,
    database: {
      migrationRequired: false,
      note: 'The release pipeline never runs database migrations; the archive carries no database data.',
    },
    archive: {file: ARCHIVE_NAME, sha256: archiveSha256, bytes: archiveBytes, compression: 'gzip'},
    files,
    summary: {
      files: files.length - symlinks,
      symlinks,
      bytes,
      excluded: meta.excluded || [],
      trackedSource: meta.trackedSource ?? null,
    },
    generator: 'scripts/auto-deploy/package-release.mjs',
  }
  writeJsonAtomic(manifestPath, manifest)
  return {archivePath, manifestPath, manifest, archiveSha256, archiveBytes}
}

/** List tar members and validate every name before extracting anything. */
export function assertArchiveEntriesSafe(archive, {timeoutMs = 900000, maxEntries = MAX_ENTRIES} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-tzf', archive], {stdio: ['ignore', 'pipe', 'pipe']})
    let buffer = ''
    let count = 0
    let stderr = ''
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => {
      killTree(child.pid, 'SIGKILL')
      finish(fail('artifact-extract-timeout', `tar listing exceeded ${timeoutMs}ms`, {archive}))
    }, timeoutMs)
    timer.unref?.()
    const validate = (line) => {
      count += 1
      if (count > maxEntries) {
        killTree(child.pid, 'SIGKILL')
        throw fail('artifact-too-many-files', `archive has more than ${maxEntries} entries`)
      }
      normalizeEntryPath(line)
    }
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        try {
          validate(line)
        } catch (error) {
          killTree(child.pid, 'SIGKILL')
          finish(error)
          return
        }
        index = buffer.indexOf('\n')
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
      if (stderr.length > 8192) stderr = stderr.slice(-8192)
    })
    child.on('error', (error) => finish(fail('artifact-extract-failed', `cannot list archive: ${error.message}`)))
    child.on('close', (code) => {
      if (settled) return
      if (buffer.length > 0) {
        try {
          validate(buffer)
        } catch (error) {
          finish(error)
          return
        }
      }
      if (code !== 0) {
        finish(fail('artifact-extract-failed', `tar -tzf exited ${code}: ${stderr.trim()}`, {archive, stderr: stderr.trim()}))
        return
      }
      finish(null, {entries: count})
    })
  })
}

/** Extract a tar.gz into an empty directory and verify it against the manifest. */
export async function extractAndVerify({archive, dest, manifest, logPath = null, timeoutMs = 1800000}) {
  const target = path.resolve(dest)
  fs.rmSync(target, {recursive: true, force: true})
  fs.mkdirSync(target, {recursive: true})

  const listing = await assertArchiveEntriesSafe(archive)
  const extract = await runStreaming({
    cmd: 'tar',
    args: ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', target],
    cwd: target,
    timeoutMs,
    logPath,
    label: 'release-extract',
    echo: false,
    maxTailLines: 40,
  })
  if (extract.status !== 0) {
    throw fail('artifact-extract-failed', `tar extraction failed: ${extract.tail}`, {exit: extract.status, log: logPath})
  }

  const scanned = scanTree(target)
  const expected = new Map((manifest.files || []).map((entry) => [entry.path, entry]))
  const seen = new Set()
  let bytes = 0
  for (const entry of scanned) {
    const want = expected.get(entry.path)
    if (!want) {
      throw fail('artifact-extra-file', `archive contains a file the manifest does not list: ${entry.path}`, {path: entry.path})
    }
    seen.add(entry.path)
    if (want.type !== entry.type) {
      throw fail('artifact-type-mismatch', `type mismatch for ${entry.path}: manifest=${want.type} archive=${entry.type}`, {
        path: entry.path,
      })
    }
    if (entry.type === 'file') {
      bytes += entry.bytes
      if (want.sha256 !== entry.sha256 || Number(want.bytes) !== entry.bytes) {
        throw fail('artifact-file-hash-mismatch', `sha256/size mismatch for ${entry.path}`, {
          path: entry.path,
          expected: {sha256: want.sha256, bytes: want.bytes},
          actual: {sha256: entry.sha256, bytes: entry.bytes},
        })
      }
    } else if (want.target !== entry.target) {
      throw fail('artifact-symlink-target-mismatch', `symlink target mismatch for ${entry.path}`, {
        path: entry.path,
        expected: want.target,
        actual: entry.target,
      })
    }
  }
  for (const entry of manifest.files || []) {
    if (!seen.has(entry.path)) {
      throw fail('artifact-missing-file', `manifest lists a file missing from the archive: ${entry.path}`, {path: entry.path})
    }
  }
  const digest = contentDigest(scanned)
  if (digest !== manifest.sha256) {
    throw fail('artifact-content-digest-mismatch', 'content digest of the extracted tree does not match the manifest', {
      expected: manifest.sha256,
      actual: digest,
    })
  }
  return {
    digest,
    entries: scanned.length,
    files: scanned.length - scanned.filter((entry) => entry.type === 'symlink').length,
    symlinks: scanned.filter((entry) => entry.type === 'symlink').length,
    bytes,
    listingEntries: listing.entries,
  }
}

/**
 * Validate manifest metadata against values we independently know, before the
 * 2 GB tree is extracted. The digest is checked again after extraction.
 */
export function validateManifestMetadata(manifest, expected) {
  const result = validateArtifact(manifest, {...expected, sha256: manifest?.sha256})
  const errors = result.errors.filter((error) => error !== 'digest-mismatch')
  if (manifest?.workflow?.path && manifest.workflow.path !== ARTIFACT_WORKFLOW) {
    errors.push('workflow-path-mismatch')
  }
  if (errors.length > 0) {
    throw fail('artifact-manifest-mismatch', `manifest does not match trusted CI metadata: ${errors.join(', ')}`, {
      errors,
      expected,
      manifest: {
        schema: manifest?.schema,
        repository: manifest?.repository,
        workflowRunId: manifest?.workflowRunId,
        commit: manifest?.commit,
        runtime: manifest?.runtime,
        checks: manifest?.checks,
      },
    })
  }
  return true
}

function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim()
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  } catch {
    return ''
  }
}

async function githubJson(pathname, {token, timeoutMs = 20000} = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'user-agent': 'ila3-auto-deploy/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  if (!response.ok) {
    throw fail('artifact-github-error', `GitHub API ${response.status} for ${pathname}`, {
      status: response.status,
      body: text.slice(0, 500),
    })
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw fail('artifact-github-error', `GitHub API returned invalid JSON for ${pathname}: ${error.message}`)
  }
}

/**
 * Resolve the release artifact for one workflow run and cross-check the run.
 * Returns {run, artifact, sha256} where sha256 is the digest GitHub recorded.
 */
export async function resolveRunArtifact({repo, runId, sha, token = null, timeoutMs = 20000}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) {
    throw fail('artifact-repository-invalid', `repository slug is not owner/name: ${repo}`)
  }
  const authToken = token ?? readToken()
  if (!authToken) throw fail('artifact-token-missing', `no GitHub token (GITHUB_TOKEN or ${TOKEN_FILE})`)

  let run
  try {
    run = await githubJson(`/repos/${repo}/actions/runs/${runId}`, {token: authToken, timeoutMs})
  } catch (error) {
    if (error?.detail?.status === 404) {
      throw fail('artifact-run-not-found', `workflow run ${runId} not found for ${repo}`, error.detail)
    }
    throw error
  }
  if (run.head_sha !== sha) {
    throw fail('artifact-run-sha-mismatch', `run ${runId} head_sha=${run.head_sha} but deploy targets ${sha}`, {
      runId,
      headSha: run.head_sha,
      sha,
    })
  }
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    throw fail('artifact-run-not-successful', `run ${runId} is ${run.status}/${run.conclusion}`, {
      runId,
      status: run.status,
      conclusion: run.conclusion,
    })
  }
  if (run.path && run.path !== ARTIFACT_WORKFLOW) {
    throw fail('artifact-run-wrong-workflow', `run ${runId} is for ${run.path}, expected ${ARTIFACT_WORKFLOW}`, {
      path: run.path,
    })
  }

  const name = artifactName(sha)
  let listing
  try {
    listing = await githubJson(
      `/repos/${repo}/actions/runs/${runId}/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
      {token: authToken, timeoutMs},
    )
  } catch (error) {
    if (error?.detail?.status === 404) {
      throw fail('artifact-not-found', `no artifact named ${name} on run ${runId}`, error.detail)
    }
    throw error
  }
  const candidates = (listing.artifacts || [])
    .filter((artifact) => artifact.name === name && !artifact.expired)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
  if (candidates.length === 0) {
    throw fail('artifact-not-found', `run ${runId} has no unexpired artifact named ${name}`, {
      runId,
      available: (listing.artifacts || []).map((artifact) => ({name: artifact.name, expired: artifact.expired})),
    })
  }
  const artifact = candidates[0]
  const digestMatch = String(artifact.digest || '').match(/^sha256:([a-f0-9]{64})$/)
  if (!digestMatch) {
    throw fail('artifact-digest-missing', `artifact ${name} has no sha256 digest in GitHub metadata; refusing to trust it`, {
      artifactId: artifact.id,
      digest: artifact.digest ?? null,
    })
  }
  return {
    run: {
      id: run.id,
      headSha: run.head_sha,
      path: run.path,
      url: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
    },
    artifact: {
      id: artifact.id,
      name: artifact.name,
      size: artifact.size_in_bytes,
      digest: digestMatch[1],
      url: artifact.archive_download_url,
      createdAt: artifact.created_at,
    },
    sha256: digestMatch[1],
  }
}

function isApiArtifactUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'api.github.com' && /\/actions\/artifacts\/\d+\/zip$/.test(parsed.pathname)
  } catch {
    return false
  }
}

/** Resolve an authenticated API download URL to the short-lived signed URL. */
export async function resolveDownloadUrl({url, token = null, timeoutMs = 20000}) {
  if (!isApiArtifactUrl(url)) return url
  const authToken = token ?? readToken()
  if (!authToken) throw fail('artifact-token-missing', 'no GitHub token to resolve the artifact download URL')
  const response = await fetch(url, {
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/vnd.github+json',
      'user-agent': 'ila3-auto-deploy/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (response.status === 404) {
    await response.body?.cancel?.().catch(() => undefined)
    throw fail('artifact-download-failed', `artifact download returned HTTP 404`, {status: 404, url})
  }
  const location = response.headers.get('location')
  await response.body?.cancel?.().catch(() => undefined)
  if (response.status >= 300 && response.status < 400 && location) return location
  if (response.ok) return url
  throw fail('artifact-download-failed', `artifact download redirect returned HTTP ${response.status}`, {
    status: response.status,
    url,
  })
}

async function writeResponseToFile(response, file) {
  const tmp = `${file}.part-${process.pid}`
  const handle = await fs.promises.open(tmp, 'w')
  let bytes = 0
  try {
    const body = response.body
    if (!body) throw new Error('empty response body')
    for await (const chunk of body) {
      const buffer = Buffer.from(chunk)
      let offset = 0
      while (offset < buffer.length) {
        const {bytesWritten} = await handle.write(buffer, offset, buffer.length - offset)
        if (bytesWritten <= 0) throw new Error('short write while saving artifact')
        offset += bytesWritten
      }
      bytes += buffer.length
    }
  } finally {
    await handle.close()
  }
  fs.renameSync(tmp, file)
  return bytes
}

/**
 * Download an artifact zip and verify its sha256. Timeouts and HTTP errors are
 * reported as `artifact-download-failed` with the transport detail attached.
 */
export async function downloadArtifactZip({
  url,
  file,
  token = null,
  timeoutMs = 900000,
  expectedBytes = null,
  logPath = null,
}) {
  fs.mkdirSync(path.dirname(file), {recursive: true})
  const startedAt = Date.now()
  let signedUrl
  try {
    signedUrl = await resolveDownloadUrl({url, token})
  } catch (error) {
    if (logPath) fs.appendFileSync(logPath, `[${nowIso()}] [artifact-download] ${error.code}: ${error.message}\n`)
    throw error
  }
  let response
  try {
    response = await fetch(signedUrl, {
      headers: {'user-agent': 'ila3-auto-deploy/1.0'},
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const detail = {url, reason: error?.name === 'TimeoutError' ? 'timeout' : 'network', error: String(error?.message || error)}
    if (logPath) fs.appendFileSync(logPath, `[${nowIso()}] [artifact-download] failed: ${JSON.stringify(detail)}\n`)
    throw fail('artifact-download-failed', `artifact download failed: ${detail.reason}`, detail)
  }
  if (!response.ok) {
    await response.body?.cancel?.().catch(() => undefined)
    const detail = {url, status: response.status}
    if (logPath) fs.appendFileSync(logPath, `[${nowIso()}] [artifact-download] HTTP ${response.status}\n`)
    throw fail('artifact-download-failed', `artifact download returned HTTP ${response.status}`, detail)
  }
  let bytes
  try {
    bytes = await writeResponseToFile(response, file)
  } catch (error) {
    if (logPath) fs.appendFileSync(logPath, `[${nowIso()}] [artifact-download] write failed: ${error?.message || error}\n`)
    throw fail('artifact-download-failed', `artifact download aborted while writing: ${error?.message || error}`, {
      url,
      error: String(error?.message || error),
    })
  }
  const sha256 = sha256File(file)
  const line = `[${nowIso()}] [artifact-download] bytes=${bytes} sha256=${sha256} ms=${Date.now() - startedAt}\n`
  if (logPath) fs.appendFileSync(logPath, line)
  if (expectedBytes != null && Number(expectedBytes) !== bytes) {
    throw fail('artifact-size-mismatch', `artifact size ${bytes} does not match CI metadata ${expectedBytes}`, {bytes, expectedBytes})
  }
  return {file, bytes, sha256, ms: Date.now() - startedAt}
}

/**
 * Create the outer artifact zip for local drills (CI lets upload-artifact do it).
 * Uses Python's stdlib zipfile because `zip` is not installed on the production host.
 */
export function createArtifactZip({dir, zipFile, files = [MANIFEST_NAME, ARCHIVE_NAME], timeoutMs = 600000}) {
  fs.mkdirSync(path.dirname(zipFile), {recursive: true})
  try {
    fs.unlinkSync(zipFile)
  } catch {
    /* absent */
  }
  const result = spawnSync('python3', ['-m', 'zipfile', '-c', zipFile, ...files], {
    cwd: dir,
    encoding: 'utf8',
    timeout: timeoutMs,
  })
  if (result.status !== 0) {
    throw fail('artifact-package-failed', `cannot create artifact zip: ${(result.stderr || result.stdout || '').trim()}`, {
      status: result.status,
    })
  }
  return zipFile
}

/** List + extract the outer artifact zip, accepting only the two known members. */
export async function safeUnzip({zipFile, dest, logPath = null, timeoutMs = 600000}) {
  const listing = spawnSync('unzip', ['-Z1', zipFile], {encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024})
  if (listing.status !== 0) {
    throw fail('artifact-zip-invalid', `cannot list artifact zip: ${(listing.stderr || listing.stdout || '').trim()}`, {
      status: listing.status,
    })
  }
  const names = String(listing.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (names.length === 0) throw fail('artifact-zip-empty', 'artifact zip has no members')
  const allowed = new Set([ARCHIVE_NAME, MANIFEST_NAME])
  for (const name of names) {
    const normalized = normalizeEntryPath(name)
    if (!normalized || !allowed.has(normalized)) {
      throw fail('artifact-unsafe-path', `artifact zip contains an unexpected member: ${name}`, {name, allowed: [...allowed]})
    }
  }
  fs.rmSync(dest, {recursive: true, force: true})
  fs.mkdirSync(dest, {recursive: true})
  const extract = await runStreaming({
    cmd: 'unzip',
    args: ['-q', zipFile, '-d', dest],
    cwd: dest,
    timeoutMs,
    logPath,
    label: 'artifact-unzip',
    echo: false,
    maxTailLines: 40,
  })
  if (extract.status !== 0) {
    throw fail('artifact-zip-invalid', `unzip failed: ${extract.tail}`, {status: extract.status, log: logPath})
  }
  for (const name of allowed) {
    const full = path.join(dest, name)
    if (!fs.existsSync(full) || !fs.lstatSync(full).isFile()) {
      throw fail('artifact-zip-incomplete', `artifact zip is missing ${name}`)
    }
  }
  for (const entry of fs.readdirSync(dest, {withFileTypes: true})) {
    if (!allowed.has(entry.name) || !entry.isFile()) {
      throw fail('artifact-extra-file', `unexpected entry after unzip: ${entry.name}`)
    }
  }
  return {dir: dest, names}
}

function availableBytes(target) {
  try {
    const stat = fs.statfsSync(target)
    return Number(stat.bavail) * Number(stat.bsize)
  } catch {
    return null
  }
}

function human(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = Number(bytes) || 0
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)}${units[unit]}`
}

function copyEnvFiles(releaseDir) {
  const copied = []
  for (const name of ENV_FILES) {
    const source = path.join(APP_DIR, name)
    if (!fs.existsSync(source)) continue
    const target = path.join(releaseDir, name)
    fs.copyFileSync(source, target)
    fs.chmodSync(target, 0o600)
    copied.push({name, bytes: fs.statSync(target).size, sha256: sha256File(target)})
  }
  return copied
}

/** Keep the two newest download directories; downloads are ~1 GB each. */
export function pruneArtifactCache({root = ARTIFACTS_DIR, keep = 2} = {}) {
  const removed = []
  let freed = 0
  let shaDirs
  try {
    shaDirs = fs.readdirSync(root, {withFileTypes: true}).filter((entry) => entry.isDirectory())
  } catch {
    return {removed, freed}
  }
  const runs = []
  for (const shaDir of shaDirs) {
    const shaPath = path.join(root, shaDir.name)
    let entries
    try {
      entries = fs.readdirSync(shaPath, {withFileTypes: true}).filter((entry) => entry.isDirectory())
    } catch {
      continue
    }
    for (const run of entries) {
      const full = path.join(shaPath, run.name)
      let mtime = 0
      try {
        mtime = fs.statSync(full).mtimeMs
      } catch {
        continue
      }
      runs.push({full, shaPath, mtime})
    }
  }
  runs.sort((a, b) => b.mtime - a.mtime)
  for (const run of runs.slice(keep)) {
    try {
      const bytes = Number(spawnSync('du', ['-sb', run.full], {encoding: 'utf8', timeout: 60000}).stdout?.split(/\s+/)[0]) || 0
      fs.rmSync(run.full, {recursive: true, force: true})
      freed += bytes
      removed.push(path.relative(root, run.full))
    } catch {
      /* best effort */
    }
  }
  for (const shaDir of shaDirs) {
    const shaPath = path.join(root, shaDir.name)
    try {
      if (fs.readdirSync(shaPath).length === 0) fs.rmdirSync(shaPath)
    } catch {
      /* not empty or gone */
    }
  }
  return {removed, freed}
}

function installEnv() {
  return {
    ...process.env,
    NODE_ENV: 'production',
    CI: '1',
    YARN_ENABLE_TELEMETRY: '0',
  }
}

/**
 * Download + verify + install one release artifact.
 *
 * source: {kind:'github'} (default, needs runId + token)
 *       | {kind:'file', file, sha256, runId}      (drill only)
 *       | {kind:'url', url, sha256, runId}        (drill only)
 */
export async function installFromArtifact({
  sha,
  runId = null,
  repo = null,
  source = {kind: 'github'},
  installDir = null,
  force = false,
  token = null,
  downloadTimeoutMs = 900000,
  extractTimeoutMs = 1800000,
  installTimeoutMs = 1800000,
  logPath = null,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(String(sha || ''))) {
    throw fail('artifact-sha-invalid', `release sha must be a full 40-hex commit: ${sha}`)
  }
  ensureDirs()
  const repository = repo || parseRemoteSlug()
  const target = installDir ? path.resolve(installDir) : path.join(RELEASE_ROOT, sha)
  const runKey = runId != null ? String(runId) : source.kind === 'file' ? 'local' : 'unknown'
  const runTag = makeRunId(sha, `artifact-${runKey}`)
  const log = logPath || path.join(LOGS_DIR, `${runTag}-artifact.log`)
  fs.mkdirSync(path.dirname(log), {recursive: true})

  if (!force && fs.existsSync(target)) {
    const existing = readJson(path.join(target, 'release.json'))
    const verified = existing?.sha === sha ? verifyRelease(target, sha) : {ok: false}
    if (existing?.status === 'ok' && existing?.source?.method === 'ci-artifact' && verified.ok) {
      return {reused: true, dir: target, manifest: existing, runId, log}
    }
  }
  if (fs.existsSync(target)) {
    const currentTarget = readLink(CURRENT_LINK)
    if (currentTarget && path.resolve(currentTarget) === target) {
      throw fail('artifact-target-in-use', `refusing to replace the live release directory: ${target}`)
    }
    fs.rmSync(target, {recursive: true, force: true})
  }

  const workDir = path.join(ARTIFACTS_DIR, sha, runTag)
  fs.mkdirSync(workDir, {recursive: true})
  const outerDir = path.join(workDir, 'outer')
  const staging = path.join(RELEASE_ROOT, `.staging-${sha}-${runTag}`)
  let resolved = null
  let zipFile = null
  let archiveSha256 = null
  let artifactMeta = null
  let download = null

  const writeFailure = (error) => {
    try {
      writeJsonAtomic(path.join(FAILED_DIR, `${sha}-${runTag}.json`), {
        schema: 1,
        status: 'failed',
        stage: 'artifact-install',
        sha,
        runId,
        repository,
        at: nowIso(),
        code: error?.code || 'artifact-install-failed',
        message: error?.message || String(error),
        detail: error?.detail ?? null,
        log,
      })
    } catch {
      /* best effort */
    }
  }

  try {
    if (source.kind === 'github') {
      if (runId == null) throw fail('artifact-run-missing', 'a workflow run id is required to download the release artifact')
      resolved = await resolveRunArtifact({repo: repository, runId, sha, token})
      artifactMeta = resolved.artifact
      archiveSha256 = resolved.sha256
      zipFile = path.join(workDir, `artifact-${resolved.artifact.id}.zip`)
      if (fs.existsSync(zipFile) && sha256File(zipFile) === archiveSha256) {
        download = {file: zipFile, bytes: fs.statSync(zipFile).size, sha256: archiveSha256, cached: true}
        fs.appendFileSync(log, `[${nowIso()}] [artifact-download] cache hit ${zipFile}\n`)
      } else {
        download = await downloadArtifactZip({
          url: resolved.artifact.url,
          file: zipFile,
          token,
          timeoutMs: downloadTimeoutMs,
          expectedBytes: resolved.artifact.size,
          logPath: log,
        })
      }
    } else if (source.kind === 'file') {
      zipFile = path.resolve(source.file)
      if (!fs.existsSync(zipFile)) throw fail('artifact-download-failed', `artifact file not found: ${zipFile}`)
      archiveSha256 = source.sha256
      if (!/^[a-f0-9]{64}$/.test(archiveSha256 || '')) {
        throw fail('artifact-digest-missing', 'file mode requires a 64-hex --artifact-sha256')
      }
      const actual = sha256File(zipFile)
      download = {file: zipFile, bytes: fs.statSync(zipFile).size, sha256: actual, cached: true}
      if (actual !== archiveSha256) {
        throw fail('artifact-digest-mismatch', 'local artifact sha256 does not match the expected CI digest', {
          expected: archiveSha256,
          actual,
        })
      }
      artifactMeta = {id: null, name: path.basename(zipFile), size: download.bytes, digest: archiveSha256, url: null}
    } else if (source.kind === 'url') {
      zipFile = path.join(workDir, 'artifact-download.zip')
      archiveSha256 = source.sha256
      if (!/^[a-f0-9]{64}$/.test(archiveSha256 || '')) {
        throw fail('artifact-digest-missing', 'url mode requires a 64-hex --artifact-sha256')
      }
      download = await downloadArtifactZip({
        url: source.url,
        file: zipFile,
        token,
        timeoutMs: downloadTimeoutMs,
        logPath: log,
      })
      if (download.sha256 !== archiveSha256) {
        throw fail('artifact-digest-mismatch', 'downloaded artifact sha256 does not match the expected CI digest', {
          expected: archiveSha256,
          actual: download.sha256,
        })
      }
      artifactMeta = {id: null, name: path.basename(zipFile), size: download.bytes, digest: archiveSha256, url: source.url}
    } else {
      throw fail('artifact-source-invalid', `unknown artifact source kind: ${source.kind}`)
    }

    if (download.sha256 !== archiveSha256) {
      // Every source path above compares, this is a belt-and-braces check.
      throw fail('artifact-digest-mismatch', 'local archive sha256 does not match the CI digest', {
        expected: archiveSha256,
        actual: download.sha256,
      })
    }

    const zipSha = sha256File(zipFile)
    if (zipSha !== archiveSha256) {
      throw fail('artifact-digest-mismatch', 'artifact zip sha256 changed after download', {expected: archiveSha256, actual: zipSha})
    }

    const free = availableBytes(RELEASE_ROOT)
    const needed = download.bytes * 2 + 3 * 1024 * 1024 * 1024
    if (free != null && free < needed) {
      throw fail('insufficient-disk', `not enough free space under ${RELEASE_ROOT}: ${human(free)} available, ${human(needed)} required`)
    }

    const unzip = await safeUnzip({zipFile, dest: outerDir, logPath: log})
    const manifestPath = path.join(unzip.dir, MANIFEST_NAME)
    if (fs.statSync(manifestPath).size > MAX_MANIFEST_BYTES) {
      throw fail('artifact-manifest-invalid', 'release manifest is unreasonably large')
    }
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      throw fail('artifact-manifest-invalid', `cannot parse release-manifest.json: ${error.message}`)
    }

    const archivePath = path.join(unzip.dir, ARCHIVE_NAME)
    const innerSha = sha256File(archivePath)
    if (!manifest?.archive || manifest.archive.file !== ARCHIVE_NAME) {
      throw fail('artifact-manifest-invalid', `manifest.archive.file must be ${ARCHIVE_NAME}`, {archive: manifest?.archive ?? null})
    }
    if (innerSha !== manifest.archive.sha256) {
      throw fail('artifact-digest-mismatch', 'release.tar.gz sha256 does not match release-manifest.json', {
        expected: manifest.archive.sha256,
        actual: innerSha,
      })
    }
    if (Number(manifest.archive.bytes) !== fs.statSync(archivePath).size) {
      throw fail('artifact-size-mismatch', 'release.tar.gz size does not match the manifest', {
        expected: manifest.archive.bytes,
        actual: fs.statSync(archivePath).size,
      })
    }

    const effectiveRunId = runId ?? manifest.workflowRunId
    validateManifestMetadata(manifest, {
      commit: sha,
      repository,
      workflowRunId: Number(effectiveRunId),
      nodeMajor: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
    })

    fs.rmSync(staging, {recursive: true, force: true})
    fs.mkdirSync(staging, {recursive: true})
    const extracted = await extractAndVerify({
      archive: archivePath,
      dest: staging,
      manifest,
      logPath: log,
      timeoutMs: extractTimeoutMs,
    })
    const verified = validateArtifact(manifest, {
      commit: sha,
      sha256: extracted.digest,
      repository,
      workflowRunId: Number(effectiveRunId),
      nodeMajor: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
    })
    if (!verified.ok) {
      throw fail('artifact-manifest-mismatch', `manifest failed final validation: ${verified.errors.join(', ')}`, {
        errors: verified.errors,
      })
    }

    const stamp = readJson(path.join(staging, '.mercato', 'build-info.json'))
    const buildIdPath = path.join(staging, '.mercato', 'next', 'BUILD_ID')
    if (!stamp || stamp.status !== 'ok' || stamp.commit !== shortSha(sha) || !fs.existsSync(buildIdPath)) {
      throw fail('artifact-build-stamp-mismatch', 'artifact build stamp does not match the target commit', {
        expected: shortSha(sha),
        stamp: stamp ?? null,
        buildId: fs.existsSync(buildIdPath),
      })
    }

    const installLog = path.join(LOGS_DIR, `${runTag}-artifact-install.log`)
    fs.appendFileSync(log, `[${nowIso()}] [artifact-install] yarn install --immutable in ${staging}\n`)
    const install = await runStreaming({
      cmd: 'yarn',
      args: ['install', '--immutable'],
      cwd: staging,
      env: installEnv(),
      timeoutMs: installTimeoutMs,
      logPath: installLog,
      label: 'artifact-yarn-install',
      echo: true,
      filter: /(error|Error|warn|Warning|Done|success|Success|failed|Failed|➤|YN0000|YN0001|YN0050)/,
    })
    if (install.status !== 0) {
      throw fail('artifact-install-failed', `yarn install --immutable failed: ${install.tail}`, {
        exit: install.status,
        timedOut: install.timedOut,
        log: installLog,
      })
    }
    const nextBin = path.join(staging, 'node_modules', 'next', 'dist', 'bin', 'next')
    if (!fs.existsSync(nextBin)) {
      throw fail('artifact-install-incomplete', `yarn install completed but ${nextBin} is missing`, {log: installLog})
    }

    const envFiles = copyEnvFiles(staging)
    const releaseManifest = {
      schema: 1,
      status: 'ok',
      sha,
      shortSha: shortSha(sha),
      version: readJson(path.join(staging, 'package.json'), {})?.version ?? null,
      createdAt: nowIso(),
      source: {
        method: 'ci-artifact',
        repository,
        workflowRunId: Number(effectiveRunId),
        workflow: manifest.workflow,
        runUrl: resolved?.run?.url ?? artifactMeta?.url ?? null,
        artifactName: artifactMeta?.name ?? artifactName(sha),
        note: 'Installed from the CI release package; no Next build ran on this host.',
      },
      envFiles,
      commands: {
        install: 'yarn install --immutable',
        build: 'skipped (built in CI)',
      },
      logs: {artifact: log, install: installLog},
      install: {ms: install.ms, status: install.status, tail: install.tail.slice(-4000)},
      buildInfo: stamp,
      artifact: {
        id: artifactMeta?.id ?? null,
        name: artifactMeta?.name ?? null,
        size: download.bytes,
        digest: archiveSha256,
        archive: {file: ARCHIVE_NAME, sha256: manifest.archive.sha256, bytes: manifest.archive.bytes},
        manifestSha256: sha256File(manifestPath),
        contentDigest: extracted.digest,
        files: extracted.files,
        symlinks: extracted.symlinks,
        extractedBytes: extracted.bytes,
        verifiedAt: nowIso(),
        downloadMs: download.ms ?? 0,
      },
      artifactManifest: {
        path: path.join(target, MANIFEST_NAME),
        schema: manifest.schema,
        checks: manifest.checks,
        runtime: manifest.runtime,
        createdAt: manifest.createdAt,
      },
    }
    fs.copyFileSync(manifestPath, path.join(staging, MANIFEST_NAME))
    writeJsonAtomic(path.join(staging, 'release.json'), releaseManifest)

    fs.mkdirSync(path.dirname(target), {recursive: true})
    fs.renameSync(staging, target)
    const finalCheck = verifyRelease(target, sha)
    if (!finalCheck.ok) {
      throw fail('artifact-release-invalid', `installed release failed verification: ${finalCheck.reason}`, finalCheck)
    }
    fs.appendFileSync(
      log,
      `[${nowIso()}] [artifact-install] installed ${target} files=${extracted.files} symlinks=${extracted.symlinks} bytes=${extracted.bytes}\n`,
    )
    const pruned = pruneArtifactCache()
    return {reused: false, dir: target, manifest: releaseManifest, runId: effectiveRunId, log, extracted, pruned}
  } catch (error) {
    writeFailure(error)
    fs.rmSync(staging, {recursive: true, force: true})
    throw error
  }
}

export function artifactCacheDir() {
  return ARTIFACTS_DIR
}

/** CLI: fail for anyone who accidentally executes this module directly. */
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  console.error('[artifact] this module is a library; use deploy.mjs --from-artifact or package-release.mjs')
  process.exit(3)
}
