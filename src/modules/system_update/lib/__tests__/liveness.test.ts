import { describe, expect, it } from '@jest/globals'
import { reconcileLiveness } from '../liveness'

const NOW = new Date('2026-11-09T05:50:00.000Z')
const running = {
  status: 'running' as const,
  step: 'build (staging)',
  startedAt: '2026-11-09T03:15:11.239Z',
  finishedAt: null,
  message: null,
}

describe('reconcileLiveness', () => {
  it('keeps a running record while the unit is active', () => {
    const result = reconcileLiveness(running, { unitActive: true, now: NOW })
    expect(result.derived).toBe(false)
    expect(result.state?.status).toBe('running')
  })

  it('shows an inactive, timed-out record as failed instead of running', () => {
    const result = reconcileLiveness(running, { unitActive: false, now: NOW })
    expect(result.derived).toBe(true)
    expect(result.state?.status).toBe('failed')
    expect(result.state?.step).toBe('interrupted-timeout')
    expect(result.state?.message).toContain('已不在运行')
  })

  it('distinguishes an early exit from a timeout', () => {
    const early = { ...running, startedAt: '2026-11-09T05:49:00.000Z' }
    expect(reconcileLiveness(early, { unitActive: false, now: NOW }).state?.step).toBe('interrupted-exit')
  })

  it('leaves terminal states untouched', () => {
    for (const status of ['failed', 'succeeded', 'rolled-back'] as const) {
      const result = reconcileLiveness({ status, step: 'done' }, { unitActive: false, now: NOW })
      expect(result.derived).toBe(false)
      expect(result.state?.status).toBe(status)
    }
  })

  it('passes null through', () => {
    expect(reconcileLiveness(null, { unitActive: false, now: NOW })).toEqual({ state: null, derived: false })
  })

  it('treats an unparseable start time as an interrupted exit, not as still running', () => {
    const stale = { status: 'running' as const, step: 'build', startedAt: 'not-a-date' }
    const result = reconcileLiveness(stale, { unitActive: false, now: NOW })
    expect(result.state?.step).toBe('interrupted-exit')
  })

  it('honours a custom timeout', () => {
    const recent = { ...running, startedAt: '2026-11-09T05:40:00.000Z' }
    expect(reconcileLiveness(recent, { unitActive: false, now: NOW, timeoutMs: 60_000 }).state?.step).toBe(
      'interrupted-timeout',
    )
    expect(reconcileLiveness(recent, { unitActive: false, now: NOW, timeoutMs: 60 * 60 * 1000 }).state?.step).toBe(
      'interrupted-exit',
    )
  })
})
