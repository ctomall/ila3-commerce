import { describe, expect, it } from '@jest/globals'
import {
  canAct,
  isFresh,
  isReplay,
  redactForGroup,
  sign,
  verifySignature,
  type BotBinding,
} from '../guard'

const SECRET = 'test-secret'
const NOW = new Date('2026-11-08T10:00:00Z')

const event = {
  body: '{"text":"查一下 Nordwind 的最近联系"}',
  timestamp: '2026-11-08T09:59:30Z',
  nonce: 'n-1',
}

const activeBinding: BotBinding = {
  id: 'b1',
  channelId: 'ch-1',
  externalIdentity: 'u-42',
  employeeUserId: 'user-1',
  state: 'active',
}

describe('signature', () => {
  it('accepts a correctly signed, fresh event', () => {
    const signature = sign(event, SECRET)
    expect(verifySignature({ ...event, signature }, SECRET, NOW)).toEqual({ ok: true })
  })

  it('rejects a tampered body', () => {
    const signature = sign(event, SECRET)
    const tampered = { ...event, signature, body: '{"text":"删掉所有客户"}' }
    expect(verifySignature(tampered, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects a wrong secret and a missing field', () => {
    const signature = sign(event, 'other-secret')
    expect(verifySignature({ ...event, signature }, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifySignature({ ...event, signature: '' }, SECRET, NOW)).toEqual({ ok: false, reason: 'missing_fields' })
  })

  it('rejects a signature that is valid but outside the replay window', () => {
    const old = { body: event.body, nonce: 'n-2', timestamp: '2026-11-08T09:40:00Z' }
    const signature = sign(old, SECRET)
    expect(verifySignature({ ...old, signature }, SECRET, NOW)).toEqual({ ok: false, reason: 'stale_timestamp' })
  })

  it('treats the timestamp as part of the signed payload', () => {
    const signature = sign(event, SECRET)
    // same body and nonce, different timestamp: signature must no longer match
    expect(verifySignature({ ...event, signature, timestamp: '2026-11-08T09:59:31Z' }, SECRET, NOW))
      .toEqual({ ok: false, reason: 'bad_signature' })
  })
})

describe('freshness and replay', () => {
  it('accepts inside the window and refuses outside it', () => {
    expect(isFresh('2026-11-08T09:59:00Z', NOW)).toBe(true)
    expect(isFresh('2026-11-08T09:50:00Z', NOW)).toBe(false)
    expect(isFresh('not-a-date', NOW)).toBe(false)
  })

  it('drops a nonce it has already seen', () => {
    expect(isReplay('n-1', ['n-1'])).toBe(true)
    expect(isReplay('n-2', ['n-1'])).toBe(false)
  })
})

describe('canAct', () => {
  it('allows a private-chat action for an active binding', () => {
    expect(canAct({ binding: activeBinding, employeeActive: true, isGroup: false, action: 'write' })).toEqual({ allowed: true })
  })

  it('refuses revoked/offboarded bindings and unbound identities', () => {
    expect(canAct({ binding: { ...activeBinding, state: 'revoked' }, employeeActive: true, isGroup: false, action: 'read' }))
      .toEqual({ allowed: false, reason: 'binding_revoked' })
    expect(canAct({ binding: { ...activeBinding, state: 'offboarded' }, employeeActive: true, isGroup: false, action: 'read' }))
      .toEqual({ allowed: false, reason: 'binding_revoked' })
    expect(canAct({ binding: { ...activeBinding, employeeUserId: null }, employeeActive: true, isGroup: false, action: 'read' }))
      .toEqual({ allowed: false, reason: 'identity_unbound' })
    expect(canAct({ binding: activeBinding, employeeActive: false, isGroup: false, action: 'read' }))
      .toEqual({ allowed: false, reason: 'employee_inactive' })
  })

  it('lets a group chat read but never write, approve or send', () => {
    expect(canAct({ binding: activeBinding, employeeActive: true, isGroup: true, action: 'read' })).toEqual({ allowed: true })
    for (const action of ['write', 'approve', 'send'] as const) {
      expect(canAct({ binding: activeBinding, employeeActive: true, isGroup: true, action }))
        .toEqual({ allowed: false, reason: 'group_unsafe_action' })
    }
  })

  it('refuses a replayed event even when everything else is fine', () => {
    expect(canAct({ binding: activeBinding, employeeActive: true, isGroup: false, action: 'send', replay: true }))
      .toEqual({ allowed: false, reason: 'replay' })
  })
})

describe('group redaction', () => {
  it('hides email, phone and amounts by default', () => {
    const text = '联系 marta@nordwind.de 或 +86 138 0000 1111，报价 $12,500'
    const redacted = redactForGroup(text)
    expect(redacted).not.toContain('marta@nordwind.de')
    expect(redacted).not.toContain('+86 138')
    expect(redacted).not.toContain('12,500')
    expect(redacted).toContain('已隐藏')
  })

  it('can allow specific fields explicitly', () => {
    const text = '报价 $12,500，联系 marta@nordwind.de'
    const redacted = redactForGroup(text, ['amount'])
    expect(redacted).toContain('12,500')
    expect(redacted).not.toContain('marta@nordwind.de')
  })

  it('normalises full-width punctuation before matching', () => {
    // `＠` and `．` are the same characters as `@` and `.` to a reader; without NFKC the
    // address walked through the pattern untouched.
    const full = redactForGroup('mail ｏｐｓ＠ａｃｍｅ．ｔｅｓｔ now')
    expect(full).not.toContain('ｏｐｓ＠ａｃｍｅ．ｔｅｓｔ')
    expect(full).toContain('已隐藏')
  })

  it('rejoins a value split across lines before matching', () => {
    const split = redactForGroup('mail ops@acme.\ntest now')
    expect(split).not.toContain('ops@acme. test')
    expect(split).toContain('已隐藏')
  })

  it('collapses whitespace so the returned text carries no hidden line breaks', () => {
    expect(redactForGroup('a\r\n\nb\t c')).toBe('a b c')
  })

  it('covers dotted, parenthesised, RMB and suffix amount formats', () => {
    // Regression for the shapes that walked through the first version: dots/parens in
    // phone numbers, RMB/€/£/人民币 prefixes, and the 元 suffix.
    for (const sample of [
      '电话 138.0000.0000',
      '手机 (138) 0000 0000',
      '报价 RMB 12,000',
      '报价 人民币 12,000',
      '报价 12,000 元',
      '报价 €12,000',
    ]) {
      const redacted = redactForGroup(sample)
      expect(redacted).not.toContain('12,000')
      expect(redacted).not.toMatch(/138[\d\s.()-]*/)
      expect(redacted).toContain('已隐藏')
    }
  })

  it('stays linear on input with no @ and refuses to render an oversized message', () => {
    // 100k characters used to take 12.8 s (the email pattern retried at every offset with
    // no `@` anywhere). Both the pre-check and the length cap keep this bounded.
    const started = Date.now()
    redactForGroup('a'.repeat(100_000))
    const elapsed = Date.now() - started
    expect(elapsed).toBeLessThan(200)
    expect(redactForGroup('a'.repeat(30_000))).toBe('〔消息过长，群聊不渲染，请到私聊查看〕')
  })

  it('leaves clean text untouched', () => {
    expect(redactForGroup('Nordwind 有 3 条待跟进')).toBe('Nordwind 有 3 条待跟进')
  })
})
