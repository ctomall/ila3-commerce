export const metadata = {
  requireAuth: true,
  pageTitle: '业务分类',
  pageTitleKey: 'crmNav.business.categoryTitle',
  pageGroup: '业务',
  pageGroupKey: 'crm_navigation.nav.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 41,
  breadcrumb: [
    { label: '业务', labelKey: 'crmNav.business.title', href: '/backend/business' },
    { label: '业务分类', labelKey: 'crmNav.business.categoryTitle' },
  ],
} as const
