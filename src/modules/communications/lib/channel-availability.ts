/**
 * Per-channel "can we receive / can we send" state (design rev2 `F8-05`).
 *
 * The inbox used to render an empty conversation list for a channel that can
 * never receive anything (Resend/SES are outbound-only in this build) or for a
 * disconnected account, which reads as "no messages" instead of "this account
 * cannot receive". This module derives an explicit state from facts the process
 * actually knows:
 *
 *  - the channel's own lifecycle status,
 *  - whether the provider has an inbound path in this build,
 *  - whether WhatsApp/Messenger can pin the webhook to this account
 *    (`externalIdentifier`), and
 *  - whether a connector adapter is registered in this process.
 *
 * It deliberately does NOT probe provider egress. A network block (for example
 * `graph.facebook.com` being unreachable) is an operations fact, not local state;
 * claiming otherwise here would go stale the moment egress is opened or blocked.
 * The hint text says what the operator can do instead.
 */
export type AvailabilityCode =
  | 'ready'
  | 'not_connected'
  | 'requires_reauth'
  | 'channel_error'
  | 'paused'
  | 'provider_has_no_inbound'
  | 'missing_account_identity'
  | 'adapter_missing'

export type Availability = { available: boolean; code: AvailabilityCode; hint: string }

/** Providers that can deliver inbound events in this build (see D3 platform matrix). */
export const INBOUND_CAPABLE_PROVIDERS = new Set(['whatsapp-business', 'messenger', 'gmail', 'imap'])

/** Providers whose webhook is pinned to one account id, so an unnamed channel cannot receive. */
const ACCOUNT_PINNED_PROVIDERS = new Set(['whatsapp-business', 'messenger'])

function normalizedStatus(status: string | null | undefined): string {
  return (status ?? '').toLowerCase()
}

function statusGate(status: string | null | undefined): Availability | null {
  switch (normalizedStatus(status)) {
    case 'connected':
      return null
    case 'requires_reauth':
      return { available: false, code: 'requires_reauth', hint: '授权已失效：请重新连接该账号后再收/发。' }
    case 'error':
      return { available: false, code: 'channel_error', hint: '账号处于错误状态：先查看最近错误并重连。' }
    case 'paused':
      return { available: false, code: 'paused', hint: '账号已暂停：恢复后才会收/发。' }
    default:
      return { available: false, code: 'not_connected', hint: '账号尚未连接完成：先完成授权。' }
  }
}

export function describeChannelAvailability(input: {
  providerKey: string | null | undefined
  channelType: string | null | undefined
  status: string | null | undefined
  externalIdentifier: string | null | undefined
  adapterRegistered: boolean
}): { inbound: Availability; outbound: Availability } {
  const providerKey = (input.providerKey ?? '').toLowerCase()
  const channelType = (input.channelType ?? '').toLowerCase()

  const inboundStatus = statusGate(input.status)
  let inbound: Availability
  if (inboundStatus) {
    inbound = inboundStatus
  } else if (!INBOUND_CAPABLE_PROVIDERS.has(providerKey)) {
    inbound = {
      available: false,
      code: 'provider_has_no_inbound',
      hint: '该渠道在此版本只支持发送，收不到客户来信；需要收信请接入带入站能力的邮箱或 IM 渠道。',
    }
  } else if (ACCOUNT_PINNED_PROVIDERS.has(providerKey) && !input.externalIdentifier) {
    inbound = {
      available: false,
      code: 'missing_account_identity',
      hint: '缺少平台账号标识，webhook 无法确定归属；请重新保存该账号的授权信息。',
    }
  } else {
    inbound = { available: true, code: 'ready', hint: '入站已就绪。' }
  }

  const outboundStatus = statusGate(input.status)
  let outbound: Availability
  if (outboundStatus) {
    outbound = outboundStatus
  } else if (!input.adapterRegistered) {
    outbound = {
      available: false,
      code: 'adapter_missing',
      hint: '当前进程未加载该渠道的连接器：重启应用后再试，仍失败需检查部署。',
    }
  } else {
    outbound = {
      available: true,
      code: 'ready',
      hint: channelType === 'email' ? '出站已就绪（发送结果以平台回执为准）。' : '出站已就绪。',
    }
  }

  return { inbound, outbound }
}
