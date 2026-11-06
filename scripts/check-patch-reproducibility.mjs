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
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-repro-'))
const PACKAGES = ['ui', 'core', 'shared']


/** Extract a top-level `function name(...) { ... }` body from patched output. */
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  if (start === -1) return null
  let depth = 0
  let i = source.indexOf('{', start)
  const bodyStart = i
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return source.slice(start, bodyStart) + '/* unbalanced */'
}

/**
 * Behavioural assertions on the patched output.
 *
 * The markers only prove text was inserted. These run the two helpers the patches
 * install, with synthetic input, and check the contract the app relies on: 15
 * settings partitions collapse to 8 sections, 23 page groups collapse to 7, and no
 * entry is lost.
 */
async function assertPatchedBehaviour(tmp, pkgRoot) {
  const libDir = path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'lib')
  const chrome = fs.readFileSync(path.join(libDir, 'backendChrome.js'), 'utf8')
  if (!chrome.includes('patched:nav-logic')) throw new Error('nav-logic delegation missing in backendChrome.js')
  if (!/__mergeSettingsImpl\(groups, __SETTINGS_SECTION_MERGE\)/.test(chrome)) {
    throw new Error('merge helper is not delegating to the shared implementation')
  }
  if (!/__applyGroupCatalogImpl\(groups, __NAV_GROUPS_DATA\)/.test(chrome)) {
    throw new Error('catalogue helper is not delegating to the shared implementation')
  }

  const settingsJson = JSON.parse(fs.readFileSync(path.join(libDir, 'settings-sections.generated.json'), 'utf8'))
  const groupsJson = JSON.parse(fs.readFileSync(path.join(libDir, 'nav-groups.generated.json'), 'utf8'))
  const logicPath = path.join(libDir, 'nav-logic.generated.mjs')
  if (!fs.existsSync(logicPath)) throw new Error('nav-logic.generated.mjs was not copied into the package')
  const { mergeSettingsSections, applyGroupCatalog } = await import(pathToFileURL(logicPath).href)

  const rawSections = Object.keys(settingsJson).map((key) => ({ id: key, labelKey: key, items: [key] }))
  const mergedSections = mergeSettingsSections(rawSections, settingsJson)
  const expectedSections = new Set(Object.values(settingsJson).map((spec) => spec.id)).size
  if (mergedSections.length !== expectedSections) {
    throw new Error(`settings merge produced ${mergedSections.length} sections, expected ${expectedSections}`)
  }
  const mergedItems = mergedSections.reduce((total, section) => total + section.items.length, 0)
  if (mergedItems !== rawSections.length) {
    throw new Error(`settings merge lost items: ${mergedItems} of ${rawSections.length}`)
  }
  for (let i = 1; i < mergedSections.length; i += 1) {
    if ((mergedSections[i - 1].order ?? 0) > (mergedSections[i].order ?? 0)) {
      throw new Error('settings sections are not ordered')
    }
  }
  for (const section of mergedSections) {
    if (!section.label || typeof section.order !== 'number') {
      throw new Error(`settings section ${section.id} missing label or order`)
    }
  }

  const members = groupsJson.flatMap((spec) => spec.members)
  const rawGroups = members.map((id) => ({ id, name: id, weight: 1, items: [id] }))
  const mergedGroups = applyGroupCatalog(rawGroups, groupsJson)
  const mergedGroupItems = mergedGroups.reduce((total, group) => total + group.items.length, 0)
  if (mergedGroups.length !== groupsJson.length) {
    throw new Error(`group catalog produced ${mergedGroups.length} sections, expected ${groupsJson.length}`)
  }
  if (mergedGroupItems !== members.length) {
    throw new Error(`group catalog lost items: ${mergedGroupItems} of ${members.length}`)
  }
  const unknown = applyGroupCatalog([...rawGroups, { id: 'brand_new.group', name: 'new', weight: 1, items: ['x'] }], groupsJson)
  if (unknown[unknown.length - 1].id !== 'brand_new.group') {
    throw new Error('group catalog dropped an unlisted group')
  }

  // Effect assertions: markers alone cannot catch a half-applied change such as
  // aria-sort wired into one header path only.
  const uiRoot2 = path.join(pkgRoot, 'ui', 'dist')
  // DataTable is no longer patched: aria-sort, the empty-state illustration and the
  // error art ship from its source build (packages/ui/src/backend/DataTable.tsx), so a
  // pristine package must NOT carry the old dist markers. The built file in the app is
  // asserted separately by scripts/ui-regression.mjs.
  const dataTable2 = fs.readFileSync(path.join(uiRoot2, 'backend', 'DataTable.js'), 'utf8')
  if (dataTable2.includes('[patched:aria-sort]')) {
    throw new Error('DataTable still carries the aria-sort dist patch; it should come from the source build')
  }

  const navRoute2 = fs.readFileSync(path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'api', 'admin', 'nav.js'), 'utf8')
  if (!navRoute2.includes('__navGroupsDigest')) throw new Error('nav cache key does not include the catalogue digest')

  const appCss2 = fs.readFileSync(path.join(root, 'src', 'app', 'globals.css'), 'utf8')
  if (!/table td\.py-2[\s\S]{0,80}padding-block:\s*4px/.test(appCss2)) {
    throw new Error('table density CSS missing')
  }

  const appShell2 = fs.readFileSync(path.join(uiRoot2, 'backend', 'AppShell.js'), 'utf8')
  for (const marker of ['patched:sidebar-footer-injected', 'patched:sidebar-active-group', 'patched:nav-aria']) {
    if (!appShell2.includes(marker)) throw new Error(`AppShell marker missing: ${marker}`)
  }
  // Markers and behaviour are not enough: an insert can land inside a multi-line import
  // and still satisfy every assertion. Parse the patched files the build must consume.
  for (const relative of [
    'core/dist/modules/auth/lib/backendChrome.js',
    'core/dist/modules/auth/api/admin/nav.js',
    'ui/dist/backend/AppShell.js',
    'ui/dist/backend/DataTable.js',
  ]) {
    const target = path.join(pkgRoot, relative)
    if (!fs.existsSync(target)) throw new Error(`patched file missing: ${relative}`)
    try {
      execFileSync(process.execPath, ['--check', target], { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      const detail = String(error.stderr || error.message).split('\n').slice(0, 3).join(' ')
      throw new Error(`patched file does not parse: ${relative} — ${detail}`)
    }
  }
  console.log('[repro] syntax OK — patched files parse')

  console.log('[repro] effects OK — DataTable ships from the vendored source build, nav cache digest, density CSS, AppShell markers')

  console.log(
    `[repro] behaviour OK — ${rawSections.length} partitions -> ${mergedSections.length} sections, ` +
      `${members.length} groups -> ${mergedGroups.length} sections, unlisted groups preserved`,
  )
}

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
  // The DataTable build output is vendored, so a pristine run must carry it too.
  if (fs.existsSync(path.join(root, 'vendor'))) {
    fs.cpSync(path.join(root, 'vendor'), path.join(tmp, 'vendor'), { recursive: true })
  }
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
  await assertPatchedBehaviour(tmp, pkgRoot)
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
