/**
 * Pre-verification rate limits for the provider webhooks (design rev2 `F8-04`, D-6).
 *
 * The API dispatcher enforces `metadata.rateLimit` BEFORE the handler runs, which
 * is the only place untrusted webhook traffic can be shed cheaply — the handler
 * itself must verify the HMAC before it trusts anything, so it cannot rate-limit
 * on an account dimension yet. The dispatcher keys by client IP.
 *
 * Defaults are deliberately generous: every WhatsApp/Messenger event arrives from
 * Meta's small IP set, so a tight per-IP cap would throttle a busy tenant rather
 * than junk. The provider's 429-retry behaviour is unverified, so a low cap risks
 * silently losing legitimate deliveries. Tune from measurement, not from taste:
 * `RATE_LIMIT_CC_WEBHOOK_WHATSAPP_{POINTS,DURATION,BLOCK_DURATION}` and the
 * `..._MESSENGER_...` equivalents (see `readEndpointRateLimitConfig`).
 */
import { readEndpointRateLimitConfig } from '@open-mercato/shared/lib/ratelimit/config'

export const WHATSAPP_WEBHOOK_RATE_LIMIT = readEndpointRateLimitConfig('CC_WEBHOOK_WHATSAPP', {
  points: 1200,
  duration: 60,
  keyPrefix: 'cc_webhook_whatsapp',
})

export const MESSENGER_WEBHOOK_RATE_LIMIT = readEndpointRateLimitConfig('CC_WEBHOOK_MESSENGER', {
  points: 1200,
  duration: 60,
  keyPrefix: 'cc_webhook_messenger',
})
