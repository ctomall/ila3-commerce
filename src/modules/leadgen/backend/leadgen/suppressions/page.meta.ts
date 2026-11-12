import React from 'react'

const suppressionIcon = React.createElement(
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
  React.createElement('circle', { cx: '12', cy: '12', r: '10' }),
  React.createElement('line', { x1: '4.9', y1: '4.9', x2: '19.1', y2: '19.1' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['leadgen.sends.draft'],
  pageTitle: 'Suppression list',
  pageGroup: 'Sales',
  pageGroupKey: 'crmNav.manage.category.business',
  pageOrder: 21,
  icon: suppressionIcon,
  pageContext: 'settings' as const,
  breadcrumb: [{ label: 'Suppression list' }],
} as const
