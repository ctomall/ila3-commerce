export const metadata = {
  requireAuth: true,
  // Detail route of the same inbox page: identical gate to the list page so an
  // unauthenticated GET cannot render the thread shell. No pageGroup/order/icon
  // here — the dynamic route must not add a second navigation entry.
  requireFeatures: ['communication_channels.connect_user_channel'],
}

export default metadata
