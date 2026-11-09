#!/usr/bin/env node
/**
 * Build wrapper that stamps the version of the build being produced.
 *
 * The upgrade page used to read package.json from the working tree, so right after a
 * release it advertised a version that was not running yet. This wrapper records
 * { version, commit, builtAt } into .mercato/build-info.json — which travels with the
 * build directory through the upgrade swap — and exposes the same values to the bundle.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// A digest of every runtime-relevant file's CONTENT. mtime is not evidence: a file can be
// edited and its mtime rolled back, and a tool that rewrites identical content bumps it.
// The stamp records this digest at build time; the freshness gate recomputes and compares.
const TREE_RUNTIME_PATTERNS = [/^src\//, /^vendor\//, /^package\.json$/, /^tsconfig(\..*)?\.json$/, /^next\.config\./, /^postcss\.config\./]
const RUNTIME_ROOT_FILES = ['package.json', 'tsconfig.json', 'next.config.mjs', 'next.config.ts', 'postcss.config.mjs', 'postcss.config.js']
function isRuntimeFile(rel) {
  return TREE_RUNTIME_PATTERNS.some((re) => re.test(rel)) && !/__tests__\//.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel)
}
function runtimeTreeDigest(root) {
  const files = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.mercato', '.git', '.next'].includes(entry.name)) continue
        walk(full)
        continue
      }
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (isRuntimeFile(rel)) files.push(rel)
    }
  }
  for (const dir of ['src', 'vendor']) if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir))
  for (const file of RUNTIME_ROOT_FILES) {
    const full = path.join(root, file)
    if (fs.existsSync(full) && isRuntimeFile(file)) files.push(file)
  }
  files.sort()
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(`${file}:${createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}\n`)
  }
  return { digest: hash.digest('hex'), count: files.length }
}

const info = {
  version: String(pkg.version ?? ''),
  commit: git(['rev-parse', '--short=8', 'HEAD']),
  builtAt: new Date().toISOString(),
  // Written before the build so other tools can see progress, but a reader must check
  // this: a failed build used to leave a stamp that looked like a successful one, and the
  // freshness gate then reported "the build is current" next to an old dist directory.
  status: 'building',
  treeDigest: runtimeTreeDigest(root).digest,
}

const distDir = process.env.OM_DIST_DIR?.trim() || '.mercato/next'
const target = path.join(root, distDir === '.mercato/next' ? '.mercato' : path.dirname(distDir), 'build-info.json')
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `${JSON.stringify(info, null, 2)}\n`)
console.log(`[build] stamping ${info.version} (${info.commit}) -> ${path.relative(root, target)}`)

const result = spawnSync('yarn', ['run', 'build:inner'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_BUILD_VERSION: info.version,
    NEXT_PUBLIC_BUILD_SHA: info.commit,
  },
})
if (result.status === 0) {
  info.status = 'ok'
  fs.writeFileSync(target, `${JSON.stringify(info, null, 2)}\n`)
} else {
  info.status = 'failed'
  fs.writeFileSync(target, `${JSON.stringify(info, null, 2)}\n`)
  console.error('[build] FAILED — the stamp is marked status:"failed" so the freshness gate refuses it')
}
process.exit(result.status ?? 1)
