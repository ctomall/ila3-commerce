export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication_channels.connect_user_channel'],
  pageTitle: '全渠道收件箱',
  pageTitleKey: 'communications.inbox.title',
  pageGroup: 'Communication',
  pageGroupKey: 'communications.nav.group',
  pageOrder: 21000,
  icon: 'inbox',
  // Deliberately not added to the shared navigation: the navigation task is
  // owned elsewhere. Reachable at /backend/communications/inbox.
  navHidden: true,
}

export default metadata
