import React from 'react'

const directoryIcon = React.createElement(
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
  React.createElement('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
  React.createElement('rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['configs.system_status.view'],
  pageTitle: 'Module applications',
  pageTitleKey: 'modules.directory.navTitle',
  pageGroup: 'System',
  pageGroupKey: 'settings.sections.system',
  pageOrder: 3,
  icon: directoryIcon,
  pageContext: 'settings' as const,
  breadcrumb: [
    { label: 'Module applications', labelKey: 'modules.directory.navTitle' },
  ],
} as const
