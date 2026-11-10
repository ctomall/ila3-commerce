#!/usr/bin/env node
/**
 * Merge Chinese translation batches into src/i18n/zh.json.
 *
 * Layout (all inside the project):
 *   scripts/i18n-zh/batches/NN.txt      id<TAB>English source value
 *   scripts/i18n-zh/batches/NN.zh.txt   id|Chinese translation
 *
 * The English values are not keyed: every dictionary entry in the app or in any
 * @open-mercato module whose value equals the English source gets the Chinese
 * translation. That keeps the batches short while still covering duplicates.
 *
 * Usage: node scripts/i18n-zh/merge.mjs [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const batchDir = path.join(here, 'batches')
const zhPath = path.join(root, 'src/i18n/zh.json')
const dry = process.argv.includes('--dry')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name === 'en.json' && full.includes(`${path.sep}i18n${path.sep}`)) out.push(full)
  }
  return out
}

/** value -> Set(keys) for every English dictionary the app can load. */
function buildValueIndex() {
  const index = new Map()
  const add = (dict) => {
    if (!dict || typeof dict !== 'object') return
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value !== 'string') continue
      const value2 = value.trim()
      if (!index.has(value2)) index.set(value2, new Set())
      index.get(value2).add(key)
    }
  }

  add(readJson(path.join(root, 'src/i18n/en.json')))

  const base = path.join(root, 'node_modules/@open-mercato')
  const dirs = fs.existsSync(base)
    ? fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(base, d.name))
    : []
  let files = 0
  for (const pkg of dirs) {
    for (const file of walk(pkg)) {
      try {
        add(readJson(file))
        files += 1
      } catch {
        /* ignore unreadable dictionaries */
      }
    }
  }
  return { index, files }
}

function readBatches() {
  if (!fs.existsSync(batchDir)) return []
  const sources = fs
    .readdirSync(batchDir)
    .filter((f) => /^\d+\.txt$/.test(f))
    .sort()
  const result = []
  for (const file of sources) {
    const id = file.replace(/\.txt$/, '')
    const sourcePath = path.join(batchDir, file)
    const zhFile = path.join(batchDir, `${id}.zh.txt`)
    if (!fs.existsSync(zhFile)) continue
    const values = new Map()
    for (const rawLine of fs.readFileSync(sourcePath, 'utf8').split('\n')) {
      const line = rawLine.replace(/\r+$/, '')
      if (!line.trim()) continue
      const tab = line.indexOf('\t')
      if (tab < 0) continue
      values.set(line.slice(0, tab), line.slice(tab + 1))
    }
    const translations = new Map()
    for (const rawLine of fs.readFileSync(zhFile, 'utf8').split('\n')) {
      const line = rawLine.replace(/\r+$/, '')
      if (!line.trim()) continue
      const sep = line.indexOf('|')
      if (sep < 0) continue
      translations.set(line.slice(0, sep), line.slice(sep + 1))
    }
    result.push({ id, values, translations })
  }
  return result
}

const zh = fs.existsSync(zhPath) ? readJson(zhPath) : {}
const before = Object.keys(zh).length
const { index, files } = buildValueIndex()
const batches = readBatches()

let added = 0
let updated = 0
let unmatched = 0
for (const batch of batches) {
  for (const [id, translation] of batch.translations) {
    const value = batch.values.get(id)
    if (value === undefined || !translation) continue
    const keys = index.get(value.trim())
    if (!keys || keys.size === 0) {
      unmatched += 1
      continue
    }
    for (const key of keys) {
      if (zh[key] === translation) continue
      if (zh[key] === undefined) added += 1
      else updated += 1
      zh[key] = translation
    }
  }
}

// Curated per-key overrides win over value-based batches (nav group names etc.).
const overridesPath = path.join(here, 'overrides.json')
if (fs.existsSync(overridesPath)) {
  const overrides = readJson(overridesPath)
  let applied = 0
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'string') continue
    if (zh[key] !== value) {
      zh[key] = value
      applied += 1
    }
  }
  console.log(`overrides applied: ${applied}`)
}

const sorted = {}
for (const key of Object.keys(zh).sort()) sorted[key] = zh[key]

const summary = {
  batches: batches.map((b) => `${b.id}: ${b.translations.size}/${b.values.size}`),
  dictionaries: files,
  keysBefore: before,
  keysAfter: Object.keys(sorted).length,
  added,
  updated,
  unmatchedValues: unmatched,
}
console.log(JSON.stringify(summary, null, 2))

if (!dry) {
  fs.writeFileSync(zhPath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
  console.log(`written ${path.relative(root, zhPath)}`)
}
