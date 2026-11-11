/**
 * Owner filter for the assistant conversation list.
 *
 * The packaged list returns every conversation the caller may read, and the UI
 * auto-opens the first one. For an admin that can be another employee's private
 * conversation, which the composer then refuses (isOwner=false) — the assistant
 * looks broken until the user deep-links their own thread. Under the DSH engine
 * the list is filtered to conversations the caller owns (or that are shared).
 *
 * Auth and feature checks stay in the packaged handler; this wrapper only trims
 * its successful response.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'

type Packaged = { GET: (request: NextRequest) => Promise<Response> }
type Item = { conversationId?: unknown }

export async function GET(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mod = (await import(
    '@open-mercato/ai-assistant/modules/ai_assistant/api/ai/conversations/route'
  )) as unknown as Packaged
  const response = await mod.GET(req)
  if (!response.ok) return response

  let payload: { items?: Item[] } & Record<string, unknown>
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    return response
  }
  const items = Array.isArray(payload.items) ? payload.items : []
  const ids = items
    .map((item) => item.conversationId)
    .filter((id): id is string => typeof id === 'string')

  if (ids.length === 0) return NextResponse.json(payload)

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const rows = (await em.getConnection().execute(
      'select conversation_id, owner_user_id, visibility from ai_chat_conversations where conversation_id = any($1::text[])',
      [ids],
    )) as Array<{ conversation_id: string; owner_user_id: string | null; visibility: string | null }>
    const byId = new Map(rows.map((row) => [row.conversation_id, row]))
    payload.items = items.filter((item) => {
      const row = typeof item.conversationId === 'string' ? byId.get(item.conversationId) : undefined
      if (!row) return true
      if (row.visibility !== 'private') return true
      return row.owner_user_id === auth.sub
    })
  } catch {
    return NextResponse.json(payload)
  }
  return NextResponse.json(payload)
}
