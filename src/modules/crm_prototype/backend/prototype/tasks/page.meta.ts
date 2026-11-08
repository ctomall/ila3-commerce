export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '开发任务',
  pageTitleKey: 'crm.prototype.tasks',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '开发任务', labelKey: 'crm.prototype.tasks' }],
} as const
