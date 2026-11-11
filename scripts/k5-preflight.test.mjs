import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { runPreflight } from './k5-preflight.mjs'

async function withStub(handler, run) {
  const requests = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString('utf8')
    requests.push({ method: req.method, url: req.url, body, cookie: req.headers.cookie })
    const reply = handler({ method: req.method, url: req.url, body }) || { status: 404, body: {} }
    res.statusCode = reply.status
    if (reply.cookie) res.setHeader('set-cookie', reply.cookie)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(reply.body ?? {}))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  try {
    return await run({ base: `http://127.0.0.1:${port}`, requests })
  } finally {
    server.close()
    await once(server, 'close')
  }
}

const baseEnv = (ctx, extra = {}) => ({
  K5_BASE_URL: ctx.base,
  K5_EMAIL: 'admin@example.test',
  K5_PASSWORD: 'secret',
  ...extra,
})

const routes = ({ method, url }) => {
  if (url === '/api/auth/login' && method === 'POST') {
    return { status: 200, cookie: 'session=abc; HttpOnly', body: { ok: true } }
  }
  if (url === '/api/communication_channels/me/channels') {
    return { status: 200, body: { items: [{ id: 'ch-1' }] } }
  }
  if (url?.startsWith('/api/communications/me/threads')) {
    return { status: 200, body: { items: [{ channelId: '11111111-1111-4111-8111-111111111111' }] } }
  }
  if (url === '/api/communications/me/send' && method === 'POST') {
    return { status: 202, body: { messageId: 'm-1' } }
  }
  return { status: 404, body: { error: 'not found' } }
}

test('dry-run only logs in and reads; never calls send', async () => {
  await withStub(routes, async (ctx) => {
    const result = await runPreflight({ env: baseEnv(ctx) })
    assert.equal(result.mode, 'dry-run')
    assert.equal(result.login, 200)
    assert.equal(result.channels, 1)
    assert.equal(result.sent, null)
    assert.equal(ctx.requests.filter((r) => r.url === '/api/communications/me/send').length, 0)
  })
})

test('send mode refuses without the explicit approval flag', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_RECIPIENT: '+15550000001', K5_ALLOWED_RECIPIENTS: '+15550000001',
      K5_CHANNEL_ID: '11111111-1111-4111-8111-111111111111',
    })
    await assert.rejects(() => runPreflight({ env }), /K5_ALLOW_SEND/)
    assert.equal(ctx.requests.filter((r) => r.url === '/api/communications/me/send').length, 0)
  })
})

test('send mode rejects a recipient outside the allowlist', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_ALLOW_SEND: '1', K5_RECIPIENT: '+15550000002',
      K5_ALLOWED_RECIPIENTS: '+15550000001',
      K5_CHANNEL_ID: '11111111-1111-4111-8111-111111111111',
    })
    await assert.rejects(() => runPreflight({ env }), /ALLOWED_RECIPIENTS/)
    assert.equal(ctx.requests.filter((r) => r.url === '/api/communications/me/send').length, 0)
  })
})

test('send mode refuses a channel id that is not visible in the thread list', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_ALLOW_SEND: '1', K5_RECIPIENT: '+15550000001',
      K5_ALLOWED_RECIPIENTS: '+15550000001',
      K5_CHANNEL_ID: '22222222-2222-4222-8222-222222222222',
    })
    await assert.rejects(() => runPreflight({ env }), /not visible/)
    assert.equal(ctx.requests.filter((r) => r.url === '/api/communications/me/send').length, 0)
  })
})

test('thread reply requires both threadId and parentMessageId together', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_ALLOW_SEND: '1', K5_RECIPIENT: '+15550000001',
      K5_ALLOWED_RECIPIENTS: '+15550000001',
      K5_CHANNEL_ID: '11111111-1111-4111-8111-111111111111',
      K5_THREAD_ID: '33333333-3333-4333-8333-333333333333',
    })
    await assert.rejects(() => runPreflight({ env }), /provided together/)
    assert.equal(ctx.requests.filter((r) => r.url === '/api/communications/me/send').length, 0)
  })
})

test('send mode posts one idempotent request to an allowlisted recipient', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_ALLOW_SEND: '1', K5_RECIPIENT: '+15550000001',
      K5_ALLOWED_RECIPIENTS: '+15550000001,+15550000003',
      K5_CHANNEL_ID: '11111111-1111-4111-8111-111111111111',
    })
    const result = await runPreflight({ env })
    assert.equal(result.sent, 202)
    assert.match(result.clientRequestId, /^[0-9a-f-]{36}$/i)
    const sends = ctx.requests.filter((r) => r.url === '/api/communications/me/send')
    assert.equal(sends.length, 1)
    const payload = JSON.parse(sends[0].body)
    assert.deepEqual(payload.to, ['+15550000001'])
    assert.equal(payload.clientRequestId, result.clientRequestId)
    assert.match(sends[0].cookie, /session=abc/)
  })
})

test('thread reply carries threadId and parentMessageId when both are provided', async () => {
  await withStub(routes, async (ctx) => {
    const env = baseEnv(ctx, {
      K5_MODE: 'send', K5_ALLOW_SEND: '1', K5_RECIPIENT: '+15550000001',
      K5_ALLOWED_RECIPIENTS: '+15550000001',
      K5_CHANNEL_ID: '11111111-1111-4111-8111-111111111111',
      K5_THREAD_ID: '33333333-3333-4333-8333-333333333333',
      K5_PARENT_MESSAGE_ID: '44444444-4444-4444-8444-444444444444',
    })
    await runPreflight({ env })
    const sends = ctx.requests.filter((r) => r.url === '/api/communications/me/send')
    assert.equal(sends.length, 1)
    const payload = JSON.parse(sends[0].body)
    assert.equal(payload.threadId, '33333333-3333-4333-8333-333333333333')
    assert.equal(payload.parentMessageId, '44444444-4444-4444-8444-444444444444')
  })
})
