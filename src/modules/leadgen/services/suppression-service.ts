/**
 * Suppression list: the write side of the control the dispatch boundary already reads.
 *
 * `leadgen_suppressions` has a partial unique index on (tenant_id, email_hash) where
 * released_at is null, so "one active suppression per address" is the database's rule,
 * not a convention. Adding an address that is already suppressed replays the existing
 * row; releasing clears `released_at` and makes the address mailable again.
 *
 * Nothing here sends anything: it only records a decision a human already made.
 */
import { recipientHashOf } from './outreach-service'

export type SuppressionReason = 'unsubscribe' | 'complaint' | 'bounce'

export type SuppressionRow = {
  id: string
  tenantId: string
  organizationId: string
  emailHash: string
  email: string
  reason: SuppressionReason
  sourceSendId: string | null
  createdAt: string
  releasedAt: string | null
}

export type SuppressionRepository = {
  findActive(input: { tenantId: string; emailHash: string }): Promise<SuppressionRow | null>
  insert(input: {
    id: string
    tenantId: string
    organizationId: string
    emailHash: string
    email: string
    reason: SuppressionReason
    sourceSendId: string | null
    now: string
  }): Promise<SuppressionRow>
  release(input: { tenantId: string; organizationId: string; emailHash: string; now: string }): Promise<number>
  list(input: { tenantId: string; limit: number }): Promise<SuppressionRow[]>
}

export type SuppressionResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'invalid_input' }

const REASONS: readonly SuppressionReason[] = ['unsubscribe', 'complaint', 'bounce']

export function isSuppressionReason(value: unknown): value is SuppressionReason {
  return typeof value === 'string' && (REASONS as readonly string[]).includes(value)
}

export function createSuppressionService(deps: {
  repo: SuppressionRepository
  now: () => string
  newId: () => string
}) {
  const { repo, now, newId } = deps

  async function add(input: {
    tenantId: string
    organizationId: string
    email: string
    reason: SuppressionReason
    sourceSendId?: string | null
  }): Promise<SuppressionResult<{ suppression: SuppressionRow; created: boolean }>> {
    const email = input.email.trim()
    if (!email.includes('@') || !isSuppressionReason(input.reason)) return { ok: false, code: 'invalid_input' }
    const emailHash = recipientHashOf(email)
    const existing = await repo.findActive({ tenantId: input.tenantId, emailHash })
    if (existing) return { ok: true, value: { suppression: existing, created: false } }
    const suppression = await repo.insert({
      id: newId(),
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      emailHash,
      email,
      reason: input.reason,
      sourceSendId: input.sourceSendId ?? null,
      now: now(),
    })
    return { ok: true, value: { suppression, created: true } }
  }

  async function release(input: {
    tenantId: string
    organizationId: string
    email: string
  }): Promise<SuppressionResult<{ released: number }>> {
    const email = input.email.trim()
    if (!email.includes('@')) return { ok: false, code: 'invalid_input' }
    const released = await repo.release({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      emailHash: recipientHashOf(email),
      now: now(),
    })
    return { ok: true, value: { released } }
  }

  async function check(input: {
    tenantId: string
    email: string
  }): Promise<SuppressionResult<{ suppressed: boolean; reason: SuppressionReason | null }>> {
    const email = input.email.trim()
    if (!email.includes('@')) return { ok: false, code: 'invalid_input' }
    const row = await repo.findActive({ tenantId: input.tenantId, emailHash: recipientHashOf(email) })
    return { ok: true, value: { suppressed: Boolean(row), reason: row?.reason ?? null } }
  }

  async function list(input: {
    tenantId: string
    limit?: number
  }): Promise<SuppressionResult<{ items: SuppressionRow[] }>> {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 200)
    const items = await repo.list({ tenantId: input.tenantId, limit })
    return { ok: true, value: { items } }
  }

  return { add, release, check, list }
}

export type SuppressionService = ReturnType<typeof createSuppressionService>
