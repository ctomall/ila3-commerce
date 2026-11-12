import React from 'react'

const leadgenIcon = React.createElement(
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
  React.createElement('path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }),
  React.createElement('circle', { cx: '9', cy: '7', r: '4' }),
  React.createElement('path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }),
  React.createElement('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['leadgen.candidates.view'],
  pageTitle: 'Lead candidates',
  pageGroup: 'Sales',
  pageGroupKey: 'crmNav.manage.category.business',
  pageOrder: 20,
  icon: leadgenIcon,
  pageContext: 'settings' as const,
  breadcrumb: [{ label: 'Lead candidates' }],
} as const
