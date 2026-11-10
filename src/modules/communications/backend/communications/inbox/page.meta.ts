export const metadata = {
  requireAuth: true,
  requireFeatures: ['communication_channels.connect_user_channel'],
  pageTitle: '全渠道收件箱',
  pageTitleKey: 'communications.inbox.title',
  // Registered into the existing "沟通与资料" group, beside the messages scene —
  // no new top-level scene and no navHidden. The entry is still gated by the
  // feature above, so only users who may connect a channel see it.
  pageGroup: 'Messages',
  pageGroupKey: 'messages.nav.group',
  pageOrder: 470,
  icon: 'inbox',
}

export default metadata
