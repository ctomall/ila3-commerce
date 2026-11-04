import React from 'react'

const modelsIcon = React.createElement(
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
  React.createElement('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }),
  React.createElement('path', { d: 'M9 9h6v6H9z' }),
  React.createElement('path', { d: 'M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3' }),
)

export const metadata = {
  requireAuth: true,
  requireFeatures: ['ai_assistant.settings.manage'],
  pageTitle: 'Model Configuration',
  pageTitleKey: 'ai_assistant.models.navTitle',
  pageGroup: 'Module Configs',
  pageGroupKey: 'settings.sections.moduleConfigs',
  pageOrder: 431,
  icon: modelsIcon,
  pageContext: 'settings' as const,
  breadcrumb: [
    { label: 'Model Configuration', labelKey: 'ai_assistant.models.navTitle' },
  ],
} as const
