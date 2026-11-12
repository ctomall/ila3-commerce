/**
 * Caller pass-through metadata for an outbound send.
 *
 * The hub merges caller metadata FIRST and then overwrites the validated routing
 * fields (`to`/`cc`/`bcc`/`subject`/`inReplyTo`/`references`), and the delivery
 * command reads `link.channelMetadata.to` to address a provider-native channel.
 * That means the only thing standing between a smuggled `to` and a redirect is
 * the hub's merge order — an internal detail of an installed package we do not
 * own. Strip the routing keys here as defence in depth, so the BFF never hands a
 * caller-controlled recipient/threading field to the hub in the first place.
 *
 * Non-routing keys stay intact: downstream subscribers legitimately anchor the
 * sent message to a CRM person or set a visibility flag through them.
 */

/** Fields the hub validates and sets itself; a caller must never supply them. */
const ROUTING_METADATA_KEYS = [
  'to',
  'cc',
  'bcc',
  'subject',
  'inReplyTo',
  'references',
  'from',
  'replyTo',
  'replyToExternalId',
  'messageReferenceId',
  'externalThreadRef',
] as const

export function sanitizeCallerChannelMetadata(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {}
  const clean: Record<string, unknown> = { ...input }
  for (const key of ROUTING_METADATA_KEYS) {
    delete clean[key]
  }
  return clean
}
