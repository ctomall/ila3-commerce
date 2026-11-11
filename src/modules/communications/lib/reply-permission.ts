/**
 * Reply authorization for `POST /api/communications/me/send`.
 *
 * The route guard proves the caller may read the inbox
 * (`communication_channels.view`). Replying additionally requires one of:
 *
 *   - `communications.reply` — the dedicated capability (grant this to staff who
 *     answer customers without managing channels);
 *   - `communication_channels.connect_user_channel` — the legacy capability that
 *     opened both "connect my own account" and "reply". It stays accepted so an
 *     existing employee/admin role keeps working until the role grants are
 *     migrated; dropping it without that migration would remove reply access
 *     from every current user.
 */
export const REPLY_FEATURE = 'communications.reply'
export const LEGACY_REPLY_FEATURE = 'communication_channels.connect_user_channel'

export type FeatureCheck = (feature: string) => Promise<boolean>

export async function canReply(check: FeatureCheck): Promise<boolean> {
  if (await check(REPLY_FEATURE)) return true
  return check(LEGACY_REPLY_FEATURE)
}
