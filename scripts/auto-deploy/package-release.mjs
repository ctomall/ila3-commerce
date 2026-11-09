#!/usr/bin/env node
/**
 * Package a complete, runtime-ready release for CI upload.
 *
 * Run from a checkout that already ran install/generate/typecheck/test/build:
 *
 *   node scripts/auto-deploy/package-release.mjs \
 *     --source . --out dist \
 *     --repository "$GITHUB_REPOSITORY" --run-id "$GITHUB_RUN_ID" \
 *     --commit "$GITHUB_SHA" --node-major 24 --platform linux --arch x64 \
 *     --checks typecheck,unit,build
 *
 * Output: dist/release.tar.gz + dist/release-manifest.json. Both are uploaded as
 * ONE GitHub artifact so the artifact digest from the API covers the whole
 * package. The manifest is deliberately outside the tar: the tar's own sha256
 * is an input to the manifest, so embedding it would be circular.
 *
 * Contents are an allowlist:
 *   - git-tracked runtime sources/templates/config (no docs, no agent assets)
 *   - .mercato/next (build output, cache excluded)
 *   - .mercato/generated
 *   - .mercato/build-info.json
 * Never included: .env*, database dumps, node_modules, caches, artifacts.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {createReleasePackage, ARTIFACT_WORKFLOW, MANIFEST_NAME, ARCHIVE_NAME} from './artifact.mjs'
import {readJson, sha256File} from './lib.mjs'

const EXCLUDED_TRACKED_PREFIXES = [
  '.ai/',
  '.agents/',
  '.claude/',
  '.codex/',
  '.cursor/',
  '.github/',
  '.vscode/',
  'docs/',
  'docker/',
]
const EXCLUDED_TRACKED_FILES = new Set(['.gitignore', '.gitattributes', '.dockerignore', '.railwayignore'])
const EXCLUDED_BUILD_PREFIXES = ['.mercato/next/cache/', '.mercato/next/cache']
const INCLUDED_EXTRA = ['.mercato/generated', '.mercato/next', '.mercato/build-info.json']

function parseArgs(argv) {
  const args = {
    source: '.',
    out: 'dist',
    repository: process.env.GITHUB_REPOSITORY || null,
    runId: process.env.GITHUB_RUN_ID || null,
    commit: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF || null,
    nodeMajor: String(process.versions.node).split('.')[0],
    platform: process.platform,
    arch: process.arch,
    checks: 'typecheck,unit,build',
    timeoutMs: 1800000,
    fileList: null,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = () => argv[++i]
    if (flag === '--source') args.source = value()
    else if (flag === '--out') args.out = value()
    else if (flag === '--repository') args.repository = value()
    else if (flag === '--run-id') args.runId = value()
    else if (flag === '--commit') args.commit = value()
    else if (flag === '--ref') args.ref = value()
    else if (flag === '--node-major') args.nodeMajor = value()
    else if (flag === '--platform') args.platform = value()
    else if (flag === '--arch') args.arch = value()
    else if (flag === '--checks') args.checks = value()
    else if (flag === '--timeout-ms') args.timeoutMs = Number(value())
    else if (flag === '--file-list') args.fileList = value()
    else if (flag === '--json') args.json = true
    else if (flag === '--help' || flag === '-h') {
      console.log(
        'usage: node scripts/auto-deploy/package-release.mjs --source . --out dist --repository owner/name --run-id 123 --commit <40-hex> [--checks typecheck,unit,build]',
      )
      process.exit(0)
    } else throw new Error(`unknown argument ${flag}`)
  }
  return args
}

function listTrackedFiles(sourceRoot, fileList = null) {
  if (fileList) {
    return fs
      .readFileSync(fileList, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const result = spawnSync('git', ['-C', sourceRoot, 'ls-files', '-z'], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return String(result.stdout || '')
    .split('\0')
    .filter(Boolean)
}

function isExcludedTracked(rel) {
  if (!rel || rel.startsWith('.mercato/')) return true
  if (EXCLUDED_TRACKED_FILES.has(rel)) return true
  if (EXCLUDED_TRACKED_PREFIXES.some((prefix) => rel.startsWith(prefix))) return true
  const base = rel.split('/').pop()
  if (base === '.env' || base.startsWith('.env.')) return true
  return false
}

function isExcludedBuild(rel) {
  return EXCLUDED_BUILD_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sourceRoot = path.resolve(args.source)
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repository || '')) {
    throw new Error('--repository owner/name is required (or GITHUB_REPOSITORY)')
  }
  if (!/^\d+$/.test(String(args.runId || ''))) throw new Error('--run-id must be numeric (or GITHUB_RUN_ID)')
  if (!/^[a-f0-9]{40}$/.test(args.commit || '')) throw new Error('--commit must be a full 40-hex SHA')
  const checks = String(args.checks)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  for (const required of ['typecheck', 'unit', 'build']) {
    if (!checks.includes(required)) throw new Error(`--checks must include ${required} (got ${checks.join(',')})`)
  }

  const buildInfoPath = path.join(sourceRoot, '.mercato', 'build-info.json')
  const buildIdPath = path.join(sourceRoot, '.mercato', 'next', 'BUILD_ID')
  const generatedPath = path.join(sourceRoot, '.mercato', 'generated')
  const buildInfo = readJson(buildInfoPath)
  if (!buildInfo || buildInfo.status !== 'ok' || buildInfo.commit !== args.commit.slice(0, 8)) {
    throw new Error(
      `build stamp does not match ${args.commit.slice(0, 8)}: ${JSON.stringify({status: buildInfo?.status, commit: buildInfo?.commit})}`,
    )
  }
  if (!fs.existsSync(buildIdPath)) throw new Error(`missing ${buildIdPath}; run yarn build first`)
  if (!fs.existsSync(generatedPath)) throw new Error(`missing ${generatedPath}; run yarn generate first`)

  for (const required of ['package.json', 'yarn.lock', '.yarnrc.yml', 'next.config.ts']) {
    if (!fs.existsSync(path.join(sourceRoot, required))) throw new Error(`missing runtime file ${required}`)
  }

  const tracked = listTrackedFiles(sourceRoot, args.fileList)
  const trackedKept = tracked.filter((rel) => !isExcludedTracked(rel))
  const includePaths = [...trackedKept, ...INCLUDED_EXTRA]
  const excludedTracked = tracked.filter((rel) => isExcludedTracked(rel))

  const exclude = (rel) => {
    if (INCLUDED_EXTRA.some((include) => rel === include || rel.startsWith(`${include}/`))) {
      return isExcludedBuild(rel)
    }
    if (rel.startsWith('.mercato/')) return true
    return isExcludedTracked(rel)
  }

  const outDir = path.resolve(args.out)
  const result = await createReleasePackage({
    sourceRoot,
    includePaths,
    outDir,
    exclude,
    meta: {
      repository: args.repository,
      workflowRunId: Number(args.runId),
      workflow: {path: ARTIFACT_WORKFLOW, name: 'build-artifact'},
      commit: args.commit,
      ref: args.ref,
      nodeMajor: Number(args.nodeMajor),
      platform: args.platform,
      arch: args.arch,
      checks,
      excluded: [...EXCLUDED_TRACKED_PREFIXES, '.env*', ...EXCLUDED_BUILD_PREFIXES, 'node_modules/**'],
      trackedSource: {count: trackedKept.length, excludedCount: excludedTracked.length, excludedSample: excludedTracked.slice(0, 20)},
    },
    logPath: path.join(os.tmpdir(), `mercato-package-${args.commit.slice(0, 8)}-${args.runId}.log`),
    timeoutMs: args.timeoutMs,
  })

  const summary = {
    ok: true,
    source: sourceRoot,
    out: outDir,
    repository: args.repository,
    workflowRunId: Number(args.runId),
    commit: args.commit,
    checks,
    archive: {
      file: path.join(outDir, ARCHIVE_NAME),
      bytes: result.archiveBytes,
      human: `${(result.archiveBytes / 1024 / 1024).toFixed(1)}MiB`,
      sha256: result.archiveSha256,
    },
    manifest: {
      file: path.join(outDir, MANIFEST_NAME),
      sha256: sha256File(path.join(outDir, MANIFEST_NAME)),
      contentDigest: result.manifest.sha256,
      files: result.manifest.summary.files,
      symlinks: result.manifest.summary.symlinks,
      payloadBytes: result.manifest.summary.bytes,
      excludedTracked: result.manifest.summary.trackedSource?.excludedCount ?? null,
    },
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log(`[package-release] commit=${summary.commit} run=${summary.workflowRunId}`)
    console.log(`[package-release] archive=${summary.archive.file} ${summary.archive.human} sha256=${summary.archive.sha256}`)
    console.log(`[package-release] manifest=${summary.manifest.file} files=${summary.manifest.files} symlinks=${summary.manifest.symlinks}`)
    console.log(`[package-release] contentDigest=${summary.manifest.contentDigest}`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[package-release] fatal: ${error?.message || error}`)
    if (error?.detail) console.error(JSON.stringify(error.detail, null, 2))
    process.exit(3)
  })
}
