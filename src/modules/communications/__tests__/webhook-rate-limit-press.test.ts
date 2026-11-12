import { describe, expect, it } from '@jest/globals'
import { RateLimiterService } from '@open-mercato/shared/lib/ratelimit/service'
import { checkRateLimit } from '@open-mercato/shared/lib/ratelimit/helpers'
import { WHATSAPP_WEBHOOK_RATE_LIMIT } from '../lib/webhook-rate-limit'

/**
 * S88 behaviour/pressure check on the limiter that the dispatcher will run before
 * the webhook handler (i.e. before HMAC verification).
 *
 * This measures the LIMITER, not the provider: no Meta traffic is generated and
 * nothing here claims the provider's 429-retry semantics. It answers two
 * questions the design asked for — does the configured cap actually cut off at
 * the cap, and what does enforcing it cost per request?
 */
describe('webhook rate limiter behaviour', () => {
  it('allows up to the cap, then answers 429 with Retry-After, at a measurable cost', async () => {
    const service = new RateLimiterService({ enabled: true, strategy: 'memory', keyPrefix: 'rl-probe', trustProxyDepth: 0 })
    const config = WHATSAPP_WEBHOOK_RATE_LIMIT
    const key = '203.0.113.7'

    const startedAt = process.hrtime.bigint()
    let limited = 0
    let allowed = 0
    for (let index = 0; index < config.points + 20; index += 1) {
      const rejection = await checkRateLimit(service, config, key, 'too many requests')
      if (rejection) {
        limited += 1
        if (limited === 1) {
          expect(rejection.status).toBe(429)
          expect(rejection.headers.get('Retry-After')).toBeTruthy()
          expect(rejection.headers.get('X-RateLimit-Limit')).toBe(String(config.points))
        }
      } else {
        allowed += 1
      }
    }
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6

    expect(allowed).toBe(config.points)
    expect(limited).toBe(20)
    const perRequestUs = (elapsedMs * 1000) / (config.points + 20)
    // Evidence, not a flaky assertion: the cap is enforced and costs microseconds.
    console.log(
      `[S88 probe] cap=${config.points}/${config.duration}s allowed=${allowed} limited=${limited} ` +
        `elapsed=${elapsedMs.toFixed(1)}ms perRequest=${perRequestUs.toFixed(1)}us`,
    )
    expect(perRequestUs).toBeLessThan(5000)
  })

  // Note: this pins the LIMITER's keying, not production wiring. The dispatcher
  // passes `getClientIp(req, trustProxyDepth)`, which returns null unless
  // RATE_LIMIT_TRUST_PROXY_DEPTH > 0 — so in the default deployment every webhook
  // request shares the 'global' bucket. See the slice README, "已知边界".
  it('keeps a separate bucket per key and per provider prefix', async () => {
    const service = new RateLimiterService({ enabled: true, strategy: 'memory', keyPrefix: 'rl-probe', trustProxyDepth: 0 })
    const config = { ...WHATSAPP_WEBHOOK_RATE_LIMIT, points: 2 }
    expect(await checkRateLimit(service, config, 'ip-a', 'x')).toBeNull()
    expect(await checkRateLimit(service, config, 'ip-a', 'x')).toBeNull()
    expect(await checkRateLimit(service, config, 'ip-a', 'x')).not.toBeNull()
    // Another IP, and another provider prefix, are unaffected.
    expect(await checkRateLimit(service, config, 'ip-b', 'x')).toBeNull()
    expect(
      await checkRateLimit(service, { ...config, keyPrefix: 'cc_webhook_messenger' }, 'ip-a', 'x'),
    ).toBeNull()
  })

  it('fails open when the limiter is disabled, as the framework default does in integration runs', async () => {
    const service = new RateLimiterService({ enabled: false, strategy: 'memory', keyPrefix: 'rl-probe', trustProxyDepth: 0 })
    const config = { ...WHATSAPP_WEBHOOK_RATE_LIMIT, points: 1 }
    expect(await checkRateLimit(service, config, 'ip-c', 'x')).toBeNull()
    expect(await checkRateLimit(service, config, 'ip-c', 'x')).toBeNull()
  })
})
