export const metadata = {
  requireAuth: true,
  // Older-message window of the same inbox detail page: identical gate, and
  // hidden from navigation like the thread page itself.
  requireFeatures: ['communication_channels.view'],
}

export default metadata
