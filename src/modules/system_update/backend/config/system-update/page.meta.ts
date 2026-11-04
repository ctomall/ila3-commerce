import React from 'react'

const updateIcon = React.createElement(
  'svg',
  {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  React.createElement('path', { d: 'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64' }),
  React.createElement('path', { d: 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64' }),
  React.createElement('path', { d: 'M21 3v6h-6' }),
  React.createElement('path', { d: 'M3 21v-6h6' }),
)

export const metadata = {
  requireAuth: true,
  requireRoles: ['superadmin'],
  pageTitle: 'System Update',
  pageTitleKey: 'system_update.page.title',
  pageGroup: 'Module Configs',
  pageGroupKey: 'settings.sections.moduleConfigs',
  pageOrder: 499,
  icon: updateIcon,
  pageContext: 'settings' as const,
  breadcrumb: [{ label: 'System Update', labelKey: 'system_update.page.title' }],
} as const
