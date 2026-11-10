/**
 * Pick the address a reply must be sent to.
 *
 * `external_conversations.external_conversation_id` identifies the provider
 * thread, not the correspondent: for email it is a thread reference, and only
 * chat providers happen to use the customer id as the conversation id. Sending
 * to it therefore fails email replies ("Recipient must be a valid email
 * address") and can mis-address a chat reply after a thread rename.
 *
 * The last inbound message's `sender_identifier` is the actual external party
 * (email address, WhatsApp wa_id, Messenger PSID). Fall back to the conversation
 * id only when the thread has no inbound message yet, which is the best the
 * server can do for a freshly composed conversation.
 */
export function pickReplyRecipient(
  items: Array<{ direction: string; senderIdentifier?: string | null }>,
  fallback: string,
): string {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.direction === 'inbound' && item.senderIdentifier) return item.senderIdentifier
  }
  return fallback
}
