import { describe, expect, it } from '@jest/globals'
import { attemptAfterResponse, decideAttempt, sendSuccessMessage } from '../lib/send-attempt'

const id = () => 'req-1'

describe('decideAttempt', () => {
  it('creates one id for a new attempt', () => {
    const decision = decideAttempt(null, 'sig-a', id)
    expect(decision).toMatchObject({ clientRequestId: 'req-1' })
    if ('attempt' in decision) expect(decision.attempt).toMatchObject({ signature: 'sig-a', unknown: false })
  })

  it('reuses the id when the signature is unchanged', () => {
    const previous = { clientRequestId: 'req-old', signature: 'sig-a', unknown: true }
    const decision = decideAttempt(previous, 'sig-a', id)
    expect(decision).toMatchObject({ clientRequestId: 'req-old' })
  })

  it('blocks a changed payload while the previous outcome is unknown', () => {
    const previous = { clientRequestId: 'req-old', signature: 'sig-a', unknown: true }
    const decision = decideAttempt(previous, 'sig-b', id)
    expect(decision).toHaveProperty('blocked')
  })

  it('allows a new id after a definitive failure', () => {
    const previous = { clientRequestId: 'req-old', signature: 'sig-a', unknown: false }
    expect(decideAttempt(previous, 'sig-b', id)).toMatchObject({ clientRequestId: 'req-1' })
  })
})

describe('attemptAfterResponse', () => {
  it('clears on success and definitive rejection', () => {
    expect(attemptAfterResponse(202)).toBe('clear')
    expect(attemptAfterResponse(200)).toBe('clear')
    expect(attemptAfterResponse(422)).toBe('clear')
    expect(attemptAfterResponse(403)).toBe('clear')
  })

  it('keeps the key for 409 and unknown outcomes', () => {
    expect(attemptAfterResponse(409)).toBe('keep')
    expect(attemptAfterResponse(500)).toBe('keep-unknown')
    expect(attemptAfterResponse(503)).toBe('keep-unknown')
  })
})

describe('sendSuccessMessage', () => {
  it('marks a replay as a recovered result', () => {
    expect(sendSuccessMessage({ replayed: true })).toEqual({ message: '已取回原发送结果（未重复投递）。', attention: false })
  })
  it('warns when the ledger was not recorded', () => {
    const result = sendSuccessMessage({ ledgerRecorded: false })
    expect(result.attention).toBe(true)
    expect(result.message).toContain('请勿用同一 clientRequestId 重试')
  })
  it('is a plain success otherwise', () => {
    expect(sendSuccessMessage({})).toEqual({ message: '已提交投递；平台回执到达后状态会更新。', attention: false })
  })
})
