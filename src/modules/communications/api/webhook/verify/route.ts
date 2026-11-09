import { NextResponse } from 'next/server'

export const metadata = {
  path: '/communications/webhook/verify',
  GET: { requireAuth: false },
}

/**
 * Meta webhook subscription check (`GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`).
 *
 * The communication_channels hub's generic webhook route is POST-only, but Meta
 * verifies a subscription with a GET that Echoes `hub.challenge` only when the
 * verify token matches. This endpoint is the G1 gap from ADR-005: it is
 * deliberately read-only, touches no database, and answers 503 when the deployment
 * has not configured a verify token — an unconfigured deployment must not appear
 * subscribable to the platform.
 */
export async function GET(req: Request): Promise<Response> {
  const expected = (process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim()
  if (!expected) {
    return NextResponse.json(
      { error: 'verify token not configured', code: 'WEBHOOK_VERIFY_DISABLED' },
      { status: 503 },
    )
  }
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode') ?? ''
  const token = url.searchParams.get('hub.verify_token') ?? ''
  const challenge = url.searchParams.get('hub.challenge') ?? ''
  if (mode !== 'subscribe' || token !== expected || challenge.length === 0) {
    return NextResponse.json({ error: 'verification failed' }, { status: 403 })
  }
  // Meta expects the raw challenge string, not JSON.
  return new Response(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export const openApi = {
  tags: ['Communications'],
  methods: {
    GET: {
      summary: 'Meta webhook subscription verification (hub.challenge echo)',
      tags: ['Communications'],
      responses: [
        { status: 200, description: 'challenge echoed as text/plain' },
        { status: 403, description: 'mode/token mismatch' },
        { status: 503, description: 'META_WEBHOOK_VERIFY_TOKEN is not configured' },
      ],
    },
  },
}
