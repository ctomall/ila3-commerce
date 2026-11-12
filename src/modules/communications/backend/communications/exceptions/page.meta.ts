export const metadata = {
  requireAuth: true,
  // Reconciling an unknown result is an operator action, not an inbox read.
  requireFeatures: ['communication_channels.manage'],
  pageTitle: '发送结果对账',
  pageGroup: 'Messages',
  pageGroupKey: 'messages.nav.group',
  pageOrder: 490,
}

export default metadata
