#!/usr/bin/env node
/**
 * Managed patch: apply the repository's navigation group catalog.
 *
 * Grouping (which page groups become one sidebar section, and in what order) was
 * only expressible by editing the package or writing nav.groupOrder per module.
 * The catalog in src/nav/nav-groups.json now describes it: each entry lists the
 * page-group ids it absorbs, plus the label and order to use.
 *
 * Groups not listed in the catalog are appended unchanged, so a module that ships
 * later still appears without touching this file.
 *
 * Every step is normalised on each run rather than short-circuited after the first
 * injection: a node_modules tree patched by an older revision holds the same marker
 * but a previous contract (for example an extra catalog call inside `groupEntries`
 * that runs before `translate` is in scope). Normalising keeps such a tree on the
 * committed contract instead of silently preserving the older behaviour.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-groups] */'
const DIR = 'node_modules/@open-mercato/core/dist/modules/auth/lib'
const TARGET = `${DIR}/backendChrome.js`
const DATA_SRC = 'src/nav/nav-groups.json'
const DATA_DEST = `${DIR}/nav-groups.generated.json`

const src = path.resolve(process.cwd(), DATA_SRC)
const dest = path.resolve(process.cwd(), DATA_DEST)
const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(src)) {
  console.error(`[patch:nav-groups] data file missing: ${DATA_SRC}`)
  process.exit(1)
}
if (!fs.existsSync(file)) {
  console.error(`[patch:nav-groups] target not found: ${TARGET}`)
  process.exit(1)
}
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)

let source = fs.readFileSync(file, 'utf8')

const ANCHOR = 'async function groupEntries(entries) {'
if (!source.includes(ANCHOR)) {
  console.error('[patch:nav-groups] anchor not found — package changed')
  process.exit(1)
}

const HELPER = `${MARKER}
import __NAV_GROUPS_DATA from "./nav-groups.generated.json" with { type: "json" };
function __applyNavGroupCatalog(groups) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const consumed = new Set();
  const merged = [];
  for (const spec of __NAV_GROUPS_DATA) {
    const items = [];
    for (const member of spec.members ?? []) {
      const group = byId.get(member);
      if (!group) continue;
      consumed.add(member);
      items.push(...(group.items ?? []));
    }
    if (items.length === 0) continue;
    merged.push({
      id: spec.id,
      name: spec.label,
      defaultName: spec.label,
      weight: spec.order,
      items
    });
  }
  for (const group of groups) {
    if (!consumed.has(group.id)) merged.push(group);
  }
  return merged;
}
`

if (!source.includes(MARKER)) {
  source = source.replace(ANCHOR, HELPER + ANCHOR)
}

// Normalise an older/manually patched tree that merged the catalog inside
// `groupEntries` as well. The committed contract applies it once, after sidebar
// preferences (below); the duplicate call runs before `translate` is in scope and
// would silently leave untranslated container labels. No-op when the tree is clean.
const DRIFTED_RETURN = '  return __applyNavGroupCatalog(normalizeGroupWeights(groups));'
if (source.includes(DRIFTED_RETURN)) {
  source = source.replace(DRIFTED_RETURN, '  return normalizeGroupWeights(groups);')
}

// Stored role/user sidebar preferences are built from the old group ids, so the
// catalog has to be applied once more after preferences or the old grouping wins.
const PREFS_ANCHOR = '  const appliedGroups = userPreference ? applySidebarPreference(baseForUser, userPreference) : baseForUser;'
const PATCHED_PREFS = '  const appliedGroups = __applyNavGroupCatalog(userPreference ? applySidebarPreference(baseForUser, userPreference) : baseForUser'
if (source.includes(PREFS_ANCHOR)) {
  source = source.replace(
    PREFS_ANCHOR,
    '  const appliedGroups = __applyNavGroupCatalog(userPreference ? applySidebarPreference(baseForUser, userPreference) : baseForUser);',
  )
} else if (!source.includes(PATCHED_PREFS)) {
  console.error('[patch:nav-groups] preferences anchor not found — package changed')
  process.exit(1)
}

fs.writeFileSync(file, source)

// The nav payload is cached with a version prefix; a stale entry keeps serving the
// old grouping after the catalog changes. Fold a digest of the catalog into the key
// so editing nav-groups.json invalidates it automatically.
const NAV_ROUTE = 'node_modules/@open-mercato/core/dist/modules/auth/api/admin/nav.js'
const navFile = path.resolve(process.cwd(), NAV_ROUTE)
if (fs.existsSync(navFile)) {
  let nav = fs.readFileSync(navFile, 'utf8')
  if (!nav.includes('patched:nav-groups-cache')) {
    const importLine = 'import __NAV_GROUPS_DATA__ from "../../lib/nav-groups.generated.json" with { type: "json" }; /* [patched:nav-groups-cache] */'
    const firstImport = nav.indexOf('import ')
    nav = nav.slice(0, firstImport) + importLine + '\n' + nav.slice(firstImport)
    const anchor = 'const cacheVersion = `v7:${getModuleSurfaceFingerprint()}`;'
    if (!nav.includes(anchor)) {
      console.error('[patch:nav-groups] cacheVersion anchor not found — package changed')
      process.exit(1)
    }
    const digest = 'const __navGroupsDigest = (() => { const raw = JSON.stringify(__NAV_GROUPS_DATA__); let hash = 0; for (let i = 0; i < raw.length; i += 1) { hash = (hash * 31 + raw.charCodeAt(i)) | 0 } return String(hash >>> 0) })();'
    nav = nav.replace(anchor, digest + '\n  const cacheVersion = `v7:${getModuleSurfaceFingerprint()}:nav:${__navGroupsDigest}`;')
    fs.writeFileSync(navFile, nav)
    console.log('[patch:nav-groups] nav cache key now tracks the catalog digest')
  }
}

console.log('[patch:nav-groups] navigation now follows the repository group catalog')
