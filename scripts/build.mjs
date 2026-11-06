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

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}
const info = {
  version: String(pkg.version ?? ''),
  commit: git(['rev-parse', '--short=8', 'HEAD']),
  builtAt: new Date().toISOString(),
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
process.exit(result.status ?? 1)
