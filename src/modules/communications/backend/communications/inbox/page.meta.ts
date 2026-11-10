export const metadata = {
  requireAuth: true,
  // Read gate: `view` is what the inbox needs. Connecting an account is gated
  // separately (`connect_user_channel`) and must not be a prerequisite to read.
  requireFeatures: ['communication_channels.view'],
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
