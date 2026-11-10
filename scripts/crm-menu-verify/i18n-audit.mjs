#!/usr/bin/env node
/**
 * Static three-layer localization audit for the account menu and the
 * communication-channels profile page.
 *
 * Layers checked
 *   1. @open-mercato/core dist/src built-in translations
 *      (`<core-src>/modules/<module>/i18n/<locale>.json`)
 *   2. @open-mercato/ui built-in translations (`<ui-src>` — the package ships no
 *      i18n JSON at all, so this layer is reported as `none`)
 *   3. the application override (`<app-i18n>/<locale>.json`, flat dotted keys)
 *
 * For every `t('key', 'default')` call site in the audited sources the script
 * records whether the key exists in each layer and classifies the gap:
 *
 *   covered-zh              app zh.json has the key
 *   missing-app-zh          built-in en (or the code default) would render English
 *                           in a zh session because the app zh override is absent
 *   missing-builtin-and-app no built-in translation and no app override at all
 *
 * Read-only: no server, no browser, no node_modules writes.
 *
 * Usage
 *   node scripts/crm-menu-verify/i18n-audit.mjs \
 *     --core-src /home/pro/releases/mercato/current/node_modules/@open-mercato/core/src \
 *     --ui-src   /home/pro/releases/mercato/current/node_modules/@open-mercato/ui/src \
 *     --app-i18n /data/crm/worktrees/closure-locale/src/i18n \
 *     --out /storage/artifacts/.../i18n-audit.json
 *
 * Exit codes: 0 audit completed (gaps are reported, not failures),
 *             2 infrastructure error (missing paths / unreadable input).
 */
import fs from 'node:fs'
import path from 'node:path'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const CORE_SRC = path.resolve(arg('--core-src', 'node_modules/@open-mercato/core/src'))
const UI_SRC = path.resolve(arg('--ui-src', 'node_modules/@open-mercato/ui/src'))
const APP_I18N = path.resolve(arg('--app-i18n', 'src/i18n'))
const OUT = arg('--out', '')

const SURFACES = [
  {
    id: 'account-menu',
    title: 'Account menu (header profile dropdown)',
    module: 'auth',
    sources: [path.join(UI_SRC, 'backend/ProfileDropdown.tsx')],
  },
  {
    id: 'change-password',
    title: 'Change Password page (/backend/profile/change-password)',
    module: 'auth',
    sources: [path.join(CORE_SRC, 'modules/auth/backend/profile/change-password/page.tsx')],
  },
  {
    id: 'communication-channels',
    title: 'Communication channels page (/backend/profile/communication-channels)',
    module: 'communication_channels',
    sources: [
      path.join(CORE_SRC, 'modules/communication_channels/backend/profile/communication-channels/page.tsx'),
      path.join(CORE_SRC, 'modules/communication_channels/backend/profile/communication-channels/ConnectChannelMenu.tsx'),
    ],
  },
]

function fail(message) {
  console.error(`[i18n-audit] ${message}`)
  process.exit(2)
}

if (!fs.existsSync(CORE_SRC)) fail(`missing --core-src ${CORE_SRC}`)
if (!fs.existsSync(UI_SRC)) fail(`missing --ui-src ${UI_SRC}`)
if (!fs.existsSync(APP_I18N)) fail(`missing --app-i18n ${APP_I18N}`)

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Build key -> module index from every module's built-in locale file. */
function builtinIndex(locale) {
  const index = new Map()
  const modulesDir = path.join(CORE_SRC, 'modules')
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(modulesDir, entry.name, 'i18n', `${locale}.json`)
    if (!fs.existsSync(file)) continue
    const data = readJson(file)
    if (!data) continue
    for (const key of Object.keys(data)) index.set(key, { module: entry.name, value: data[key] })
  }
  return index
}

/** Parse literal `t('key', 'default')` calls; tolerant of whitespace and escaped quotes. */
function parseTCalls(source) {
  const calls = []
  // JSX text contains bare apostrophes ("you're"), so a global quote-aware scanner
  // swallows call sites. Match the call shape directly instead.
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*(?:,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3)?/g
  let match
  while ((match = re.exec(source)) !== null) {
    calls.push({ key: match[2], def: match[4] ?? null })
  }
  return calls
}

const builtinEn = builtinIndex('en')
const builtinZh = builtinIndex('zh')
const appZh = readJson(path.join(APP_I18N, 'zh.json')) ?? {}
const appEn = readJson(path.join(APP_I18N, 'en.json')) ?? {}

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  layers: {
    coreSrc: CORE_SRC,
    uiSrc: UI_SRC,
    appI18n: APP_I18N,
    builtinLocales: {
      en: builtinEn.size,
      zh: builtinZh.size,
    },
    uiBuiltinLocales: (() => {
      const found = []
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(file)
          else if (entry.isFile() && entry.name.endsWith('.json') && path.basename(path.dirname(file)) === 'i18n') found.push(file)
        }
      }
      try {
        walk(UI_SRC)
      } catch {
        /* UI source tree may be absent in some installs */
      }
      return found
    })(),
  },
  surfaces: [],
  summary: {},
}

function classify(key) {
  const inAppZh = Object.prototype.hasOwnProperty.call(appZh, key)
  const inAppEn = Object.prototype.hasOwnProperty.call(appEn, key)
  const inBuiltinEn = builtinEn.has(key)
  const inBuiltinZh = builtinZh.has(key)
  if (inAppZh) return 'covered-zh'
  if (inBuiltinEn || inAppEn) return 'missing-app-zh'
  return 'missing-builtin-and-app'
}

const allKeys = new Map()

for (const surface of SURFACES) {
  const keys = []
  const seen = new Set()
  for (const file of surface.sources) {
    if (!fs.existsSync(file)) {
      keys.push({ key: `(missing source ${path.basename(file)})`, def: null, source: file, missingSource: true })
      continue
    }
    const calls = parseTCalls(fs.readFileSync(file, 'utf8'))
    for (const call of calls) {
      if (seen.has(call.key)) continue
      seen.add(call.key)
      const entry = {
        key: call.key,
        default: call.def,
        source: path.relative(CORE_SRC, file).startsWith('..') ? path.basename(file) : path.relative(CORE_SRC, file),
        builtinEn: builtinEn.has(call.key),
        builtinEnModule: builtinEn.get(call.key)?.module ?? null,
        builtinEnValue: builtinEn.get(call.key)?.value ?? null,
        builtinZh: builtinZh.has(call.key),
        appZh: Object.prototype.hasOwnProperty.call(appZh, call.key),
        appZhValue: Object.prototype.hasOwnProperty.call(appZh, call.key) ? appZh[call.key] : null,
        appEn: Object.prototype.hasOwnProperty.call(appEn, call.key),
        classification: classify(call.key),
      }
      keys.push(entry)
      allKeys.set(call.key, { ...entry, surface: surface.id })
    }
  }
  const counts = keys.reduce((acc, entry) => {
    acc[entry.classification] = (acc[entry.classification] ?? 0) + 1
    return acc
  }, {})
  result.surfaces.push({ ...surface, keys, counts })
}

result.summary = {
  totalKeys: allKeys.size,
  byClassification: [...allKeys.values()].reduce((acc, entry) => {
    acc[entry.classification] = (acc[entry.classification] ?? 0) + 1
    return acc
  }, {}),
  missingAppZh: [...allKeys.values()].filter((entry) => entry.classification !== 'covered-zh').map((entry) => entry.key),
  // Keys rendered in a zh session as English because the app zh override is absent.
  englishLeaks: [...allKeys.values()]
    .filter((entry) => entry.classification === 'missing-app-zh')
    .map((entry) => ({ key: entry.key, builtinEn: entry.builtinEnValue, default: entry.default, surface: entry.surface })),
}

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2))
  console.log(`[i18n-audit] wrote ${OUT}`)
}

console.log(`[i18n-audit] core builtin en=${builtinEn.size} zh=${builtinZh.size}; ui builtin files=${result.layers.uiBuiltinLocales.length}`)
for (const surface of result.surfaces) {
  console.log(`[i18n-audit] ${surface.id}: ${JSON.stringify(surface.counts)}`)
}
console.log(`[i18n-audit] english leaks in zh: ${result.summary.englishLeaks.length}`)
for (const leak of result.summary.englishLeaks.slice(0, 40)) {
  console.log(`  - ${leak.key} => ${JSON.stringify(leak.builtinEn ?? leak.default)}`)
}
process.exit(0)
