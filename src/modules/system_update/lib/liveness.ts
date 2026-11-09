/**
 * Does a recorded "running" still describe a running update?
 *
 * On 2026-11-09 the one-shot updater was killed by systemd's start timeout at 03:45, but
 * `.mercato/system-update/state.json` kept saying `status: "running" / step: "build
 * (staging)"` for two hours: the process that would have written the final state was the
 * one that died. Anyone reading the page during that window saw an update that had already
 * failed. The state file has since been reconciled by hand; this makes the display correct
 * *by derivation* so it does not need a human again.
 *
 * The rule: a `running` record is only shown as running while the unit is actually active.
 * Otherwise it is shown as interrupted with the reason, and the stored record is left
 * untouched — the audit trail keeps what was written, the page shows what is true.
 */

export type UpdateRunState = 'running' | 'succeeded' | 'failed' | 'rolled-back'

export type LivenessState = {
  status: UpdateRunState
  step?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  message?: string | null
}

export type LivenessInput = {
  unitActive: boolean
  now: Date
  /** systemd TimeoutStartSec for the update unit. 30 minutes matches the unit file. */
  timeoutMs?: number
}

export type LivenessResult<T extends LivenessState> = {
  state: T | null
  /** True when the displayed status is derived rather than read from the record. */
  derived: boolean
}

export const DEFAULT_UPDATE_TIMEOUT_MS = 30 * 60 * 1000

export function reconcileLiveness<T extends LivenessState>(
  state: T | null,
  input: LivenessInput,
): LivenessResult<T> {
  if (!state) return { state: null, derived: false }
  if (state.status !== 'running') return { state, derived: false }
  if (input.unitActive) return { state, derived: false }

  const startedAt = state.startedAt ? Date.parse(state.startedAt) : Number.NaN
  const now = input.now.getTime()
  const timeoutMs = input.timeoutMs ?? DEFAULT_UPDATE_TIMEOUT_MS
  const overTimeout = Number.isFinite(startedAt) && now - startedAt > timeoutMs
  const reason = overTimeout
    ? `更新进程已不在运行（systemd 超时或中断），已超过 ${Math.round(timeoutMs / 60000)} 分钟未完成；以下按失败展示，原记录保留在 state.json`
    : '更新进程已退出但没有写入结束状态；以下按失败展示，原记录保留在 state.json'

  return {
    state: {
      ...state,
      status: 'failed',
      step: overTimeout ? 'interrupted-timeout' : 'interrupted-exit',
      finishedAt: state.finishedAt ?? null,
      message: reason,
    },
    derived: true,
  }
}
