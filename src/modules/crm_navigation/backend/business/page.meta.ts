export const metadata = {
  requireAuth: true,
  pageTitle: '业务',
  pageTitleKey: 'crmNav.business.title',
  pageGroup: '业务',
  pageGroupKey: 'crm_navigation.nav.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 40,
  breadcrumb: [{ label: '业务', labelKey: 'crmNav.business.title' }],
} as const
