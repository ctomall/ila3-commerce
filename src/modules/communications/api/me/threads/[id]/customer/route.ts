import { NextResponse } from 'next/server'
import type { EntityManager, FilterQuery } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import {
  CommunicationChannel,
  ExternalConversation,
} from '@open-mercato/core/modules/communication_channels/data/entities'
import { channelOrgScopeWhere } from '@open-mercato/core/modules/communication_channels/lib/access-control'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'

/**
 * Conversation ↔ customer association (design rev2 `F4-01`).
 *
 * The customer is the installed `customers` record: this route only sets
 * `external_conversations.contact_person_id` (the hub's own column, already used
 * by inbound matching) and never creates a second customer store. Candidates are
 * read from `customers` with the caller's tenant/organization scope.
 *
 * Permissions: seeing candidates is customer data, so the read needs
 * `customers.people.view`; changing the link needs `customers.people.manage`.
 * Both additionally require the inbox read grant because the conversation must be
 * authorized first. Compare last-write-wins on this single column is acceptable
 * (there is no optimistic version on the hub entity) and an idempotent no-op when
 * the value already matches.
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

const MAX_CANDIDATES = 20
const MIN_QUERY = 2

const linkSchema = z.object({ customerId: z.string().uuid().nullable() })

type CustomerSummary = { id: string; displayName: string; kind: string; primaryEmail: string | null; primaryPhone: string | null }

function summary(customer: CustomerEntity): CustomerSummary {
  return {
    id: String(customer.id),
    displayName: customer.displayName ?? '',
    kind: customer.kind ?? 'person',
    primaryEmail: customer.primaryEmail ?? null,
    primaryPhone: customer.primaryPhone ?? null,
  }
}

async function resolveConversation(
  em: EntityManager,
  tenantId: string,
  organizationId: string | null,
  userId: string,
  conversationId: string,
): Promise<ExternalConversation | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null
  let conversation: ExternalConversation | null
  try {
    conversation = await em.findOne(ExternalConversation, {
      id: conversationId,
      tenantId,
      ...channelOrgScopeWhere(organizationId),
    } as FilterQuery<ExternalConversation>)
  } catch (err) {
    if ((err as { code?: string }).code === '22P02') return null
    throw err
  }
  if (!conversation) return null
  const channel = await em.findOne(CommunicationChannel, {
    id: conversation.channelId,
    tenantId,
    deletedAt: null,
    ...channelOrgScopeWhere(organizationId),
  } as FilterQuery<CommunicationChannel>)
  if (!channel || (channel.userId != null && channel.userId !== userId)) return null
  return conversation
}

function notFound() {
  return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
}

/** Customer search scope: same tenant, and the caller's organization when it has one. */
function customerScope(tenantId: string, organizationId: string | null): Record<string, unknown> {
  return {
    tenantId,
    deletedAt: null,
    ...(organizationId ? { organizationId } : {}),
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const url = new URL(req.url)
  const query = (url.searchParams.get('q') ?? '').trim()

  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const conversation = await resolveConversation(em, tenantId, organizationId, auth.sub as string, params.id)
  if (!conversation) return notFound()

  const linked = conversation.contactPersonId
    ? await em.findOne(CustomerEntity, {
        id: conversation.contactPersonId,
        ...customerScope(tenantId, organizationId),
      } as never)
    : null

  let candidates: CustomerSummary[] = []
  if (query.length >= MIN_QUERY) {
    const pattern = `%${query.replace(/[%_]/g, (char) => `\\${char}`)}%`
    const rows = await em.find(
      CustomerEntity,
      {
        ...customerScope(tenantId, organizationId),
        $or: [
          { displayName: { $ilike: pattern } },
          { primaryEmail: { $ilike: pattern } },
          { primaryPhone: { $like: pattern } },
        ],
      } as never,
      { limit: MAX_CANDIDATES, orderBy: { displayName: 'asc' } },
    )
    candidates = rows.map((row) => summary(row))
  }

  return NextResponse.json({
    linked: linked ? summary(linked) : null,
    candidates,
    /** The conversation's own handle, so the UI can hint at an exact match. */
    externalConversationId: conversation.externalConversationId,
    query,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = linkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'customerId must be a uuid or null', code: 'CUSTOMER_LINK_INVALID' },
      { status: 422 },
    )
  }
  const tenantId = auth.tenantId as string
  const organizationId = (auth as { orgId?: string | null }).orgId ?? null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const conversation = await resolveConversation(em, tenantId, organizationId, auth.sub as string, params.id)
  if (!conversation) return notFound()

  const customerId = parsed.data.customerId
  if (customerId === null) {
    if (conversation.contactPersonId != null) {
      conversation.contactPersonId = null
      await em.flush()
    }
    return NextResponse.json({ linked: null })
  }

  const customer = await em.findOne(CustomerEntity, {
    id: customerId,
    ...customerScope(tenantId, organizationId),
  } as never)
  if (!customer) {
    // Same masked answer as a conversation the caller cannot see: a customer from
    // another organization must not be probeable through this endpoint.
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }
  if (conversation.contactPersonId !== customerId) {
    conversation.contactPersonId = customerId
    await em.flush()
  }
  return NextResponse.json({ linked: summary(customer) })
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
        { status: 200, description: 'Link applied or already in that state' },
        { status: 401, description: 'Unauthorized' },
        { status: 404, description: 'Conversation or customer not visible' },
        { status: 422, description: 'customerId is neither a uuid nor null' },
      ],
    },
  },
}
