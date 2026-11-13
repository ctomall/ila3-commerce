/**
 * Tenant-wide channel connect grant (design rev2 `F1-02/03`, `F5-01`).
 *
 * The connect wizard at `/backend/communications/channels/connect` is gated by
 * `communication_channels.connect_tenant_channel`; the list and inbox used to
 * render a "连接渠道" link unconditionally, so an employee whose role does not
 * carry that grant saw a call to action that only led to "Access Denied".
 *
 * The page resolves the grant with the same check the wizard metadata uses, and
 * the link is rendered only when the caller can actually use it.
 */
export const TENANT_CHANNEL_CONNECT_FEATURE = 'communication_channels.connect_tenant_channel'

export async function canConnectTenantChannel(
  check: (feature: string) => Promise<boolean>,
): Promise<boolean> {
  try {
    return await check(TENANT_CHANNEL_CONNECT_FEATURE)
  } catch {
    return false
  }
}
