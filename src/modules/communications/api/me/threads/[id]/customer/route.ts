import { NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CustomerLinkError,
  customerSummary,
  findCustomerCandidates,
  readConversationCustomer,
  setConversationCustomer,
} from '../../../../../lib/customer-link'
import { resolveConversationForCaller } from '../../../../../lib/conversation-access'

/**
 * Conversation ↔ customer association (design rev2 `F4-01`).
 *
 * The customer is the installed `customers` record: this route only sets
 * `external_conversations.contact_person_id` (the hub's own column, already used
 * by inbound matching) and never creates a second customer store. The rules live
 * in `lib/customer-link.ts`; conversation authorization in `lib/conversation-access.ts`
 * (shared with the notes route and proven against a real database in S95).
 *
 * Permissions: seeing candidates is customer data, so the read needs
 * `customers.people.view`; changing the link needs `customers.people.manage`.
 * Both additionally require the inbox read grant because the conversation must be
 * authorized first.
 */
export const metadata = {
  path: '/communications/me/threads/[id]/customer',
  GET: {
    requireAuth: true,
    requireFeatures: ['communication_channels.view', 'customers.people.view'],
  },
  PUT: {
    requireAuth: true,
    requireFeatures: ['communication_channels.view', 'customers.people.manage'],
  },
}

const linkSchema = z.object({ customerId: z.string().uuid().nullable() })

function notFound() {
  return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
}

async function scopeFor(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) return null
  return {
    auth,
    tenantId: auth.tenantId as string,
    organizationId: (auth as { orgId?: string | null }).orgId ?? null,
    userId: auth.sub as string,
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const scope = await scopeFor(req)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const query = (url.searchParams.get('q') ?? '').trim()

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const conversation = await resolveConversationForCaller(
    em,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId },
    params.id,
  )
  if (!conversation) return notFound()

  const linked = await readConversationCustomer(em, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    conversation,
  })
  const candidates = await findCustomerCandidates(em, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    query,
  })

  return NextResponse.json({
    linked: linked ? customerSummary(linked) : null,
    candidates: candidates.map(customerSummary),
    /** The conversation's own handle, so the UI can hint at an exact match. */
    externalConversationId: conversation.externalConversationId,
    query,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const scope = await scopeFor(req)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = linkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'customerId must be a uuid or null', code: 'CUSTOMER_LINK_INVALID' },
      { status: 422 },
    )
  }

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const conversation = await resolveConversationForCaller(
    em,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId },
    params.id,
  )
  if (!conversation) return notFound()

  try {
    const { customer, changed } = await setConversationCustomer(em, {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      conversation,
      customerId: parsed.data.customerId,
    })
    return NextResponse.json({
      linked: customer ? customerSummary(customer) : null,
      changed,
    })
  } catch (error) {
    if (error instanceof CustomerLinkError) {
      // Same masked answer as an invisible conversation: a customer from another
      // organization must not be probeable through this endpoint.
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    throw error
  }
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'Current customer link of a conversation plus candidates matching ?q=',
      responses: [
        { status: 200, description: 'Linked customer (or null) and up to 20 candidates' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation not found or not visible' },
      ],
    },
    PUT: {
      summary: 'Link (customerId) or unlink (null) the conversation customer',
      responses: [
        { status: 200, description: 'Link applied or already in that state (changed=false)' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation or customer not visible' },
        { status: 422, description: 'customerId is neither a uuid nor null' },
      ],
    },
  },
}
