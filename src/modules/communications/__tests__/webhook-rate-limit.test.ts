import { afterEach, describe, expect, it, jest } from '@jest/globals'

/**
 * S88 / design rev2 F8-04 (D-6): both provider webhooks declare a rate limit on
 * their route metadata, which the API dispatcher enforces before the handler —
 * i.e. before HMAC verification, the only point where untrusted traffic can be
 * shed cheaply.
 *
 * The limits live in `lib/webhook-rate-limit.ts` so this contract can be pinned
 * without importing the heavy route modules (queue, ORM, adapters).
 */
describe('webhook rate limits', () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_CC_WEBHOOK_WHATSAPP_POINTS
    delete process.env.RATE_LIMIT_CC_WEBHOOK_WHATSAPP_DURATION
    jest.resetModules()
  })

  it('defaults to a generous per-IP cap instead of a token one', async () => {
    const { MESSENGER_WEBHOOK_RATE_LIMIT, WHATSAPP_WEBHOOK_RATE_LIMIT } = await import(
      '../lib/webhook-rate-limit'
    )
    expect(WHATSAPP_WEBHOOK_RATE_LIMIT).toMatchObject({
      points: 1200,
      duration: 60,
      keyPrefix: 'cc_webhook_whatsapp',
    })
    expect(MESSENGER_WEBHOOK_RATE_LIMIT).toMatchObject({
      points: 1200,
      duration: 60,
      keyPrefix: 'cc_webhook_messenger',
    })
  })

  it('keeps the two providers in separate buckets', async () => {
    const { MESSENGER_WEBHOOK_RATE_LIMIT, WHATSAPP_WEBHOOK_RATE_LIMIT } = await import(
      '../lib/webhook-rate-limit'
    )
    expect(WHATSAPP_WEBHOOK_RATE_LIMIT.keyPrefix).not.toBe(MESSENGER_WEBHOOK_RATE_LIMIT.keyPrefix)
  })

  it('honours the env override used to tighten the cap after observation', async () => {
    process.env.RATE_LIMIT_CC_WEBHOOK_WHATSAPP_POINTS = '7'
    process.env.RATE_LIMIT_CC_WEBHOOK_WHATSAPP_DURATION = '30'
    jest.resetModules()
    const { WHATSAPP_WEBHOOK_RATE_LIMIT } = await import('../lib/webhook-rate-limit')
    expect(WHATSAPP_WEBHOOK_RATE_LIMIT).toMatchObject({ points: 7, duration: 30 })
  })

  it('is wired into both webhook route metadata', async () => {
    // Read the source instead of importing the routes: they pull the queue, ORM and
    // adapters, and this assertion is about the wiring, not their behaviour.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    for (const [file, constant] of [
      ['src/modules/communications/api/webhook/whatsapp/route.ts', 'WHATSAPP_WEBHOOK_RATE_LIMIT'],
      ['src/modules/communications/api/webhook/messenger/route.ts', 'MESSENGER_WEBHOOK_RATE_LIMIT'],
    ] as const) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source).toContain(constant)
      expect(source).toMatch(/rateLimit:\s*[A-Z_]+_WEBHOOK_RATE_LIMIT/)
      expect(source).toMatch(/requireAuth:\s*false/)
    }
  })
})
