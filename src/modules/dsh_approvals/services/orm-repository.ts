/**
 * MikroORM persistence for DSH write approvals.
 *
 * The service methods map rows to the pure `WriteApproval` shape used by
 * `approval-store.ts`. Two behaviours are load-bearing:
 *
 *   1. `createPending` tolerates a unique-constraint race: two runs of the same
 *      employee asking for the same change at the same time must end up on one
 *      pending row, not two.
 *   2. `consume` is a single atomic UPDATE ... WHERE status='approved'. Whoever
 *      flips the row executes; everybody else gets `approval_consumed`.
 *
 * When the table is missing (migration not applied) every call throws
 * `ApprovalUnavailableError` so the bridge answers 503 `approval_unavailable`
 * instead of executing a write without a record.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import { DshAssistantBinding } from '@/modules/dsh_runs/data/entities'
import { DshWriteApproval } from '../data/entities'
import {
  APPROVAL_TTL_MS,
  decideApproval,
  pendingExpired,
  type ApprovalStatus,
  type WriteApproval,
} from './approval-store'

export class ApprovalUnavailableError extends Error {
  readonly code = 'approval_unavailable'
  constructor(cause?: unknown) {
    super('Write approval store is unavailable')
    this.name = 'ApprovalUnavailableError'
    this.cause = cause
  }
}

export type ApprovalStore = {
  /** Latest live/historic proposal for these exact arguments. */
  loadForGate(input: {
    bindingId: string
    tool: string
    argsHash: string
    now: string
  }): Promise<WriteApproval | null>
  createPending(input: {
    tenantId: string
    organizationId: string
    userId: string
    bindingId: string
    runId: string
    tool: string
    argsHash: string
    argsPreview: Record<string, unknown>
    now: string
  }): Promise<WriteApproval>
  /** Atomically claim an approved row (approved -> executing). */
  claim(input: { id: string; now: string }): Promise<boolean>
  /** Finish a claimed row: consumed on success, approved again on failure. */
  settle(input: { id: string; status: 'consumed' | 'approved'; now: string }): Promise<boolean>
  decide(input: {
    id: string
    userId: string
    tenantId: string | null
    organizationId: string | null
    decision: 'approve' | 'reject'
    now: string
  }): Promise<DecideOutcome>
  listPending(input: {
    userId: string
    tenantId: string | null
    organizationId: string | null
    now: string
    limit: number
  }): Promise<WriteApproval[]>
}

export type DecideOutcome =
  | { ok: true; approval: WriteApproval }
  | {
      ok: false
      code:
        | 'approval_not_found'
        | 'approval_forbidden'
        | 'approval_not_pending'
        | 'approval_expired'
        | 'binding_inactive'
    }

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null
}

function toRecord(row: DshWriteApproval): WriteApproval {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    userId: row.userId,
    bindingId: row.bindingId,
    runId: row.runId,
    tool: row.tool,
    argsHash: row.argsHash,
    argsPreview: (row.argsPreview ?? {}) as Record<string, unknown>,
    status: row.status as ApprovalStatus,
    requestedAt: iso(row.requestedAt) ?? new Date(0).toISOString(),
    expiresAt: iso(row.expiresAt) ?? new Date(0).toISOString(),
    decidedAt: iso(row.decidedAt),
    decidedBy: row.decidedBy ?? null,
    consumedAt: iso(row.consumedAt),
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown }
    if (candidate.code === '23505') return true
    current = candidate.cause
  }
  return false
}

function isMissingTable(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown }
    if (candidate.code === '42P01') return true
    current = candidate.cause
  }
  return false
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isUniqueViolation(error)) throw error
    if (error instanceof ApprovalUnavailableError) throw error
    throw new ApprovalUnavailableError(error)
  }
}

export function createApprovalStore(em: EntityManager): ApprovalStore {
  const fork = () => em.fork()

  return {
    async loadForGate(input) {
      return guarded(async () => {
        const manager = fork()
        const row = await manager.findOne(
          DshWriteApproval,
          { bindingId: input.bindingId, tool: input.tool, argsHash: input.argsHash },
          { orderBy: { requestedAt: 'desc' } },
        )
        if (!row) return null
        const approval = toRecord(row)
        if (pendingExpired(approval, input.now)) {
          const changed = await manager.nativeUpdate(
            DshWriteApproval,
            { id: approval.id, status: 'pending' },
            { status: 'expired' },
          )
          if (changed === 1) return { ...approval, status: 'expired' }
        }
        return approval
      })
    },

    async createPending(input) {
      try {
        const manager = fork()
        const entity = manager.create(DshWriteApproval, {
          tenantId: input.tenantId,
          organizationId: input.organizationId,
          userId: input.userId,
          bindingId: input.bindingId,
          runId: input.runId,
          tool: input.tool,
          argsHash: input.argsHash,
          argsPreview: input.argsPreview,
          status: 'pending',
          requestedAt: new Date(input.now),
          expiresAt: new Date(Date.parse(input.now) + APPROVAL_TTL_MS),
          decidedAt: null,
          decidedBy: null,
          consumedAt: null,
        })
        manager.persist(entity)
        await manager.flush()
        return toRecord(entity)
      } catch (error) {
        if (!isUniqueViolation(error)) {
          if (isMissingTable(error)) throw new ApprovalUnavailableError(error)
          throw new ApprovalUnavailableError(error)
        }
        // Another request won the race: return the live row it created.
        const manager = fork()
        const existing = await manager.findOne(DshWriteApproval, {
          bindingId: input.bindingId,
          tool: input.tool,
          argsHash: input.argsHash,
          status: { $in: ['pending', 'approved'] },
        })
        if (!existing) throw new ApprovalUnavailableError(error)
        return toRecord(existing)
      }
    },

    async claim(input) {
      return guarded(async () => {
        const manager = fork()
        const changed = await manager.nativeUpdate(
          DshWriteApproval,
          { id: input.id, status: 'approved' },
          { status: 'executing' },
        )
        return changed === 1
      })
    },

    async settle(input) {
      return guarded(async () => {
        const manager = fork()
        const changed = await manager.nativeUpdate(
          DshWriteApproval,
          { id: input.id, status: 'executing' },
          input.status === 'consumed'
            ? { status: 'consumed', consumedAt: new Date(input.now) }
            : { status: 'approved' },
        )
        return changed === 1
      })
    },

    async decide(input) {
      return guarded(async () => {
        const manager = fork()
        const row = await manager.findOne(DshWriteApproval, { id: input.id })
        if (!row) return { ok: false, code: 'approval_not_found' } as const
        if (row.userId !== input.userId) return { ok: false, code: 'approval_forbidden' } as const
        if (input.tenantId && row.tenantId !== input.tenantId) {
          return { ok: false, code: 'approval_forbidden' } as const
        }
        if (input.organizationId && row.organizationId !== input.organizationId) {
          return { ok: false, code: 'approval_forbidden' } as const
        }
        const approval = toRecord(row)
        const decision = decideApproval(approval, {
          decision: input.decision,
          decidedBy: input.userId,
          now: input.now,
        })
        if (!decision.ok) {
          if (decision.code === 'expired') {
            await manager.nativeUpdate(
              DshWriteApproval,
              { id: row.id, status: 'pending' },
              { status: 'expired' },
            )
            return { ok: false, code: 'approval_expired' } as const
          }
          return { ok: false, code: 'approval_not_pending' } as const
        }
        // A revoked/suspended binding must not be able to approve new work.
        const binding = await manager.findOne(DshAssistantBinding, { id: row.bindingId })
        if (!binding || binding.status !== 'active') {
          return { ok: false, code: 'binding_inactive' } as const
        }
        row.status = decision.status
        row.decidedAt = new Date(input.now)
        row.decidedBy = input.userId
        row.expiresAt = new Date(decision.expiresAt)
        await manager.flush()
        return { ok: true, approval: toRecord(row) } as const
      })
    },

    async listPending(input) {
      return guarded(async () => {
        const manager = fork()
        const where: Record<string, unknown> = { userId: input.userId, status: 'pending' }
        if (input.tenantId) where.tenantId = input.tenantId
        if (input.organizationId) where.organizationId = input.organizationId
        const rows = await manager.find(DshWriteApproval, where, {
          orderBy: { requestedAt: 'desc' },
          limit: input.limit,
        })
        const now = Date.parse(input.now)
        const live: WriteApproval[] = []
        for (const row of rows) {
          const approval = toRecord(row)
          const expires = Date.parse(approval.expiresAt)
          if (Number.isFinite(now) && Number.isFinite(expires) && now >= expires) {
            // Expired rows are history; hide them and record the transition.
            await manager.nativeUpdate(
              DshWriteApproval,
              { id: approval.id, status: 'pending' },
              { status: 'expired' },
            )
            continue
          }
          live.push(approval)
        }
        return live
      })
    },
  }
}

/**
 * Production wiring for one request: request-scoped EntityManager → approval
 * store. Route handlers and the tool bridge import this lazily so the pure
 * modules above stay database-free in tests.
 */
export async function createRequestApprovalStore(): Promise<ApprovalStore> {
  const { createRequestContainer } = await import('@open-mercato/shared/lib/di/container')
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  return createApprovalStore(em)
}
