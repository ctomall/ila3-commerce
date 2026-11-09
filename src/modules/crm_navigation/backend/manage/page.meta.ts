export const metadata = {
  requireAuth: true,
  pageTitle: '管理中心',
  pageTitleKey: 'crmNav.manage.title',
  pageGroup: '管理中心',
  pageGroupKey: 'crm_navigation.nav.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 60,
  breadcrumb: [{ label: '管理中心', labelKey: 'crmNav.manage.title' }],
} as const
