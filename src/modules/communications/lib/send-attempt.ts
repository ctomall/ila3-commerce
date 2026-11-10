/**
 * Client-side idempotency bookkeeping for the web reply box.
 *
 * The server binds a clientRequestId to its payload: a retry with the same key
 * and payload replays the first result, a different payload is a conflict, and
 * an unknown outcome (network drop / 5xx) keeps the claim so a blind retry with
 * a NEW key could send twice. These helpers keep that decision testable.
 */
export type SendAttempt = {
  clientRequestId: string
  /** Everything that changes the sent message; a different one is a new send. */
  signature: string
  /** True while the last attempt ended without a definitive server answer. */
  unknown: boolean
}

export type AttemptDecision =
  | { blocked: string }
  | { clientRequestId: string; attempt: SendAttempt }

export function decideAttempt(previous: SendAttempt | null, signature: string, makeId: () => string): AttemptDecision {
  if (previous && previous.unknown && previous.signature !== signature) {
    return {
      blocked:
        '上一条发送结果未知：请恢复原内容后用同一 clientRequestId 重试；确需新内容时，请先核对上一条是否已送达。',
    }
  }
  if (previous && previous.signature === signature) {
    return {
      clientRequestId: previous.clientRequestId,
      attempt: { ...previous, unknown: false },
    }
  }
  const clientRequestId = makeId()
  return {
    clientRequestId,
    attempt: { clientRequestId, signature, unknown: false },
  }
}

export type AttemptAfterResponse = 'clear' | 'keep' | 'keep-unknown'

/** Definitive answers (2xx, 4xx other than a possibly-live 409) free the key. */
export function attemptAfterResponse(status: number): AttemptAfterResponse {
  if (status >= 200 && status < 300) return 'clear'
  if (status >= 400 && status < 500 && status !== 409) return 'clear'
  if (status === 409) return 'keep'
  return 'keep-unknown'
}
