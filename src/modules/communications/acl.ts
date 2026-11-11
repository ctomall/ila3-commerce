/**
 * Reply capability for the CRM inbox.
 *
 * Reading the inbox is `communication_channels.view` (the installed hub
 * feature). Replying is its own grant: many staff should answer customers
 * without being able to connect a mailbox or a WhatsApp account, and
 * `connect_user_channel` must not double as a read/reply permission.
 *
 * `communication_channels.connect_user_channel` is still accepted by
 * `canReply()` as a compatibility grant until every role that answers
 * customers has `communications.reply`; the route comment names that bridge.
 */
export const features = [
  {
    id: 'communications.reply',
    title: 'Reply to customer conversations from the shared inbox',
    module: 'communications',
  },
] as const

export default features
