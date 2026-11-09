import { describe, expect, it } from '@jest/globals'
import { sign, type BotBinding } from '../guard'
import { handleInbound, type InboundContext, type InboundEvent } from '../inbound'

const SECRET = 'test-secret'
const NOW = new Date('2026-11-09T10:00:00Z')
const TIMESTAMP = NOW.toISOString()

const binding: BotBinding = {
  id: 'binding-1',
  channelId: 'channel-1',
  externalIdentity: 'wx-user-1',
  employeeUserId: 'user-employee',
  state: 'active',
}

function event(overrides: Partial<InboundEvent> = {}): InboundEvent {
  const base = {
    body: '看看 Acme 公司的最近进展',
    timestamp: TIMESTAMP,
    nonce: 'nonce-1',
    chat: 'dm' as const,
    action: 'read' as const,
  }
  const payload = { ...base, ...overrides }
  return { ...payload, signature: sign(payload, SECRET) }
}

function context(overrides: Partial<InboundContext> = {}): InboundContext & { remembered: string[] } {
  const remembered: string[] = []
  const base: InboundContext = {
    secret: SECRET,
    now: NOW,
    binding,
    employeeActive: true,
    seenNonces: [],
    rememberNonce: (nonce: string) => remembered.push(nonce),
    text: 'Acme 联系人 ops@acme.test，报价 ¥12,000',
  }
  return Object.assign({ ...base, ...overrides }, { remembered })
}

describe('handleInbound', () => {
  it('allows a correctly signed, fresh, bound direct message', () => {
    const ctx = context()
    const result = handleInbound(event(), ctx)
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.text).toContain('Acme')
    expect(ctx.remembered).toEqual(['nonce-1'])
  })

  it('refuses a tampered body without touching the nonce ledger', () => {
    const ctx = context()
    const signed = event()
    const result = handleInbound({ ...signed, body: '看看别家公司' }, ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'bad_signature' })
    expect(ctx.remembered).toEqual([])
  })

  it('refuses a stale timestamp even when the signature is valid', () => {
    const ctx = context()
    const old = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString()
    const result = handleInbound(event({ timestamp: old }), ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'stale_timestamp' })
    expect(ctx.remembered).toEqual([])
  })

  it('refuses missing fields before anything is recorded', () => {
    const ctx = context()
    const result = handleInbound({ ...event(), nonce: '' }, ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'missing_fields' })
    expect(ctx.remembered).toEqual([])
  })

  it('refuses a replayed nonce and does not record it twice', () => {
    const ctx = context({ seenNonces: ['nonce-1'] })
    const result = handleInbound(event(), ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'replay' })
    expect(ctx.remembered).toEqual([])
  })

  it('reports a bad signature, not a replay, when an unsigned event reuses a seen nonce', () => {
    // Ordering test: replay must not be reachable before authentication, otherwise the
    // refusal leaks which nonces the server has seen.
    const ctx = context({ seenNonces: ['nonce-1'] })
    const signed = event()
    const result = handleInbound({ ...signed, signature: 'deadbeef' }, ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'bad_signature' })
  })

  it('refuses an unbound identity', () => {
    const ctx = context({ binding: null })
    const result = handleInbound(event(), ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'identity_unbound' })
  })

  it('refuses a revoked binding', () => {
    const ctx = context({ binding: { ...binding, state: 'revoked' } })
    expect(handleInbound(event(), ctx)).toMatchObject({ allowed: false, reason: 'binding_revoked' })
  })

  it('refuses an offboarded binding and an inactive employee', () => {
    expect(handleInbound(event(), context({ binding: { ...binding, state: 'offboarded' } }))).toMatchObject({
      allowed: false,
      reason: 'binding_revoked',
    })
    expect(handleInbound(event(), context({ employeeActive: false }))).toMatchObject({
      allowed: false,
      reason: 'employee_inactive',
    })
  })

  it('refuses a write from a group chat even with a valid signature', () => {
    const ctx = context()
    const result = handleInbound(event({ chat: 'group', action: 'write' }), ctx)
    expect(result).toMatchObject({ allowed: false, reason: 'group_unsafe_action' })
  })

  it('refuses approve and send from a group chat', () => {
    for (const action of ['approve', 'send'] as const) {
      expect(handleInbound(event({ chat: 'group', action }), context())).toMatchObject({
        allowed: false,
        reason: 'group_unsafe_action',
      })
    }
  })

  it('redacts sensitive fields on a group read and keeps them in a direct message', () => {
    const group = handleInbound(event({ chat: 'group' }), context())
    expect(group.allowed).toBe(true)
    if (group.allowed) {
      expect(group.text).not.toContain('ops@acme.test')
      expect(group.text).toContain('已隐藏')
    }
    const dm = handleInbound(event(), context())
    if (dm.allowed) expect(dm.text).toContain('ops@acme.test')
  })

  it('keeps an explicitly allowed field in a group', () => {
    const result = handleInbound(event({ chat: 'group' }), context({ allowInGroup: ['email'] }))
    expect(result.allowed).toBe(true)
    if (result.allowed) {
      expect(result.text).toContain('ops@acme.test')
      expect(result.text).not.toContain('+86')
    }
  })

  it('still produces an audit record when it refuses', () => {
    const result = handleInbound(event(), context({ binding: { ...binding, state: 'revoked' } }))
    expect(result.audit).toEqual({
      at: NOW.toISOString(),
      nonce: 'nonce-1',
      chat: 'dm',
      action: 'read',
      bindingId: 'binding-1',
      employeeUserId: 'user-employee',
      outcome: 'refused',
      reason: 'binding_revoked',
    })
  })

  it('marks the audit as allowed with no reason on success', () => {
    const result = handleInbound(event(), context())
    expect(result.audit).toMatchObject({ outcome: 'allowed', reason: null })
  })

  it('records the nonce once even when a later gate refuses', () => {
    // The event was authenticated, so burning its nonce is correct — otherwise a caller
    // could retry a refused message forever.
    const ctx = context({ employeeActive: false })
    expect(handleInbound(event(), ctx)).toMatchObject({ allowed: false, reason: 'employee_inactive' })
    expect(ctx.remembered).toEqual(['nonce-1'])
  })
})
