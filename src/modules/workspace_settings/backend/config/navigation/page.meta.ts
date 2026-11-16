export const metadata = {
  requireAuth: true,
  requireFeatures: ['workspace_settings.manage'],
  pageTitle: 'Workspace layout',
  pageTitleKey: 'workspace_settings.nav.title',
  pageGroup: 'Organization & business',
  pageGroupKey: 'crmNav.manage.category.business',
  pageOrder: 40,
  pageContext: 'settings' as const,
  navHidden: true,
  breadcrumb: [
    { label: 'Workspace layout', labelKey: 'workspace_settings.nav.title' },
  ],
} as const
