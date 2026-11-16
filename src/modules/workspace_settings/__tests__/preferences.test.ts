import { describe, expect, it } from '@jest/globals'
import { EMPTY_PREFERENCE, normalizePreference, sanitizePreference } from '../lib/preferences'

describe('navigation preference document', () => {
  it('normalizes a valid document and de-duplicates favorites', () => {
    const parsed = normalizePreference({
      favorites: ['/backend/customers', '/backend/customers', '/backend/manage'],
      recentWorkspace: 'customers',
      selectedPreset: 'sales',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.favorites).toEqual(['/backend/customers', '/backend/manage'])
    expect(parsed.value).toMatchObject({ recentWorkspace: 'customers', selectedPreset: 'sales' })
  })

  it('rejects non-backend favorites, wrong types and unknown shapes', () => {
    expect(normalizePreference({ favorites: ['https://evil.test'] }).ok).toBe(false)
    expect(normalizePreference({ favorites: 'x' }).ok).toBe(false)
    expect(normalizePreference({ recentWorkspace: 'Not An Id' }).ok).toBe(false)
    expect(normalizePreference([]).ok).toBe(false)
    expect(normalizePreference(null)).toEqual({ ok: true, value: EMPTY_PREFERENCE })
  })

  it('drops references the caller may no longer see', () => {
    const sanitized = sanitizePreference(
      { favorites: ['/backend/customers', '/backend/secret'], recentWorkspace: 'compliance', selectedPreset: 'sales' },
      {
        hrefs: new Set(['/backend/customers']),
        spaceIds: new Set(['customers']),
        presetIds: new Set<string>(),
      },
    )
    expect(sanitized).toEqual({ favorites: ['/backend/customers'], recentWorkspace: null, selectedPreset: null })
  })
})
