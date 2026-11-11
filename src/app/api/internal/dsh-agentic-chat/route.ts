/**
 * Bridges the UI's AI-SDK agent chat surface (`/api/ai_assistant/ai/chat`) to
 * the CRM's DSH engine.
 *
 * The packaged UI speaks the AI SDK UI-message stream (text-start/delta/end).
 * DSH already streams its own SSE through `/api/internal/ai-assistant-dsh-chat`;
 * this handler forwards the turn there and re-frames only the text events into
 * an AI-SDK stream. Tool cards/approvals are not translated yet, so the bridge
 * is gated behind OM_DSH_AGENTIC and can be rolled back without a build.
 */
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'

type ChatBody = {
  messages?: Array<{ role?: string; content?: unknown }>
  sessionId?: string
}

function promptFrom(body: ChatBody): string {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const lines: string[] = []
  for (const message of messages.slice(-10)) {
    if (typeof message.content !== 'string' || message.content.trim() === '') continue
    const role = message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'User'
    lines.push(`${role}: ${message.content.trim()}`)
  }
  return lines.join('\n\n').slice(0, 12_000)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.sub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: ChatBody
  try {
    body = (await req.json()) as ChatBody
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }
  const prompt = promptFrom(body)
  if (!prompt) return NextResponse.json({ error: 'messages must include text' }, { status: 400 })

  const target = new URL('/api/internal/ai-assistant-dsh-chat', req.nextUrl.origin)
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        cookie: req.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        idempotencyKey: randomUUID(),
      }),
    })
  } catch {
    return NextResponse.json({ error: 'DSH bridge unavailable' }, { status: 502 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'DSH engine rejected the turn' }, { status: 502 })
  }

  const id = `t-${randomUUID()}`
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: 'text-start', id })
      const reader = upstream.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl = buffer.indexOf('\n')
          while (nl >= 0) {
            const line = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            nl = buffer.indexOf('\n')
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload) continue
            try {
              const event = JSON.parse(payload) as { type?: string; content?: unknown }
              if (event.type === 'text' && typeof event.content === 'string' && event.content) {
                writer.write({ type: 'text-delta', id, delta: event.content })
              }
            } catch {
              // Non-JSON keepalives are intentionally ignored.
            }
          }
        }
      } finally {
        writer.write({ type: 'text-end', id })
        reader.releaseLock()
      }
    },
  })

  return createUIMessageStreamResponse({ stream })
}
