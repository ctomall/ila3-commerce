/**
 * Conversation ↔ customer link helpers (design rev2 `F4-01`).
 *
 * The link is the hub conversation's existing `contactPersonId`; the customer is
 * the installed `customers` record. This module owns the two rules the routes and
 * the real-DB runner must agree on:
 *
 *  - a customer outside the caller's tenant/organization scope is indistinguishable
 *    from a missing one (409/404 must not become an existence oracle);
 *  - re-linking the same customer is a no-op, so an idle click does not stamp
 *    `updated_at` and does not claim a change that did not happen.
 */
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { ExternalConversation } from '@open-mercato/core/modules/communication_channels/data/entities'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'

export const MIN_CANDIDATE_QUERY = 2
export const MAX_CANDIDATES = 20

export class CustomerLinkError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CustomerLinkError'
    this.status = status
    this.code = code
  }
}

function customerScope(tenantId: string, organizationId: string | null): Record<string, unknown> {
  return {
    tenantId,
    deletedAt: null,
    ...(organizationId ? { organizationId } : {}),
  }
}

/** Escape LIKE metacharacters so a user's `100%` is a literal, not a wildcard. */
export function candidatePattern(query: string): string {
  return `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`
}

export async function findCustomerCandidates(
  em: EntityManager,
  input: { tenantId: string; organizationId: string | null; query: string; limit?: number },
): Promise<CustomerEntity[]> {
  const query = input.query.trim()
  if (query.length < MIN_CANDIDATE_QUERY) return []
  const pattern = candidatePattern(query)
  return em.find(
    CustomerEntity,
    {
      ...customerScope(input.tenantId, input.organizationId),
      $or: [
        { displayName: { $ilike: pattern } },
        { primaryEmail: { $ilike: pattern } },
        { primaryPhone: { $like: pattern } },
      ],
    } as never,
    {
      limit: Math.min(Math.max(input.limit ?? MAX_CANDIDATES, 1), MAX_CANDIDATES),
      orderBy: { displayName: 'asc' },
    },
  )
}

export async function readConversationCustomer(
  em: EntityManager,
  input: { tenantId: string; organizationId: string | null; conversation: ExternalConversation },
): Promise<CustomerEntity | null> {
  const contactPersonId = input.conversation.contactPersonId
  if (!contactPersonId) return null
  return em.findOne(CustomerEntity, {
    id: contactPersonId,
    ...customerScope(input.tenantId, input.organizationId),
  } as never)
}

/**
 * Apply a link (`customerId`) or unlink (`null`). Returns the customer and whether
 * a write happened; out-of-scope customers raise `CUSTOMER_NOT_FOUND`.
 */
export async function setConversationCustomer(
  em: EntityManager,
  input: {
    tenantId: string
    organizationId: string | null
    /** A conversation already authorized by the caller (see conversation-access.ts). */
    conversation: ExternalConversation
    customerId: string | null
  },
): Promise<{ customer: CustomerEntity | null; changed: boolean }> {
  // Re-attach to THIS entity manager before writing: the authorization step may
  // have used a different fork (and a detached entity would accept the property
  // assignment while flush silently persists nothing). The id lookup is scoped by
  // tenant; channel ownership was already enforced by the caller.
  const conversation = await em.findOne(ExternalConversation, {
    id: input.conversation.id,
    tenantId: input.tenantId,
  } as never)
  if (!conversation) {
    throw new CustomerLinkError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found')
  }
  if (input.customerId === null) {
    if (conversation.contactPersonId == null) return { customer: null, changed: false }
    conversation.contactPersonId = null
    await em.flush()
    return { customer: null, changed: true }
  }

  const customer = await em.findOne(CustomerEntity, {
    id: input.customerId,
    ...customerScope(input.tenantId, input.organizationId),
  } as never)
  if (!customer) {
    throw new CustomerLinkError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found')
  }
  if (conversation.contactPersonId === input.customerId) {
    return { customer, changed: false }
  }
  conversation.contactPersonId = input.customerId
  await em.flush()
  return { customer, changed: true }
}

export function customerSummary(customer: CustomerEntity): {
  id: string
  displayName: string
  kind: string
  primaryEmail: string | null
  primaryPhone: string | null
} {
  return {
    id: String(customer.id),
    displayName: customer.displayName ?? '',
    kind: customer.kind ?? 'person',
    primaryEmail: customer.primaryEmail ?? null,
    primaryPhone: customer.primaryPhone ?? null,
  }
}
