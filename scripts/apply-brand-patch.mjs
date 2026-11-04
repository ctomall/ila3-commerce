#!/usr/bin/env node
/**
 * Idempotent brand patch for the upstream login page.
 *
 * `@open-mercato/core` hardcodes the login logo asset path:
 *   src: "/open-mercato.svg"
 * The product brand must not appear in shipped markup, so we rewrite that path
 * to /brand.svg. Everything else in that file is left untouched.
 *
 * Why a patch instead of an override: the login page ships prebuilt inside the
 * package (dist/modules/auth/frontend/login.js) and is not an app-owned route,
 * so there is no supported extension point for the asset path.
 *
 * Run before `yarn build`; it is safe to run repeatedly and after a reinstall.
 * NOTE: the CLI command names in that package (e.g. `mercato wms ...`) are real
 * commands and are deliberately NOT rewritten.
 */
import fs from 'node:fs'
import path from 'node:path'

const candidates = [
  'node_modules/@open-mercato/core/dist/modules/auth/frontend/login.js',
  'node_modules/@open-mercato/core/src/modules/auth/frontend/login.tsx',
]

const from = '"/open-mercato.svg"'
const to = '"/brand.svg"'
let patched = 0
let already = 0
let missing = 0

for (const candidate of candidates) {
  const file = path.resolve(process.cwd(), candidate)
  if (!fs.existsSync(file)) {
    missing++
    continue
  }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(to)) {
    already++
    continue
  }
  if (!source.includes(from)) {
    missing++
    continue
  }
  fs.writeFileSync(file, source.split(from).join(to))
  patched++
  console.log(`[brand-patch] patched ${candidate}`)
}

console.log(`[brand-patch] done: patched=${patched} already=${already} skipped=${missing}`)
