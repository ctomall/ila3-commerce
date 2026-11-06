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
function assertPatchedBehaviour(tmp, pkgRoot) {
  const chromePath = path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'lib', 'backendChrome.js')
  const source = fs.readFileSync(chromePath, 'utf8')
  const settingsJson = JSON.parse(
    fs.readFileSync(path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'lib', 'settings-sections.generated.json'), 'utf8'),
  )
  const groupsJson = JSON.parse(
    fs.readFileSync(path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'lib', 'nav-groups.generated.json'), 'utf8'),
  )

  const mergeSource = extractFunction(source, '__mergeSettingsSections')
  const catalogSource = extractFunction(source, '__applyNavGroupCatalog')
  if (!mergeSource || !catalogSource) throw new Error('patched helpers not found in backendChrome.js')

  const merge = new Function('__SETTINGS_SECTION_MERGE', `${mergeSource}; return __mergeSettingsSections`)(
    settingsJson,
  )
  const catalog = new Function('__NAV_GROUPS_DATA', `${catalogSource}; return __applyNavGroupCatalog`)(groupsJson)

  const rawSections = Object.keys(settingsJson).map((key) => ({ id: key, labelKey: key, items: [key] }))
  const mergedSections = merge(rawSections)
  const expectedSections = new Set(Object.values(settingsJson).map((spec) => spec.id)).size
  if (mergedSections.length !== expectedSections) {
    throw new Error(`settings merge produced ${mergedSections.length} sections, expected ${expectedSections}`)
  }
  const mergedItems = mergedSections.reduce((total, section) => total + section.items.length, 0)
  if (mergedItems !== rawSections.length) {
    throw new Error(`settings merge lost items: ${mergedItems} of ${rawSections.length}`)
  }
  for (const section of mergedSections) {
    if (!section.label || typeof section.order !== 'number') {
      throw new Error(`settings section ${section.id} missing label or order`)
    }
  }

  const members = groupsJson.flatMap((spec) => spec.members)
  const rawGroups = members.map((id) => ({ id, name: id, weight: 1, items: [id] }))
  const mergedGroups = catalog(rawGroups)
  const mergedGroupItems = mergedGroups.reduce((total, group) => total + group.items.length, 0)
  if (mergedGroups.length !== groupsJson.length) {
    throw new Error(`group catalog produced ${mergedGroups.length} sections, expected ${groupsJson.length}`)
  }
  if (mergedGroupItems !== members.length) {
    throw new Error(`group catalog lost items: ${mergedGroupItems} of ${members.length}`)
  }
  const unknown = catalog([...rawGroups, { id: 'brand_new.group', name: 'new', weight: 1, items: ['x'] }])
  if (unknown[unknown.length - 1].id !== 'brand_new.group') {
    throw new Error('group catalog dropped an unlisted group')
  }

  // Effect assertions for the patches whose markers alone would not catch a
  // half-applied change: an aria-sort edit only on one of the two header paths, a nav
  // cache key without the catalogue digest, or density CSS that never shipped.
  const uiRoot = path.join(pkgRoot, 'ui', 'dist')
  const dataTable = fs.readFileSync(path.join(uiRoot, 'backend', 'DataTable.js'), 'utf8')
  if (!dataTable.includes('[patched:aria-sort]')) throw new Error('aria-sort table marker missing')
  if (!dataTable.includes('[patched:aria-sort-dnd]')) throw new Error('aria-sort dnd marker missing')
  // Two header paths exist: the dnd path forwards `ariaSort` and emits it, the plain
  // path emits it inline. Both must end up with an "aria-sort" prop.
  const sortableSites = (dataTable.match(/"aria-sort":/g) ?? []).length
  if (sortableSites !== 2) throw new Error(`"aria-sort" emitted at ${sortableSites} site(s), expected 2`)
  if (!/SortableHeaderCell\(\{[^}]*ariaSort/.test(dataTable)) {
    throw new Error('SortableHeaderCell does not accept ariaSort')
  }

  const navRoute = fs.readFileSync(path.join(pkgRoot, 'core', 'dist', 'modules', 'auth', 'api', 'admin', 'nav.js'), 'utf8')
  if (!navRoute.includes('patched:nav-groups-cache')) throw new Error('nav cache digest patch missing')
  if (!/__navGroupsDigest/.test(navRoute)) throw new Error('nav cache key does not include the catalogue digest')

  const appCssPath = path.join(root, 'src', 'app', 'globals.css')
  const appCss = fs.readFileSync(appCssPath, 'utf8')
  if (!/table td\.py-2[\s\S]{0,80}padding-block:\s*4px/.test(appCss)) {
    throw new Error('table density CSS missing (padding-block: 4px on py-2 cells)')
  }

  const appShell = fs.readFileSync(path.join(uiRoot, 'backend', 'AppShell.js'), 'utf8')
  for (const marker of ['patched:sidebar-footer-injected', 'patched:sidebar-active-group', 'patched:nav-aria']) {
    if (!appShell.includes(marker)) throw new Error(`AppShell marker missing: ${marker}`)
  }

  console.log('[repro] effects OK — aria-sort on 2 header paths, nav cache digest, density CSS, AppShell markers')

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
  assertPatchedBehaviour(tmp, pkgRoot)
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
