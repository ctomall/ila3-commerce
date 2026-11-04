import { describe, expect, it } from '@jest/globals'
import { normalizeStatusValue, statusLabel, statusLabels, UNKNOWN_LABEL } from '../status-label'

describe('status-label', () => {
  it('normalizes raw values', () => {
    expect(normalizeStatusValue(' In_Progress ')).toBe('in_progress')
    expect(normalizeStatusValue('at-risk')).toBe('at_risk')
    expect(normalizeStatusValue(null)).toBe('')
  })

  it('maps the relationship-health enums the customers table renders raw', () => {
    expect(statusLabel('health', 'healthy')).toBe('良好')
    expect(statusLabel('health', 'monitor')).toBe('需关注')
    expect(statusLabel('health', 'at_risk')).toBe('有风险')
  })

  it('maps deal statuses shown on the dashboard', () => {
    expect(statusLabel('dealStatus', 'open')).toBe('进行中')
    expect(statusLabel('dealStatus', 'in_progress')).toBe('进行中')
    expect(statusLabel('dealStatus', 'win')).toBe('赢单')
    expect(statusLabel('dealStatus', 'lost')).toBe('丢单')
  })

  it('is case and separator insensitive', () => {
    expect(statusLabel('health', 'AT-RISK')).toBe('有风险')
    expect(statusLabel('dealStatus', 'In Progress')).toBe('进行中')
  })

  it('returns the fallback and reports unknown values instead of leaking raw enums', () => {
    const seen: Array<[string, string]> = []
    const label = statusLabel('health', 'quarantined', { onUnknown: (g, v) => seen.push([g, v]) })
    expect(label).toBe(UNKNOWN_LABEL)
    expect(seen).toEqual([['health', 'quarantined']])
  })

  it('returns null for empty values so callers can render nothing', () => {
    expect(statusLabel('health', null)).toBeNull()
    expect(statusLabel('health', '   ')).toBeNull()
  })

  it('exposes the full map for filter dropdowns', () => {
    expect(Object.keys(statusLabels('health'))).toEqual(
      expect.arrayContaining(['healthy', 'monitor', 'at_risk']),
    )
  })
})
