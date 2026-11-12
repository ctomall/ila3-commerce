/**
 * Account operations the products may offer (design rev2 `F1-05`): re-authorize
 * and unbind. Both reuse the installed hub routes — no second deletion path.
 *
 *  - A personal channel (`user_id` set) is deleted through the owner route, which
 *    the hub gates on `connect_user_channel` and owner match.
 *  - A tenant-wide channel has no owner, so it goes through the admin route gated
 *    on `communication_channels.admin`; the hub masks per-user channels there, so
 *    picking the wrong route can never delete somebody else's mailbox.
 *
 * There is no "pause" plan: the installed channel model has no paused state
 * (`CommunicationChannelStatus` is connected/requires_reauth/error/disconnected and
 * visibility is a sharing flag, not a switch). Offering a pause button would mean
 * inventing state the hub does not persist, so it is deliberately absent.
 */
export type ChannelForActions = {
  id: string
  providerKey?: string | null
  visibility: 'private' | 'shared'
  displayName?: string | null
}

export type DisconnectPlan = {
  method: 'DELETE'
  url: string
  permission: 'communication_channels.connect_user_channel' | 'communication_channels.admin'
  warning: string
}

export function planChannelDisconnect(channel: ChannelForActions): DisconnectPlan {
  const label = channel.displayName?.trim() || channel.providerKey || channel.id.slice(0, 8)
  if (channel.visibility === 'shared') {
    return {
      method: 'DELETE',
      url: `/api/communication_channels/admin/channels/${channel.id}`,
      permission: 'communication_channels.admin',
      warning: `解除「${label}」会影响整个团队收件箱：解除后不能再收发，历史消息保留。确定继续？`,
    }
  }
  return {
    method: 'DELETE',
    url: `/api/communication_channels/channels/${channel.id}`,
    permission: 'communication_channels.connect_user_channel',
    warning: `解除「${label}」只影响你本人：解除后不能再收发，历史消息保留。确定继续？`,
  }
}

export type ReconnectPlan =
  | { kind: 'app-connect'; href: string; note: string }
  | { kind: 'hub-profile'; note: string }

export function planChannelReconnect(channel: ChannelForActions): ReconnectPlan {
  if (channel.visibility === 'shared') {
    return {
      kind: 'app-connect',
      href: `/backend/communications/channels/connect${channel.providerKey ? `?provider=${encodeURIComponent(channel.providerKey)}` : ''}`,
      note: '重新提交该账号的授权信息；连接器会重新校验平台身份。',
    }
  }
  // Personal channels are connected from the installed profile page; sending the
  // user there avoids a second credentials form that would bypass its scope rules.
  return {
    kind: 'hub-profile',
    note: '个人渠道请到「我的资料 → 连接渠道」重新授权；工作台不重复实现个人凭据表单。',
  }
}
