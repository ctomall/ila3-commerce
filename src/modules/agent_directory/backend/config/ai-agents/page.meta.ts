import React from 'react'

const agentsIcon = React.createElement(
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
  React.createElement('rect', { x: 3, y: 11, width: 18, height: 10, rx: 2 }),
  React.createElement('circle', { cx: 12, cy: 5, r: 2 }),
  React.createElement('path', { d: 'M12 7v4' }),
  React.createElement('line', { x1: 8, y1: 16, x2: 8.01, y2: 16 }),
  React.createElement('line', { x1: 16, y1: 16, x2: 16.01, y2: 16 }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['ai_assistant.settings.manage'],
  pageTitle: 'AI agents',
  pageTitleKey: 'agents.directory.navTitle',
  pageGroup: 'AI management',
  pageGroupKey: 'crmNav.manage.category.ai',
  pageOrder: 9,
  icon: agentsIcon,
  pageContext: 'settings' as const,
  breadcrumb: [
    { label: 'AI agents', labelKey: 'agents.directory.navTitle' },
  ],
} as const
