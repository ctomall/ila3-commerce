'use client'

import * as React from 'react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readCrmCatalog } from '@/nav/crm-navigation'

/**
 * Error-only sidebar injection.
 *
 * The installed AppShell owns the sidebar: groups, logo, search, collapse and
 * the mobile drawer. This widget therefore renders in exactly one state — the
 * chrome payload settled without a usable catalogue (the request failed, or the
 * server answered with the typed `crm.error` fallback). It never synthesizes
 * groups or links, so the stock shell stays untouched on every normal state.
 *
 * An explicitly empty authorization is NOT an error: the catalogue is present
 * with zero groups, the stock sidebar renders empty, and this widget returns
 * null.
 *
 * The spot (`backend:sidebar:nav`) is the same one the retired app-owned rail
 * used; the shell renders it above the default main groups.
 */
export function NavError() {
  const t = useT()
  const { payload, isLoading, refresh } = useBackendChrome()

  // Loading is the skeleton state owned by the shell; stay quiet until settled.
  if (isLoading) return null

  const catalog = readCrmCatalog(payload)
  if (catalog !== null && catalog.error !== true) return null

  return (
    <div
      role="alert"
      data-crm-nav-error=""
      className="rounded-lg border bg-muted/40 px-2.5 py-2"
    >
      <p className="text-xs font-medium text-foreground">
        {t('crmNav.navLoadFailed', '导航加载失败')}
      </p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="mt-1 rounded-sm text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground focus:outline-none focus-visible:shadow-focus"
      >
        {t('crmNav.retry', '重试')}
      </button>
    </div>
  )
}

const widget = {
  metadata: {
    id: 'crm_navigation.injection.nav-error',
    title: '导航加载失败',
    description: 'Error-only retry card; renders nothing while the catalogue is healthy',
    enabled: true,
    priority: 20,
  },
  Widget: NavError,
}

export default widget
