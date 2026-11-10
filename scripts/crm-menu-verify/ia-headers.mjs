/**
 * Pure header-label predicate for the declared sidebar.
 *
 * The stock AppShell renders one header per declared container plus the
 * management-hub group. This module owns the exact comparison so the browser
 * harness and the mutation counterexample share one implementation:
 *
 * - normalize only whitespace (trim + collapse), never case or punctuation;
 * - every expected container label must appear EXACTLY once;
 * - every observed header must be an expected container label or an explicitly
 *   allowed manage-hub label, and the manage hub may appear at most once;
 * - the aggregate fails when any label is missing, duplicated, renamed
 *   (expected missing + unexpected observed) or when an unexpected header is
 *   rendered.
 *
 * Every per-container detail states what was observed, so a passing check can
 * never carry the wording of a failure.
 */

export function normalizeHeaderLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * @param {object} input
 * @param {string[]} input.observedLabels raw header labels read from the DOM
 * @param {{id: string, label: string}[]} input.expected declared containers for
 *   the current role (live catalogue groups), so a narrower employee view only
 *   expects the containers it can actually see
 * @param {string[]} [input.allowedExtraLabels] manage-hub label(s); each may
 *   appear at most once
 * @param {string} [input.aggregateId]
 * @returns {{
 *   ok: boolean,
 *   observed: string[],
 *   expected: {id: string, label: string}[],
 *   missing: {id: string, label: string}[],
 *   duplicated: {id: string, label: string, count: number}[],
 *   unexpected: string[],
 *   duplicatedExtras: {label: string, count: number}[],
 *   checks: {id: string, ok: boolean, detail: string}[],
 *   aggregate: {id: string, ok: boolean, detail: string}
 * }}
 */
export function checkHeaderLabels({
  observedLabels,
  expected,
  allowedExtraLabels = [],
  aggregateId = 'ia.shell.headers',
} = {}) {
  const observed = (observedLabels ?? []).map(normalizeHeaderLabel)
  const expectedList = (expected ?? []).map((entry) => ({
    id: String(entry.id),
    label: normalizeHeaderLabel(entry.label),
  }))
  const allowedExtras = new Set((allowedExtraLabels ?? []).map(normalizeHeaderLabel).filter(Boolean))

  const counts = new Map()
  for (const label of observed) counts.set(label, (counts.get(label) ?? 0) + 1)

  const missing = []
  const duplicated = []
  const checks = []
  for (const entry of expectedList) {
    const count = counts.get(entry.label) ?? 0
    const checkId = `ia.shell.${entry.id}.header`
    if (count === 0) {
      missing.push(entry)
      checks.push({
        id: checkId,
        ok: false,
        detail: `expected header "${entry.label}" missing; observed headers: ${JSON.stringify(observed)}`,
      })
    } else if (count > 1) {
      duplicated.push({ ...entry, count })
      checks.push({
        id: checkId,
        ok: false,
        detail: `expected header "${entry.label}" exactly once, observed ${count}; observed headers: ${JSON.stringify(observed)}`,
      })
    } else {
      checks.push({ id: checkId, ok: true, detail: `matched header: "${entry.label}"` })
    }
  }

  const expectedSet = new Set(expectedList.map((entry) => entry.label))
  const unexpected = [...counts.keys()].filter((label) => !expectedSet.has(label) && !allowedExtras.has(label))
  const duplicatedExtras = [...counts.entries()]
    .filter(([label, count]) => allowedExtras.has(label) && count > 1)
    .map(([label, count]) => ({ label, count }))

  const allowedExtrasObserved = [...allowedExtras].filter((label) => counts.has(label)).length
  const expectedTotal = expectedList.length + Math.min(allowedExtrasObserved, allowedExtras.size)
  const ok =
    missing.length === 0 &&
    duplicated.length === 0 &&
    unexpected.length === 0 &&
    duplicatedExtras.length === 0 &&
    observed.length === expectedTotal

  let detail
  if (ok) {
    const extras = [...allowedExtras].filter((label) => counts.has(label))
    detail = `all ${expectedList.length} declared container headers matched exactly once${extras.length ? `; manage hub: ${JSON.stringify(extras)}` : ''}; observed headers: ${JSON.stringify(observed)}`
  } else {
    const problems = []
    if (missing.length > 0) problems.push(`missing ${JSON.stringify(missing.map((entry) => entry.label))}`)
    if (duplicated.length > 0) problems.push(`duplicated ${JSON.stringify(duplicated.map((entry) => `${entry.label} x${entry.count}`))}`)
    if (unexpected.length > 0) problems.push(`unexpected ${JSON.stringify(unexpected)}`)
    if (duplicatedExtras.length > 0) problems.push(`duplicated manage hub ${JSON.stringify(duplicatedExtras.map((entry) => `${entry.label} x${entry.count}`))}`)
    if (observed.length !== expectedTotal) problems.push(`observed ${observed.length} headers for ${expectedTotal} expected labels`)
    detail = `${problems.join('; ')}; observed headers: ${JSON.stringify(observed)}`
  }

  checks.push({
    id: 'ia.shell.headers.unexpected',
    ok: unexpected.length === 0 && duplicatedExtras.length === 0,
    detail:
      unexpected.length === 0 && duplicatedExtras.length === 0
        ? `no unexpected header labels; allowed manage hub: ${JSON.stringify([...allowedExtras])}`
        : `unexpected headers ${JSON.stringify(unexpected)}; duplicated manage hub ${JSON.stringify(duplicatedExtras)}; observed headers: ${JSON.stringify(observed)}`,
  })

  return {
    ok,
    observed,
    expected: expectedList,
    missing,
    duplicated,
    unexpected,
    duplicatedExtras,
    checks,
    aggregate: { id: aggregateId, ok, detail },
  }
}
