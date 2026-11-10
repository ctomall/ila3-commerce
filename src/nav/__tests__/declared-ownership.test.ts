import { describe, expect, it } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import { applyPageOverridesToManifests } from '@open-mercato/shared/modules/overrides'
import { backendRouteMetadata } from '@/.mercato/generated/backend-route-metadata.generated'
import type { BackendRouteManifestEntry } from '@open-mercato/shared/modules/registry'
import { enabledModules } from '../../modules'
import {
  ACCOUNT_SECTION_KEY,
  declaredCategoryIds,
  declaredCategoryKeys,
  declaredContainerIds,
  declaredContainerMembers,
  resolveNavOwner,
} from '../ownership'
import navGroups from '../nav-groups.json'
import hiddenPages from '../hidden-pages.json'

/**
 * Static ownership gate for the declared CRM information architecture.
 *
 * The runtime gate (`scripts/crm-nav-declared-check.mjs`) proves what a deployed
 * build serves; this test proves the declarations themselves, before a build
 * exists: page metadata has exactly one owner per entry, the container catalogue
 * cannot disagree with it, and every hidden page has verified evidence.
 *
 * Ownership is a single declared fact:
 *   - an installed package page is declared in `src/modules.ts` `routes.pages`
 *     metadata (the app-wide override dispatcher merges it over `page.meta.ts`);
 *   - an app-owned page declares the same `page*` fields in its own `page.meta.ts`;
 *   - `src/nav/nav-groups.json` only maps page-group keys to containers/order.
 *
 * The `src/modules.ts` table is deliberately minimal: a row exists only when the
 * page's own metadata would render the wrong container, order, context or
 * visibility. A no-op row fails the `only declares real differences` test.
 */

type HiddenPage = { reason: string; parent: string; evidence: string }

type EffectiveEntry = BackendRouteManifestEntry & {
  group?: string
  groupKey?: string
  order?: number
  navHidden?: boolean
  pageContext?: 'main' | 'admin' | 'settings' | 'profile'
  title?: string
}

const containers = navGroups as Array<{
  id: string
  label: string
  labelKey?: string
  order: number
  landing?: string
  members: string[]
}>
const hidden = hiddenPages as Record<string, HiddenPage>

const UTILITY_ROOTS = new Set(['/backend'])
const HIDDEN_REASONS = new Set([
  'in-page-action',
  'redirect-alias',
  'legacy-redirect',
  'bridge-route',
  'legacy-aggregator',
  'legacy-duplicate',
  'account-menu',
  'stock-placeholder',
  'settings-home',
  'management-hub',
  'prototype-demo',
  'base-module-hidden',
])

function pageOverrides() {
  const entry = enabledModules.find((module) => module.overrides?.routes?.pages)
  expect(entry).toBeDefined()
  return entry!.overrides!.routes!.pages!
}

const overrides = pageOverrides()

function effectiveEntries(): EffectiveEntry[] {
  return applyPageOverridesToManifests(
    backendRouteMetadata as unknown as BackendRouteManifestEntry[],
    overrides as never,
    'backend',
  ) as EffectiveEntry[]
}

function isStatic(entry: EffectiveEntry): boolean {
  return !(entry.pattern ?? entry.path ?? '').includes('[')
}

const baseEntries = backendRouteMetadata as unknown as EffectiveEntry[]
const allEntries = effectiveEntries()
const byPath = new Map<string, EffectiveEntry>(allEntries.map((entry) => [entry.pattern!, entry]))
const baseByPath = new Map<string, EffectiveEntry>(baseEntries.map((entry) => [entry.pattern!, entry]))
const visible = allEntries.filter((entry) => isStatic(entry) && !entry.navHidden)
const visiblePaths = new Set(visible.map((entry) => entry.pattern!))
const hiddenStatic = allEntries.filter((entry) => isStatic(entry) && entry.navHidden === true)

const declaredKeys = new Set(
  Object.values(overrides)
    .map((override) => (override as { metadata?: Record<string, unknown> } | null)?.metadata?.pageGroupKey)
    .filter((key): key is string => typeof key === 'string'),
)

describe('declared navigation ownership', () => {
  it('resolves the page* override aliases into the manifest fields the nav payload reads', () => {
    const expectations: Array<{ path: string; expected: Partial<EffectiveEntry> }> = [
      { path: '/backend/staff/time-tracking', expected: { groupKey: 'crmNav.group.home', order: 20 } },
      { path: '/backend/calendar', expected: { groupKey: 'crmNav.group.home', order: 40 } },
      { path: '/backend/payment-gateways', expected: { groupKey: 'crmNav.group.payments', pageContext: 'main' } },
      {
        path: '/backend/config/customers/deals',
        expected: { groupKey: 'crmNav.manage.category.business', pageContext: 'settings' },
      },
      {
        path: '/backend/sidebar-customization',
        expected: { groupKey: ACCOUNT_SECTION_KEY, pageContext: 'profile', order: 3 },
      },
      { path: '/backend/definitions/visual-editor', expected: { navHidden: true } },
      { path: '/backend/inbox-ops/log', expected: { navHidden: false, pageContext: 'settings' } },
      { path: '/backend/resources/resource-types/create', expected: { navHidden: true } },
    ]
    for (const { path: routePath, expected } of expectations) {
      expect({ routePath, entry: byPath.get(routePath) }).toMatchObject({ entry: expect.anything() })
      expect(byPath.get(routePath)).toMatchObject(expected as never)
    }
  })

  it('only declares real differences from the page metadata (no restated no-ops)', () => {
    for (const key of Object.keys(overrides)) {
      const routePath = key.replace(/^backend:/, '')
      const before = baseByPath.get(routePath)
      const after = byPath.get(routePath)
      expect({ routePath, found: Boolean(before && after) }).toMatchObject({ found: true })
      if (!before || !after) continue
      const changed =
        before.groupKey !== after.groupKey ||
        before.group !== after.group ||
        before.order !== after.order ||
        before.pageContext !== after.pageContext ||
        (before.navHidden ?? false) !== (after.navHidden ?? false)
      expect({ routePath, changed }).not.toMatchObject({ changed: false })
    }
  })

  it('declares container ids/order only, with one owner per page-group key', () => {
    const ids = declaredContainerIds()
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toBe(id.toLowerCase())
    const orders = containers.map((container) => container.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)

    const members = declaredContainerMembers()
    expect(new Set(members).size).toBe(members.length)
    expect(declaredCategoryKeys()).toHaveLength(10)
    expect(new Set(declaredCategoryIds()).size).toBe(10)
    for (const container of containers) {
      expect(container.labelKey?.startsWith('crmNav.')).toBe(true)
      if (container.landing) {
        expect(container.landing.startsWith('/backend')).toBe(true)
        // The home container declares the dashboard root (`/backend`), which the
        // catalogue serves through the shell alias of the workbench entry; every
        // other landing is the container's own first entry.
        expect(container.landing === '/backend' || visiblePaths.has(container.landing)).toBe(true)
      }
    }
  })

  it('declares containers only, never a per-entry href map', () => {
    const allowed = new Set(['id', 'label', 'labelKey', 'order', 'landing', 'members'])
    for (const container of containers) {
      for (const key of Object.keys(container)) expect({ key, allowed: allowed.has(key) }).toMatchObject({ allowed: true })
      expect('href' in container).toBe(false)
      for (const member of container.members) {
        // members are page-group keys read from page metadata, not routes
        expect(member.startsWith('/')).toBe(false)
      }
    }
  })

  it('resolves every declared key to exactly one owner and rejects unknown keys', () => {
    for (const key of declaredKeys) {
      expect({ key, owner: resolveNavOwner(key) }).toMatchObject({ owner: expect.anything() })
    }
    expect(resolveNavOwner('brand_new.nav.group')).toBeNull()
    expect(resolveNavOwner(undefined)).toBeNull()
    expect(resolveNavOwner('')).toBeNull()
    // A key can never be both a container member and a settings category.
    for (const key of declaredContainerMembers()) expect(resolveNavOwner(key)?.kind).toBe('container')
    for (const key of declaredCategoryKeys()) expect(resolveNavOwner(key)?.kind).toBe('category')
    expect(resolveNavOwner(ACCOUNT_SECTION_KEY)?.kind).toBe('account')
  })

  it('gives every visible static page exactly one primary owner', () => {
    const seen = new Set<string>()
    const perOwner = new Map<string, number>()
    for (const entry of visible) {
      const href = entry.pattern!
      expect(seen.has(href)).toBe(false)
      seen.add(href)
      const key = entry.groupKey ?? entry.group
      const owner = resolveNavOwner(key)
      expect({ href, owner }).not.toMatchObject({ owner: null })
      if (!owner) continue
      perOwner.set(owner.key, (perOwner.get(owner.key) ?? 0) + 1)
      if (owner.kind === 'container') expect(entry.pageContext ?? 'main').toBe('main')
      if (owner.kind === 'category') expect(entry.pageContext).toBe('settings')
      if (owner.kind === 'account') expect(entry.pageContext).toBe('profile')
    }
    for (const key of [...declaredContainerMembers(), ...declaredCategoryKeys()]) {
      expect({ key, entries: perOwner.get(key) ?? 0 }).not.toMatchObject({ entries: 0 })
    }
  })

  it('documents every hidden static page with verifiable evidence and a reachable, visible parent', () => {
    const hiddenHrefs = new Set(hiddenStatic.map((entry) => entry.pattern!))
    for (const href of hiddenHrefs) expect({ href, documented: Boolean(hidden[href]) }).toMatchObject({ documented: true })
    for (const href of Object.keys(hidden)) expect(hiddenHrefs.has(href)).toBe(true)

    const documented = new Set(Object.keys(hidden))
    for (const [href, doc] of Object.entries(hidden)) {
      expect(HIDDEN_REASONS.has(doc.reason)).toBe(true)
      expect(doc.parent.startsWith('/backend')).toBe(true)
      expect(doc.parent).not.toBe(href)
      // The parent must be reachable and not itself hidden: a hidden page whose
      // parent is hidden would be unreachable from the menu.
      expect({ href, parentHidden: documented.has(doc.parent) }).toMatchObject({ parentHidden: false })
      expect(visiblePaths.has(doc.parent) || UTILITY_ROOTS.has(doc.parent)).toBe(true)

      const file = doc.evidence.split(/\s+/)[0].split(/:(?=\d+$)/)[0]
      const absolute = path.resolve(process.cwd(), file)
      expect({ href, file: fs.existsSync(absolute) }).toMatchObject({ file: true })
      const line = Number(doc.evidence.split(/\s+/)[0].split(/:(?=\d+$)/)[1])
      if (Number.isFinite(line)) {
        const lines = fs.readFileSync(absolute, 'utf8').split('\n').length
        expect(line).toBeLessThanOrEqual(lines)
      }
    }
  })

  it('keeps the un-hidden pages out of the hidden manifest and visible', () => {
    for (const href of ['/backend/inbox-ops/log', '/backend/inbox-ops/settings']) {
      expect(hidden[href]).toBeUndefined()
      expect(visiblePaths.has(href)).toBe(true)
    }
  })

  it('classifies every settings-shaped route through declaration metadata, not its path', () => {
    // No allowlist: any visible route whose URL merely *looks* like settings must
    // still be declared as a settings-context management entry. This is the
    // invariant that makes the old path heuristic unnecessary.
    const shaped = visible.filter(
      (entry) => entry.pattern!.startsWith('/backend/config/') || entry.pattern!.endsWith('/settings'),
    )
    expect(shaped.length).toBeGreaterThan(0)
    const violations = shaped
      .map((entry) => {
        const owner = resolveNavOwner(entry.groupKey ?? entry.group)
        return { href: entry.pattern, ownerKind: owner?.kind ?? 'none', pageContext: entry.pageContext ?? 'main' }
      })
      .filter((entry) => entry.ownerKind !== 'category' || entry.pageContext !== 'settings')
    expect(violations).toEqual([])
  })

  it('does not manufacture a menu entry for a base/adaptor module page', () => {
    const entry = byPath.get('/backend/shipping-carriers/create')
    expect(entry?.navHidden).toBe(true)
    expect(hidden['/backend/shipping-carriers/create']?.reason).toBe('base-module-hidden')
  })
})
