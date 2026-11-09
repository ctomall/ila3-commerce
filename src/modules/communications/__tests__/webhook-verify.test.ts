import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'

const load = () => import('../api/webhook/verify/route')

const original = process.env.META_WEBHOOK_VERIFY_TOKEN

beforeEach(() => {
  delete process.env.META_WEBHOOK_VERIFY_TOKEN
})

afterEach(() => {
  if (original === undefined) delete process.env.META_WEBHOOK_VERIFY_TOKEN
  else process.env.META_WEBHOOK_VERIFY_TOKEN = original
})

describe('GET /api/communications/webhook/verify', () => {
  it('is 503 until the deployment configures a verify token', async () => {
    const { GET } = await load()
    const res = await GET(new Request('http://localhost/api/communications/webhook/verify?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1'))
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'WEBHOOK_VERIFY_DISABLED' })
  })

  it('echoes the raw challenge when mode and token match', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'meta-secret'
    const { GET } = await load()
    const res = await GET(new Request('http://localhost/api/communications/webhook/verify?hub.mode=subscribe&hub.verify_token=meta-secret&hub.challenge=1158201444'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    await expect(res.text()).resolves.toBe('1158201444')
  })

  it('rejects a wrong token with 403 and no challenge', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'meta-secret'
    const { GET } = await load()
    const res = await GET(new Request('http://localhost/api/communications/webhook/verify?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1'))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'verification failed' })
  })

  it('rejects a missing mode or challenge', async () => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = 'meta-secret'
    const { GET } = await load()
    const noMode = await GET(new Request('http://localhost/api/communications/webhook/verify?hub.verify_token=meta-secret&hub.challenge=1'))
    expect(noMode.status).toBe(403)
    const noChallenge = await GET(new Request('http://localhost/api/communications/webhook/verify?hub.mode=subscribe&hub.verify_token=meta-secret'))
    expect(noChallenge.status).toBe(403)
  })
})
