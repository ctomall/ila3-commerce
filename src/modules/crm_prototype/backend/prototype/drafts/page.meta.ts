export const metadata = {
  requireAuth: true,
  requireFeatures: ['customers.companies.view'],
  pageTitle: '邮件草稿审批',
  pageTitleKey: 'crm.prototype.drafts',
  pageGroup: 'CRM Prototype',
  pageGroupKey: 'crm.prototype.group',
  pageContext: 'main' as const,
  navHidden: true,
  order: 900,
  breadcrumb: [{ label: '邮件草稿审批', labelKey: 'crm.prototype.drafts' }],
} as const
