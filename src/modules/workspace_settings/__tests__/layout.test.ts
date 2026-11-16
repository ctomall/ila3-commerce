import { describe, expect, it } from '@jest/globals'
import {
  EMPTY_LAYOUT,
  applyLayout,
  assignedPresets,
  normalizeLayoutConfig,
  parseLayoutConfig,
  resolvePresetSpaces,
} from '../lib/layout'
import type { Workspace } from '@/nav/workspaces'

const space = (id: string, order: number, landing = `/backend/${id}`): Workspace => ({
  id,
  label: id,
  order,
  landing,
  configured: true,
  groups: [{ id, label: id, order, landing, items: [{ href: landing, label: id }] }],
})

describe('workspace layout document', () => {
  it('accepts a complete document and de-duplicates ids', () => {
    const parsed = normalizeLayoutConfig({
      order: ['trade', 'trade', 'customers'],
      hidden: ['compliance'],
      labels: { trade: '  销售  ' },
      presets: [{ id: 'sales', name: '销售', workspaces: ['customers', 'trade'], landing: '/backend/sales/orders' }],
      assignments: { 'user-1': ['sales', 'sales'] },
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.config.order).toEqual(['trade', 'customers'])
    expect(parsed.config.labels.trade).toBe('销售')
    expect(parsed.config.assignments['user-1']).toEqual(['sales'])
  })

  it('rejects malformed ids, duplicate presets and unknown preset assignments', () => {
    expect(normalizeLayoutConfig({ order: ['Not An Id'] }).ok).toBe(false)
    expect(
      normalizeLayoutConfig({
        presets: [
          { id: 'a', name: 'A', workspaces: ['customers'] },
          { id: 'a', name: 'B', workspaces: ['trade'] },
        ],
      }).ok,
    ).toBe(false)
    expect(
      normalizeLayoutConfig({
        presets: [{ id: 'a', name: 'A', workspaces: ['customers'] }],
        assignments: { 'user-1': ['missing'] },
      }).ok,
    ).toBe(false)
    expect(normalizeLayoutConfig({ labels: { trade: 'x'.repeat(61) } }).ok).toBe(false)
    expect(normalizeLayoutConfig({ presets: [{ id: 'a', name: '', workspaces: ['customers'] }] }).ok).toBe(false)
  })

  it('falls back to the code defaults instead of failing a render', () => {
    expect(parseLayoutConfig({ order: 'nope' })).toEqual(EMPTY_LAYOUT)
    expect(parseLayoutConfig(null)).toEqual(EMPTY_LAYOUT)
  })

  it('orders by the document, applies labels and hides only the sidebar copy', () => {
    const spaces = [space('home', 10), space('customers', 20), space('trade', 30), space('compliance', 40)]
    const { ordered, visible } = applyLayout(spaces, {
      ...EMPTY_LAYOUT,
      order: ['trade'],
      labels: { trade: '销售与收款' },
      hidden: ['compliance'],
    })
    expect(ordered.map((s) => s.id)).toEqual(['trade', 'home', 'customers', 'compliance'])
    expect(ordered[0].label).toBe('销售与收款')
    expect(visible.map((s) => s.id)).toEqual(['trade', 'home', 'customers'])
    // The input array is not mutated: other consumers keep the declared labels.
    expect(spaces[2].label).toBe('trade')
  })

  it('never hands an employee a preset they were not assigned', () => {
    const config = {
      ...EMPTY_LAYOUT,
      presets: [{ id: 'sales', name: '销售', workspaces: ['trade'], landing: null }],
      assignments: { 'user-1': ['sales'], 'user-2': ['unknown'] },
    }
    expect(assignedPresets(config, 'user-1', new Set(['sales'])).map((p) => p.id)).toEqual(['sales'])
    expect(assignedPresets(config, 'user-2', new Set(['sales']))).toEqual([])
    expect(assignedPresets(config, 'user-3', new Set(['sales']))).toEqual([])
  })

  it('drops unauthorized workspaces from a preset and falls back to its first landing', () => {
    const spaces = [space('customers', 10), space('trade', 20)]
    const preset = { id: 'sales', name: '销售', workspaces: ['trade', 'compliance'], landing: '/backend/compliance' }
    const resolved = resolvePresetSpaces(preset, spaces)
    expect(resolved.spaces.map((s) => s.id)).toEqual(['trade'])
    expect(resolved.landing).toBe('/backend/trade')
    expect(resolvePresetSpaces({ ...preset, workspaces: ['compliance'] }, spaces).spaces).toEqual([])
  })
})
