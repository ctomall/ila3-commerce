export const metadata = {
  requireAuth: true,
  // Creating a tenant-wide channel is an administrative action; reading the
  // inbox must not grant it. Wildcard grants are honoured by the host.
  requireFeatures: ['communication_channels.connect_tenant_channel'],
  pageTitle: '连接渠道',
  pageTitleKey: 'communications.channels.connect.title',
  navHidden: true,
}

export default metadata
