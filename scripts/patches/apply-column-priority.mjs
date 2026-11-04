#!/usr/bin/env node
/**
 * Managed patch: tighten the default column sets of the customers lists (T9).
 *
 * companies opened with ~10 columns and deals with 16, overflowing at 1280px and
 * burying the columns people actually scan. Priority applied:
 *   primary   the few columns you triage on
 *   optional  everything else, still available via "Customize columns"
 *
 * Hidden columns are demoted, never removed. Both pages are handled
 * independently, so one being already patched cannot short-circuit the other.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:column-priority] */'
const COMPANIES = 'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/companies/page.js'
const DEALS = 'node_modules/@open-mercato/core/dist/modules/customers/backend/customers/deals/page.js'

const COMPANIES_DEMOTE = ['email', 'nextInteractionAt', 'source']
const COMPANIES_KEEP_CUSTOM = ['relationship_health']
const DEALS_DEMOTE = ['pipelineStage', 'pipelineId', 'probability', 'ownerUserId', 'companies', 'people', 'updatedAt']

function demote(source, keys) {
  let out = source
  for (const key of keys) {
    const anchor = `accessorKey: "${key}",`
    if (!out.includes(anchor)) throw new Error(`anchor not found: ${anchor}`)
    const anchorIndex = out.indexOf(anchor)
    const metaIndex = out.indexOf('meta: {', anchorIndex)
    if (metaIndex === -1 || metaIndex - anchorIndex > 500) throw new Error(`meta block not found for ${key}`)
    const insertAt = metaIndex + 'meta: {'.length
    out = out.slice(0, insertAt) + ` hidden: true, ${MARKER}` + out.slice(insertAt)
  }
  return out
}

function patchFile(relative, mutate) {
  const file = path.resolve(process.cwd(), relative)
  if (!fs.existsSync(file)) {
    console.log(`[patch:column-priority] ${path.basename(path.dirname(relative))}/page.js not found, skipped`)
    return
  }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) {
    console.log(`[patch:column-priority] ${path.basename(path.dirname(relative))} already applied`)
    return
  }
  fs.writeFileSync(file, mutate(source))
  console.log(`[patch:column-priority] patched ${path.basename(path.dirname(relative))}/page.js`)
}

patchFile(COMPANIES, (source) => {
  let out = demote(source, COMPANIES_DEMOTE)
  const customOld = 'hidden: def.listVisible === false,'
  if (!out.includes(customOld)) throw new Error('companies custom column anchor not found')
  out = out.replace(
    customOld,
    `hidden: def.listVisible === false || ![${COMPANIES_KEEP_CUSTOM.map((k) => `"${k}"`).join(', ')}].includes(def.key), ${MARKER}`,
  )
  return out
})

patchFile(DEALS, (source) => {
  let out = demote(source, DEALS_DEMOTE)
  const customOld = 'hidden: def.listVisible === false,'
  if (!out.includes(customOld)) throw new Error('deals custom column anchor not found')
  out = out.replace(customOld, `hidden: true, ${MARKER}`)
  return out
})
