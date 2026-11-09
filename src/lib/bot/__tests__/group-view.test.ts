import { describe, expect, it } from '@jest/globals'
import { renderGroupSummary } from '../group-view'

describe('renderGroupSummary', () => {
  it('renders allow-listed fields for a known kind', () => {
    const result = renderGroupSummary({
      kind: 'quote',
      id: 'quote-123456789',
      fields: { quoteNumber: 'Q-2026-1', statusLabel: '待审批', amountBand: '10k-20k' },
    })
    // id is truncated to 8 characters on purpose, and even an allow-listed value still
    // goes through redaction (see the next test).
    expect(result).toEqual({ ok: true, text: 'quote #quote-12 · Q-2026-1 · 待审批 · 10k-20k', dropped: [] })
  })

  it('drops every field that is not on the allow-list and reports which', () => {
    const result = renderGroupSummary({
      kind: 'company',
      id: 'c-1',
      fields: { name: 'Acme', address: '某路 1 号', notes: '内部备注', iban: 'DE00 0000' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toBe('company #c-1 · Acme')
      expect(result.dropped.sort()).toEqual(['address', 'iban', 'notes'])
    }
  })

  it('still redacts the value of an allow-listed field', () => {
    const result = renderGroupSummary({
      kind: 'company',
      id: 'c-1',
      fields: { name: 'Acme（联系 ops@acme.test）' },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).not.toContain('ops@acme.test')
      expect(result.text).toContain('已隐藏')
    }
  })

  it('refuses an unknown kind instead of dumping the fields', () => {
    expect(renderGroupSummary({ kind: 'invoice' as never, id: 'x', fields: { name: 'Acme' } })).toEqual({
      ok: false,
      reason: 'unknown_kind',
    })
  })

  it('refuses when nothing allow-listed survived', () => {
    expect(renderGroupSummary({ kind: 'company', id: 'c-1', fields: { notes: 'x', address: 'y' } })).toEqual({
      ok: false,
      reason: 'no_fields',
    })
  })

  it('drops empty values instead of rendering separators', () => {
    const result = renderGroupSummary({ kind: 'task', id: 't-1', fields: { title: '回访', dueDate: '' } })
    expect(result).toEqual({ ok: true, text: 'task #t-1 · 回访', dropped: [] })
  })

  it('truncates the id so a group cannot be used to enumerate records', () => {
    const result = renderGroupSummary({ kind: 'task', id: 'a'.repeat(40), fields: { title: 'x' } })
    if (result.ok) expect(result.text).toBe(`task #${'a'.repeat(8)} · x`)
  })
})
