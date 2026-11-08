export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '候选审核',
  pageTitleKey: 'crm.prototype.candidates',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '候选审核', labelKey: 'crm.prototype.candidates' }],
} as const
