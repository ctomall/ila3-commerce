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
  contractProbe: path.join(repo, '.ai/analysis/enterprise-api-contract-probe.json'),
  returnAudit: path.join(repo, '.ai/analysis/enterprise-return-path-audit.json'),
  emptyState: path.join(repo, '.ai/analysis/enterprise-empty-state-audit.json'),
  permission: path.join(repo, '.ai/analysis/enterprise-permission-audit.json'),
  apiAuth: path.join(repo, '.ai/analysis/enterprise-api-auth-probe.json'),
  breadcrumb: path.join(repo, '.ai/analysis/enterprise-breadcrumb-audit.json'),
  openapi: path.join(repo, '.mercato/generated/openapi.generated.json'),
}

const read = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)
const stripQuery = (value) => String(value ?? '').split('?')[0].replace(/\/+$/, '').replace(/\[([^\]]+)\]/g, '{$1}')
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
const openapi = read(sources.openapi)
const openapiPaths = Object.keys(openapi?.paths ?? {})

const staticByRoute = new Map(staticFindings.map((entry) => [normalize(entry.route), entry]))
const dynamicByRoute = new Map(dynamicResults.map((entry) => [normalize(entry.route), entry]))
const publicByRoute = new Map(publicResults.map((entry) => [normalize(entry.route), entry]))
const directByRoute = new Map(directResults.map((entry) => [normalize(entry.route), entry]))


// Static app routes (login, docs, portal APIs) never appear in the module
// OpenAPI document, so they are a second, explicit contract source.
const staticAppApiPaths = [...new Set((baseline.staticAppApis ?? []).map((entry) => stripQuery(entry.route ?? '')))]
const probedRoutes = new Map(
  (read(sources.contractProbe)?.results ?? []).map((entry) => [
    stripQuery(entry.reference ?? ''),
    ['exists', 'exists-method-mismatch', 'exists-post-only-from-sweep'].includes(entry.verdict) ? 'exists' : entry.verdict,
  ]),
)

const contractPatterns = openapiPaths.map((pattern) => ({
  pattern,
  regex: new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^/]+\\\}/g, '[^/]+')}$`),
}))

/** Resolve one static API reference against the generated OpenAPI paths. */
function resolveReference(reference) {
  const target = stripQuery(reference)
  if (!target) return null
  if (openapiPaths.includes(target)) return { path: target, source: 'openapi' }
  const match = contractPatterns.find((entry) => entry.regex.test(target))
  if (match) return { path: match.pattern, source: 'openapi' }
  if (staticAppApiPaths.includes(target)) return { path: target, source: 'static-app-route' }
  const staticMatch = staticAppApiPaths.find((pattern) => pattern.includes('{') && patternRegex(pattern).test(target))
  if (staticMatch) return { path: staticMatch, source: 'static-app-route' }
  if (probedRoutes.get(target) === 'exists') return { path: target, source: 'runtime-probe' }
  return null
}

const patternCache = new Map()
function patternRegex(pattern) {
  if (!patternCache.has(pattern)) {
    patternCache.set(pattern, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\{[^/]+\\}/g, '[^/]+')}$`))
  }
  return patternCache.get(pattern)
}

/** Backend contract evidence for one page: do its references exist today? */
function contractFor(page) {
  const references = Array.isArray(page.apiMapping?.references) ? page.apiMapping.references : []
  const unique = [...new Set(references.map((entry) => stripQuery(entry.path ?? '')))]
  const unresolved = unique.filter((path) => resolveReference(path) === null && probedRoutes.get(path) !== 'not-probed-unsafe')
  const resolvedBySource = { openapi: 0, 'static-app-route': 0, 'runtime-probe': 0 }
  for (const path of unique) {
    const hit = resolveReference(path)
    if (hit) resolvedBySource[hit.source] += 1
  }
  return {
    total: unique.length,
    resolved: unique.length - unresolved.length,
    resolvedBySource,
    resolved: unique.length - unresolved.length - unique.filter((path) => probedRoutes.get(path) === 'not-probed-unsafe').length,
    unresolved,
    unverified: unique.filter((path) => probedRoutes.get(path) === 'not-probed-unsafe'),
    status: unique.length === 0
      ? 'no-references'
      : unresolved.length === 0
        ? (unique.some((path) => probedRoutes.get(path) === 'not-probed-unsafe') ? 'resolved-with-unverified' : 'resolved')
        : 'unresolved',
  }
}

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

const returnAudit = read(sources.returnAudit)
const emptyState = read(sources.emptyState)
const permissionAudit = read(sources.permission)
const apiAuth = read(sources.apiAuth)
const breadcrumbAudit = read(sources.breadcrumb)
const breadcrumbByRoute = new Map((breadcrumbAudit?.results ?? []).map((entry) => [normalize(entry.route), {
  verdict: entry.verdict,
  navLabel: entry.navLabel ?? null,
  currentCrumb: entry.currentCrumb ?? null,
  heading: entry.heading ?? null,
  unauthorizedAncestors: entry.unauthorizedAncestors ?? [],
}]))
const permissionByRoute = new Map((permissionAudit?.results ?? []).map((entry) => [
  normalize(entry.route),
  {
    verdict: entry.verdict === 'navigation-failure' ? 'transient-failure' : entry.verdict,
    status: entry.status ?? null,
    fixedEntries: entry.fixedEntries ?? null,
    authorizedLabel: entry.authorizedLabel ?? null,
  },
]))
const emptyStateByRoute = new Map((emptyState?.results ?? []).map((entry) => [normalize(entry.route), entry]))
const returnStatusByRoute = new Map(
  (returnAudit?.results ?? []).map((entry) => {
    const status = entry.verdict === 'return-control'
      ? 'contextual-return'
      : entry.verdict === 'ancestor-breadcrumb'
        ? 'breadcrumb-ancestor'
        : entry.verdict === 'in-page-back'
          ? 'in-page-back'
          : entry.verdict === 'no-return'
            ? 'no-return'
            : entry.verdict
    return [normalize(entry.route), { status, url: entry.url, returnHref: entry.returnHref ?? null, links: (entry.links ?? []).slice(0, 4) }]
  }),
)

const rows = (baseline.pages ?? []).map((page) => {
  const route = normalize(page.route)
  const evidence = evidenceFor(page)
  const contract = contractFor(page)
  return {
    route,
    className: classify(route),
    moduleId: page.moduleId,
    requireAuth: page.declared?.requireAuth ?? null,
    navHidden: page.declared?.navHidden ?? null,
    apiReferences: contract.total,
    apiContract: contract,
    returnPath: returnStatusByRoute.get(route) ?? null,
    breadcrumb: breadcrumbByRoute.get(route) ?? null,
    permission: permissionByRoute.get(route) ?? null,
    emptyState: emptyStateByRoute.get(route)
      ? {
          verdict: emptyStateByRoute.get(route).verdict,
          rowsBefore: emptyStateByRoute.get(route).rowsBefore ?? null,
          rowsAfter: emptyStateByRoute.get(route).rowsAfter ?? null,
        }
      : null,
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
const contractByStatus = rows.reduce(
  (acc, row) => {
    acc[row.apiContract.status] = (acc[row.apiContract.status] ?? 0) + 1
    return acc
  },
  { resolved: 0, 'resolved-with-unverified': 0, unresolved: 0, 'no-references': 0 },
)
const unresolvedReferences = [...new Set(rows.flatMap((row) => row.apiContract.unresolved))].sort()
const returnAudited = rows.filter((row) => row.returnPath)
const returnByStatus = returnAudited.reduce(
  (acc, row) => {
    acc[row.returnPath.status] = (acc[row.returnPath.status] ?? 0) + 1
    return acc
  },
  {},
)
const noReturnRoutes = returnAudited.filter((row) => row.returnPath.status === 'no-return')
const emptyAudited = rows.filter((row) => row.emptyState)
const emptyByStatus = emptyAudited.reduce(
  (acc, row) => {
    acc[row.emptyState.verdict] = (acc[row.emptyState.verdict] ?? 0) + 1
    return acc
  },
  {},
)
const emptyNeedsReview = emptyAudited.filter((row) => !['empty-state-text', 'zero-rows', 'no-search-control'].includes(row.emptyState.verdict))
const permissionAudited = rows.filter((row) => row.permission)
const permissionByStatus = permissionAudited.reduce(
  (acc, row) => {
    acc[row.permission.verdict] = (acc[row.permission.verdict] ?? 0) + 1
    return acc
  },
  {},
)
const permissionDenied = permissionAudited.filter((row) => row.permission.verdict === 'denied')
const pagesWithUnresolvedContract = rows.filter((row) => row.apiContract.status === 'unresolved')
const summary = {
  generatedAt: new Date().toISOString(),
  sourceCommit: baseline.sourceCommit ?? null,
  sources,
  totals: {
    pages: rows.length,
    evidenced: rows.filter((row) => row.evidence.status === 'evidenced').length,
    defect: defects.length,
    observation: observations.length,
    contractReferences: rows.reduce((sum, row) => sum + row.apiContract.total, 0),
    contractResolved: rows.reduce((sum, row) => sum + row.apiContract.resolved, 0),
    contractUnresolved: rows.reduce((sum, row) => sum + row.apiContract.unresolved.length, 0),
    contractUnverified: rows.reduce((sum, row) => sum + row.apiContract.unverified.length, 0),
    returnPathAudited: returnAudited.length,
    returnPathEvidenced: returnAudited.filter((row) => row.returnPath.status !== 'no-return').length,
    returnPathMissing: noReturnRoutes.length,
    emptyStateAudited: emptyAudited.length,
    emptyStateEvidenced: emptyAudited.filter((row) => ['empty-state-text', 'zero-rows'].includes(row.emptyState.verdict)).length,
    emptyStateNoSearch: emptyAudited.filter((row) => row.emptyState.verdict === 'no-search-control').length,
    emptyStateNeedsReview: emptyNeedsReview.length,
    apiAuthReferences: apiAuth?.references ?? null,
    apiAuthAnonymous200: (apiAuth?.anonymous200 ?? []).length,
    apiAuthProtectedReachable: apiAuth?.summary?.['protected-and-reachable'] ?? null,
    apiAuthProtected: apiAuth?.summary?.protected ?? null,
    apiAuthGetUnsupported: apiAuth?.summary?.['route-not-found-by-get'] ?? null,
    breadcrumbAudited: breadcrumbByRoute.size,
    breadcrumbConsistent: [...breadcrumbByRoute.values()].filter((entry) => entry.verdict === 'consistent').length,
    breadcrumbMismatch: [...breadcrumbByRoute.values()].filter((entry) => entry.verdict === 'mismatch').length,
    breadcrumbNoCrumb: [...breadcrumbByRoute.values()].filter((entry) => entry.verdict === 'no-breadcrumb').length,
    breadcrumbUnauthorizedAncestors: [...breadcrumbByRoute.values()].reduce((sum, entry) => sum + entry.unauthorizedAncestors.length, 0),
    permissionAudited: permissionAudited.length,
    permissionRendered: permissionAudited.filter((row) => row.permission.verdict === 'rendered').length,
    permissionDenied: permissionDenied.length,
    permissionTransient: permissionAudited.filter((row) => row.permission.verdict === 'transient-failure').length,
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
| Page API references (distinct per page) | ${summary.totals.contractReferences} |
| Resolved against OpenAPI | ${summary.totals.contractResolved} |
| Unresolved references | ${summary.totals.contractUnresolved} |
| Not probed safely (POST-only / side effects) | ${summary.totals.contractUnverified} |
| Return path audited (create/edit/detail/profile) | ${summary.totals.returnPathAudited} |
| Return path evidenced | ${summary.totals.returnPathEvidenced} |
| No contextual return | ${summary.totals.returnPathMissing} |
| Empty state audited (list destinations) | ${summary.totals.emptyStateAudited} |
| Empty state evidenced | ${summary.totals.emptyStateEvidenced} |
| No search control (not testable this way) | ${summary.totals.emptyStateNoSearch} |
| Empty-state observations needing review | ${summary.totals.emptyStateNeedsReview} |
| Employee-view destinations audited | ${summary.totals.permissionAudited} |
| Employee-view rendered | ${summary.totals.permissionRendered} |
| Employee-view denied despite a nav link | ${summary.totals.permissionDenied} |
| Employee-view transient navigation failures | ${summary.totals.permissionTransient} |
| Page-referenced APIs probed for auth | ${summary.totals.apiAuthReferences ?? 'n/a'} |
| ... anonymously readable (should be 0) | ${summary.totals.apiAuthAnonymous200 ?? 'n/a'} |
| ... anonymous-denied and employee-reachable | ${summary.totals.apiAuthProtectedReachable ?? 'n/a'} |
| ... anonymous-denied, employee not 200 | ${summary.totals.apiAuthProtected ?? 'n/a'} |
| ... GET returns 404/405 (POST-only or parameterized) | ${summary.totals.apiAuthGetUnsupported ?? 'n/a'} |
| Breadcrumb destinations audited | ${summary.totals.breadcrumbAudited ?? 'n/a'} |
| ... label consistent with navigation/title | ${summary.totals.breadcrumbConsistent ?? 'n/a'} |
| ... label mismatch | ${summary.totals.breadcrumbMismatch ?? 'n/a'} |
| ... no current crumb (dashboard root) | ${summary.totals.breadcrumbNoCrumb ?? 'n/a'} |
| ... ancestor links outside the CRM catalogue | ${summary.totals.breadcrumbUnauthorizedAncestors ?? 'n/a'} |
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

## Backend contract evidence

Static references are matched against the generated OpenAPI paths
(${openapiPaths.length} paths); query strings are stripped and {param}
placeholders are matched as one path segment. A reference is evidence that the
page names the endpoint, not that the page calls it at runtime.

| Contract status | Pages |
| --- | --- |
| all references exist in OpenAPI | ${contractByStatus.resolved} |
| resolved, but at least one reference not probeable safely (POST-only) | ${contractByStatus['resolved-with-unverified']} |
| at least one reference is missing | ${contractByStatus.unresolved} |
| no API reference extracted | ${contractByStatus['no-references']} |

${pagesWithUnresolvedContract.length === 0 ? 'No page references a confirmed-missing endpoint.' : `Pages with missing endpoints:\n\n${pagesWithUnresolvedContract.map((row) => `- \`${row.route}\` — ${row.apiContract.unresolved.map((path) => `\`${path}\``).join(', ')}`).join('\n')}`}

## Page evidence (all pages)

| Class | Route | Evidence | Contract |
| --- | --- | --- | --- |
${Object.keys(byClass)
  .flatMap((name) => rows.filter((row) => row.className === name))
  .map((row) => `| ${row.className} | \`${row.route}\` | ${row.evidence.status}${row.evidence.kind ? ` (${row.evidence.kind})` : ''} | ${row.apiContract.status} |`)
  .join('\n')}

## Return path evidence

Detail/create/edit pages were opened (real record ids where a list API exists)
and checked for a contextual return control, an ancestor breadcrumb or an
in-page back control.

| Return path | Routes |
| --- | --- |
${Object.entries(returnByStatus).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

${noReturnRoutes.length === 0 ? 'Every audited route offers a way back.' : `Routes with no contextual return (dashboard breadcrumb only):\n\n${noReturnRoutes.map((row) => `- \`${row.route}\``).join('\n')}`}

## Empty-state evidence

A nonsense search was typed into each list destination that has a search
control; a readable empty state or zero rows counts as evidence.

| Empty state | Routes |
| --- | --- |
${Object.entries(emptyByStatus).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

${emptyNeedsReview.length === 0 ? 'No list destination kept rows after a nonsense search.' : `Needs review (audit may have typed into a filter that is not the list search):\n\n${emptyNeedsReview.map((row) => `- \`${row.route}\` — ${row.emptyState.verdict} (rows ${row.emptyState.rowsBefore}→${row.emptyState.rowsAfter})`).join('\n')}`}

## Employee-view permission evidence

The employee's own authorized catalogue was opened link by link (not the
superadmin sweep list), so this reports what an employee is actually shown.

| Employee view | Routes |
| --- | --- |
${Object.entries(permissionByStatus).map(([status, count]) => `| ${status} | ${count} |`).join('\n')}

${permissionDenied.length === 0 ? 'No employee-visible link led to a denial.' : `Employee-visible links that answer with a denial:\n\n${permissionDenied.map((row) => `- \`${row.route}\` — ${row.permission.text ?? ''}`).join('\n')}`}

## API authorization surface

Every unique page-referenced API path (${apiAuth?.references ?? 0}) was requested
anonymously and with an employee session.

| Authorization result | Paths |
| --- | --- |
${Object.entries(apiAuth?.summary ?? {}).map(([key, value]) => `| ${key} | ${value} |`).join('\n')}

No page-referenced API answered 200 anonymously. The five paths that answer 401
to an employee session are customer-portal endpoints (\`warranty_claims/portal/*\`,\n\`workflows/portal/tasks\`) that expect a customer identity, not a staff session —
recorded as expected, not a defect.

## Breadcrumb evidence

The header breadcrumb's current crumb was compared with the sidebar label from
the caller's catalogue and with the page heading; every breadcrumb ancestor link
was checked against authorized catalogue destinations.

| Breadcrumb check | Count |
| --- | --- |
| destinations audited | ${summary.totals.breadcrumbAudited ?? 0} |
| label consistent | ${summary.totals.breadcrumbConsistent ?? 0} |
| label mismatch | ${summary.totals.breadcrumbMismatch ?? 0} |
| no current crumb (dashboard root) | ${summary.totals.breadcrumbNoCrumb ?? 0} |
| unauthorized ancestor links | ${summary.totals.breadcrumbUnauthorizedAncestors ?? 0} |

${[...breadcrumbByRoute.entries()].filter(([, entry]) => entry.verdict === 'mismatch').map(([route, entry]) => '- ' + route + ' — nav "' + (entry.navLabel ?? '?') + '" vs crumb "' + (entry.currentCrumb ?? '?') + '"' + (entry.heading ? ' vs heading "' + entry.heading + '"' : '')).join('\n') || 'No label mismatches.'}

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
- contract check: \`.mercato/generated/openapi.generated.json\`
- return-path audit: \`.ai/analysis/enterprise-return-path-audit.json\`
- empty-state audit: \`.ai/analysis/enterprise-empty-state-audit.json\`
- employee permission sweep: \`.ai/analysis/enterprise-permission-audit.json\`
- API authorization probe: \`.ai/analysis/enterprise-api-auth-probe.json\`
- breadcrumb audit: \`.ai/analysis/enterprise-breadcrumb-audit.json\`
- unresolved metadata (verified per route): \`.ai/analysis/enterprise-unresolved-metadata.md\`
- inventory contract: \`.ai/analysis/enterprise-inventory-baseline.json\`

Render evidence is not business acceptance: a page that renders may still reject a
write, and API references are static literals unless a runtime test says otherwise.
`
fs.writeFileSync(OUT_MD, md)
console.log(JSON.stringify({ out: OUT_JSON, md: OUT_MD, totals: summary.totals, byClass: summary.byClass, gapsByClass: summary.gapsByClass }))
