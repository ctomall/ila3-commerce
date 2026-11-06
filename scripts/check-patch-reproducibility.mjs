#!/usr/bin/env node
/**
 * Reproducibility check for the managed patch pipeline.
 *
 * The patches rewrite files inside @open-mercato packages, so they must be able to
 * apply to a *pristine* package, not only to a tree that already carries output from
 * an older patch. That mistake shipped twice: an inline literal that only a previous
 * patch created, and a footer block that only a previous patch created.
 *
 * This script extracts the exact installed versions from the registry tarballs into a
 * temporary directory, copies scripts/ and the src data the patches read, and runs
 * `verify-patches --apply` there. It never touches the working node_modules.
 *
 * Usage: node scripts/check-patch-reproducibility.mjs [--keep]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-repro-'))
const PACKAGES = ['ui', 'core', 'shared']

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })

try {
  console.log(`[repro] workspace: ${tmp}`)
  run('npm', ['pack', '--silent', ...PACKAGES.map((name) => `@open-mercato/${name}@0.9.0`)], { cwd: tmp, stdio: ['ignore', 'ignore', 'pipe'] })
  const pkgRoot = path.join(tmp, 'node_modules', '@open-mercato')
  for (const name of PACKAGES) {
    const target = path.join(pkgRoot, name)
    fs.mkdirSync(target, { recursive: true })
    run('tar', ['xzf', path.join(tmp, `open-mercato-${name}-0.9.0.tgz`), '-C', target, '--strip-components=1'])
  }
  for (const entry of fs.readdirSync(path.join(root, 'scripts'))) {
    fs.cpSync(path.join(root, 'scripts', entry), path.join(tmp, 'scripts', entry), { recursive: true })
  }
  fs.cpSync(path.join(root, 'src', 'nav'), path.join(tmp, 'src', 'nav'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'src', 'lib'), { recursive: true })
  for (const file of ['custom-field-zh.ts']) {
    const from = path.join(root, 'src', 'lib', file)
    if (fs.existsSync(from)) fs.cpSync(from, path.join(tmp, 'src', 'lib', file))
  }

  const appShell = path.join(pkgRoot, 'ui', 'dist', 'backend', 'AppShell.js')
  if (fs.readFileSync(appShell, 'utf8').includes('patched:')) {
    throw new Error('extracted package is not pristine — aborting')
  }

  const output = run('node', ['scripts/verify-patches.mjs', '--apply'], { cwd: tmp })
  const tail = output.trim().split('\n').slice(-3).join('\n')
  const ok = /all \d+ patch\(es\) present/.test(output)
  console.log(tail)
  if (!ok) throw new Error('patches did not apply cleanly to a pristine package')
  console.log('[repro] OK — every managed patch applies to unpatched packages')
} catch (error) {
  console.error(`[repro] FAILED: ${error.message}`)
  if (error.stdout) console.error(String(error.stdout).trim().split('\n').slice(-5).join('\n'))
  if (error.stderr) console.error(String(error.stderr).trim().split('\n').slice(-5).join('\n'))
  process.exitCode = 1
} finally {
  if (!process.argv.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true })
  else console.log(`[repro] kept ${tmp}`)
}
