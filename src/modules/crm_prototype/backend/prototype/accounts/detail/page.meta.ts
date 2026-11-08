export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '客户详情',
  pageTitleKey: 'crm.prototype.accountDetail',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '客户详情', labelKey: 'crm.prototype.accountDetail' }],
} as const
