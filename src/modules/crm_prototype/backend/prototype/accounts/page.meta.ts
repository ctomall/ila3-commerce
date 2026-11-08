export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '客户列表',
  pageTitleKey: 'crm.prototype.accounts',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '客户列表', labelKey: 'crm.prototype.accounts' }],
} as const
