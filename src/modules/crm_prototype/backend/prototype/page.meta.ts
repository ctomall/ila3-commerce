export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '业务员首页',
  pageTitleKey: 'crm.prototype.home',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '业务员首页', labelKey: 'crm.prototype.home' }],
} as const
