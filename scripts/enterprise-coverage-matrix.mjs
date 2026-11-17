#!/usr/bin/env node
/**
 * Merge the inventory with every executed sweep into one traceable coverage
 * matrix: page -> class -> render evidence -> API contract references.
 *
 * Evidence sources (all read-only):
 *   - .ai/analysis/enterprise-inventory-baseline.json     declared pages/APIs
 *   - .ai/analysis/enterprise-page-render-findings.json   authorized-nav sweep
 *   - .ai/analysis/enterprise-dynamic-page-audit-after.json  placeholder routes
 *   - .ai/analysis/enterprise-public-page-audit.json      public/portal/pay
 *
 * A route with no matching evidence is listed as a gap with its reason, so the
 * next slice has a concrete, ordered target list instead of a feeling.
 *
 * Usage: node scripts/enterprise-coverage-matrix.mjs [--out .ai/analysis/enterprise-coverage-matrix.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const OUT_JSON = path.resolve(argOf('--out', path.join(repo, '.ai/analysis/enterprise-coverage-matrix.json')))
const OUT_MD = path.resolve(argOf('--out-md', path.join(repo, '.ai/analysis/enterprise-coverage-matrix.md')))
const sources = {
  baseline: path.join(repo, '.ai/analysis/enterprise-inventory-baseline.json'),
  static: path.join(repo, '.ai/analysis/enterprise-static-page-audit.json'),
  staticFindings: path.join(repo, '.ai/analysis/enterprise-page-render-findings.json'),
  dynamic: path.join(repo, '.ai/analysis/enterprise-dynamic-page-audit-after.json'),
  public: path.join(repo, '.ai/analysis/enterprise-public-page-audit.json'),
  direct: path.join(repo, '.ai/analysis/enterprise-direct-page-audit.json'),
}

const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)
const normalize = (route) =>
  String(route ?? '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '')
    .replace(/\/$/, '') || '/'

const baseline = read(sources.baseline)
if (!baseline) throw new Error('inventory baseline missing')

const staticSweep = read(sources.static)?.results ?? []
const staticFindings = staticSweep.length > 0 ? staticSweep : (read(sources.staticFindings)?.findings ?? [])
const dynamicResults = read(sources.dynamic)?.results ?? []
const publicResults = read(sources.public)?.results ?? []
const directResults = read(sources.direct)?.results ?? []

const staticByRoute = new Map(staticFindings.map((entry) => [normalize(entry.route), entry]))
const dynamicByRoute = new Map(dynamicResults.map((entry) => [normalize(entry.route), entry]))
const publicByRoute = new Map(publicResults.map((entry) => [normalize(entry.route), entry]))
const directByRoute = new Map(directResults.map((entry) => [normalize(entry.route), entry]))

function classify(route) {
  if (!route.startsWith('/backend')) {
    if (route.startsWith('/pay')) return 'frontend-pay'
    if (route.includes('/portal')) return 'frontend-portal'
    if (['/login', '/reset', '/terms', '/privacy', '/start', '/docs/api', '/onboarding', '/checkout-demo'].some((prefix) => route.startsWith(prefix))) return 'frontend-public'
    return 'frontend-other'
  }
  if (/^\/backend\/config(\/|$)/.test(route)) return 'backend-settings'
  if (/^\/backend\/auth(\/|$)/.test(route)) return 'backend-profile'
  if (/\/create$|\/edit$/.test(route)) return 'backend-create-edit'
  if (/\[[^\]]+\]/.test(route)) return 'backend-detail-dynamic'
  return 'backend-business'
}

function evidenceFor(page) {
  const route = normalize(page.route)
  const hasPlaceholder = /\[[^\]]+\]/.test(route)
  if (!route.startsWith('/backend')) {
    const hit = publicByRoute.get(route)
    if (!hit) return { status: 'gap', reason: 'no public-sweep entry' }
    const verdict = hit.verdict
    // A single interrupted navigation is an observation, not proof of a page
    // defect: /docs/api renders at one viewport and redirects to /login at
    // another, which is an access inconsistency to confirm, not a crash.
    if (verdict === 'navigation-failure') return { status: 'observation', kind: verdict, source: 'public-audit' }
    return { status: verdict === 'crashed' ? 'defect' : 'evidenced', kind: verdict, source: 'public-audit' }
  }
  if (hasPlaceholder) {
    const hit = dynamicByRoute.get(route)
    const directHit = directByRoute.get(route)
    const effective = hit ?? directHit
    if (!effective) return { status: 'gap', reason: 'dynamic route not requireAuth or not swept' }
    if (!hit) {
      return {
        status: effective.verdict === 'crashed' ? 'defect' : 'evidenced',
        kind: effective.verdict,
        source: 'direct-sweep',
      }
    }
    return {
      status: hit.verdict === 'crashed' ? 'defect' : 'evidenced',
      kind: hit.verdict,
      idSource: hit.idSource,
      source: 'dynamic-audit',
    }
  }
  const hit = staticByRoute.get(route) ?? directByRoute.get(route)
  if (hit) {
    const verdict = hit.verdict ?? (hit.failure ? 'navigation-failure' : 'rendered')
    return {
      status: verdict === 'crashed' || verdict === 'navigation-failure' ? 'defect' : 'evidenced',
      kind: verdict,
      source: hit.label ? 'nav-sweep' : 'direct-sweep',
    }
  }
  return { status: 'gap', reason: 'not an authorized navigation destination (navHidden/create/edit/profile detail)' }
}

const rows = (baseline.pages ?? []).map((page) => {
  const route = normalize(page.route)
  const evidence = evidenceFor(page)
  const apiRefs = Array.isArray(page.apiMapping?.references) ? page.apiMapping.references : []
  return {
    route,
    className: classify(route),
    moduleId: page.moduleId,
    requireAuth: page.declared?.requireAuth ?? null,
    navHidden: page.declared?.navHidden ?? null,
    apiReferences: apiRefs.length,
    apiStatus: page.apiMapping?.status ?? null,
    evidence,
    metadataStatus: page.metadataStatus ?? null,
    apiMappingStatus: page.apiMapping?.status ?? null,
  }
})

const byClass = {}
for (const row of rows) {
  const bucket = (byClass[row.className] ??= { total: 0, evidenced: 0, defect: 0, observation: 0, gap: 0, kinds: {} })
  bucket.total += 1
  bucket[row.evidence.status] += 1
  if (row.evidence.kind) bucket.kinds[row.evidence.kind] = (bucket.kinds[row.evidence.kind] ?? 0) + 1
}

const gaps = rows.filter((row) => row.evidence.status === 'gap')
const defects = rows.filter((row) => row.evidence.status === 'defect')
const observations = rows.filter((row) => row.evidence.status === 'observation')
const summary = {
  generatedAt: new Date().toISOString(),
  sourceCommit: baseline.sourceCommit ?? null,
  sources,
  totals: {
    pages: rows.length,
    evidenced: rows.filter((row) => row.evidence.status === 'evidenced').length,
    defect: defects.length,
    observation: observations.length,
    gap: gaps.length,
    backendApis: baseline.counts?.backend ?? null,
    openApiOperations: baseline.counts?.operations ?? null,
    frontendRoutes: baseline.counts?.frontend ?? null,
    unresolvedMetadata: baseline.counts?.unresolved ?? null,
  },
  byClass,
  gapsByClass: Object.fromEntries(
    Object.entries(
      gaps.reduce((acc, row) => {
        ;(acc[row.className] ??= []).push(row)
        return acc
      }, {}),
    ).map(([key, value]) => [key, value.length]),
  ),
}

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true })
fs.writeFileSync(OUT_JSON, `${JSON.stringify({ summary, rows }, null, 2)}\n`)

const gapList = gaps.slice(0, 400).map((row) => `| \`${row.route}\` | ${row.moduleId} | ${row.evidence.reason} |`).join('\n')
const md = `# Page coverage matrix

Generated: ${summary.generatedAt}
Inventory commit: \`${summary.sourceCommit ?? 'unknown'}\`

## Totals

| Metric | Value |
| --- | --- |
| Declared pages | ${summary.totals.pages} |
| Render-evidenced | ${summary.totals.evidenced} |
| Defects | ${summary.totals.defect} |
| Observations | ${summary.totals.observation} |
| Gaps | ${summary.totals.gap} |
| Backend module routes | ${summary.totals.backendApis} |
| OpenAPI operations | ${summary.totals.openApiOperations} |
| Frontend routes | ${summary.totals.frontendRoutes} |
| Unresolved metadata | ${summary.totals.unresolvedMetadata} |

## By class

| Class | Total | Evidenced | Defects | Observations | Gaps |
| --- | --- | --- | --- | --- | --- |
${Object.entries(byClass)
  .map(([name, value]) => `| ${name} | ${value.total} | ${value.evidenced} | ${value.defect} | ${value.observation} | ${value.gap} |`)
  .join('\n')}

## Observations

${observations.map((row) => `- \`${row.route}\` — ${row.evidence.kind} (${row.evidence.source}); access/behaviour to confirm, not a confirmed page defect.`).join('\n') || '- none'}

## Gaps (next sweeps)

| Route | Module | Reason |
| --- | --- | --- |
${gapList || '| - | - | - |'}

## Evidence sources

- authorized-navigation sweep: \`.ai/analysis/enterprise-page-render-findings.json\`
- dynamic placeholder sweep: \`.ai/analysis/enterprise-dynamic-page-audit-after.json\`
- public/portal/pay sweep: \`.ai/analysis/enterprise-public-page-audit.json\`
- direct gap sweep: \`.ai/analysis/enterprise-direct-page-audit.json\`
- inventory contract: \`.ai/analysis/enterprise-inventory-baseline.json\`

Render evidence is not business acceptance: a page that renders may still reject a
write, and API references are static literals unless a runtime test says otherwise.
`
fs.writeFileSync(OUT_MD, md)
console.log(JSON.stringify({ out: OUT_JSON, md: OUT_MD, totals: summary.totals, byClass: summary.byClass, gapsByClass: summary.gapsByClass }))
