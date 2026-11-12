/**
 * Email reply headers, derived from the verified parent (design rev2 `F3-10`).
 *
 * The installed delivery command resolves a chat reply target but never writes
 * `In-Reply-To`; the email converter only forwards what it finds in
 * `channelMetadata`. Caller-supplied `inReplyTo`/`references` are stripped by
 * `sanitizeCallerChannelMetadata`, so the BFF must supply them — from the parent
 * row it already verified belongs to the claimed conversation, and only for
 * email channels. This keeps the header unspoofable by a caller.
 *
 * Values are passed through as the provider stored them; `assembleRfc2822`
 * applies brackets exactly once, so a bracketed or stripped id both work.
 */
export type EmailReplyMetadata = {
  inReplyTo?: string
  references?: string[]
}

export function buildEmailReplyMetadata(input: {
  parentExternalMessageId: string | null | undefined
  channelType: string | null | undefined
}): EmailReplyMetadata {
  const parent = typeof input.parentExternalMessageId === 'string' ? input.parentExternalMessageId.trim() : ''
  if (parent === '') return {}
  const channelType = (input.channelType ?? '').toLowerCase()
  if (channelType !== 'email') return {}
  return { inReplyTo: parent, references: [parent] }
}
