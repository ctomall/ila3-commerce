export const metadata = {
  requireAuth: true,
  // Same read gate as the inbox: seeing which accounts exist is part of reading
  // the shared inbox, while connecting accounts stays a separate grant.
  requireFeatures: ['communication_channels.view'],
  pageTitle: '渠道账号',
  // Lives in the existing "沟通与资料" group beside the inbox, without adding a
  // new top-level scene.
  pageGroup: 'Messages',
  pageGroupKey: 'messages.nav.group',
  pageOrder: 480,
}

export default metadata
