import { cookies, headers } from 'next/headers'
import { backendRouteMetadata } from '@/.mercato/generated/backend-route-metadata.generated'
import { findRouteManifestMatch } from '@open-mercato/shared/modules/registry'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { AppShell } from '@open-mercato/ui/backend/AppShell'
import { resolveSupportedLocalesForRequest, resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { namespacesForBackendRoute, trimDictionaryToNamespaces } from '@/lib/i18n/auth-dict'
import { resolveForcedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { I18nProvider } from '@open-mercato/shared/lib/i18n/context'
import { authorizeFeatures } from '@open-mercato/shared/security/featurePolicy'
import { APP_VERSION } from '@open-mercato/shared/lib/version'

// Footer shows the exact build, not just the package version.
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA?.trim() || ''
const DISPLAY_VERSION = BUILD_SHA ? `${APP_VERSION} (${BUILD_SHA})` : APP_VERSION
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import { PageInjectionBoundary } from '@open-mercato/ui/backend/injection/PageInjectionBoundary'
import { BrowserTelemetry } from '@open-mercato/telemetry/browser'
import { resolveBrowserTelemetryConfig } from '@open-mercato/telemetry/browser/server'
import { DemoFeedbackWidget } from '@/components/DemoFeedbackWidget'
import { BackendHeaderChrome } from '@/components/BackendHeaderChrome'

export default async function BackendLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug?: string[] }>
}) {
  const auth = await getAuthFromCookies()
  const cookieStore = await cookies()
  const headerStore = await headers()

  let path = headerStore.get('x-next-url') ?? ''
  if (path.includes('?')) path = path.split('?')[0]
  let resolvedParams: { slug?: string[] } = {}
  try {
    resolvedParams = await params
  } catch {
    resolvedParams = {}
  }
  if (!path) {
    const slug = resolvedParams.slug ?? []
    path = '/backend' + (Array.isArray(slug) && slug.length > 0 ? `/${slug.join('/')}` : '')
  }

  // This layout mounts its own `I18nProvider` inside the root layout's, so it has
  // to resolve the served set itself: detecting against the process-wide set would
  // let the admin subtree render a locale the root layout already rejected.
  const supportedLocales = await resolveSupportedLocalesForRequest()
  const { translate, locale, dict: fullDict } = await resolveTranslations({ supportedLocales })
  // This nested provider used to hand the client the entire merged dictionary
  // (~23k keys) on every backend page. Module pages only need their own
  // namespace plus the shell; settings/config screens keep the full dictionary.
  const requestPath = (await headers()).get('x-next-url')
  const backendNamespaces = requestPath ? namespacesForBackendRoute(requestPath) : null
  const dict = backendNamespaces ? trimDictionaryToNamespaces(fullDict, backendNamespaces) : fullDict
  const embeddingConfigured = Boolean(
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.COHERE_API_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.OLLAMA_BASE_URL,
  )
  const missingConfigMessage = translate(
    'search.messages.missingConfig',
    'Search requires configuring an embedding provider for semantic search.',
  )

  const match = findRouteManifestMatch(backendRouteMetadata, path)
  const currentTitle = match?.route.titleKey
    ? translate(match.route.titleKey, match.route.title)
    : (match?.route.title ?? '')
  const rawBreadcrumb = match?.route.breadcrumb
  const breadcrumb = rawBreadcrumb?.map((item) => ({
    ...item,
    label: item.labelKey ? translate(item.labelKey, item.label || item.labelKey) : item.label,
  }))

  const collapsedCookie = cookieStore.get('om_sidebar_collapsed')?.value
  const initialCollapsed = collapsedCookie === '1'
  const demoModeEnabled = parseBooleanWithDefault(process.env.DEMO_MODE, true)
  const hideBackendFooter = parseBooleanWithDefault(process.env.OM_HIDE_BACKEND_FOOTER, false)
  const deployEnv = process.env.DEPLOY_ENV
  const grantedFeatures = Array.isArray(auth?.features)
    ? auth.features.filter((feature): feature is string => typeof feature === 'string')
    : []
  const canManageUpgradeActions = authorizeFeatures(['configs.manage'], {
    grantedFeatures,
    unrestricted: auth?.isSuperAdmin === true,
  })
  const baseProductName = translate('appShell.productName', 'ILA3 Commerce')
  const productName = deployEnv && deployEnv !== 'local'
    ? `${baseProductName} (${deployEnv.charAt(0).toUpperCase() + deployEnv.slice(1)})`
    : baseProductName

  const injectionContext = {
    path,
    userId: auth?.sub ?? null,
    tenantId: auth?.tenantId ?? null,
    organizationId: auth?.orgId ?? null,
  }

  // Resolved per request (this layout is force-dynamic), so browser RUM can be
  // toggled per environment without a rebuild. Null keeps the SDK chunk from
  // ever being requested.
  const browserTelemetryConfig = resolveBrowserTelemetryConfig({ cookieHeader: cookieStore.toString() })

  return (
    <I18nProvider locale={locale} dict={dict} localeLocked={resolveForcedLocale(process.env) !== null} supportedLocales={supportedLocales}>
      <AppShell
        productName={productName}
        email={auth?.email}
        canManageUpgradeActions={canManageUpgradeActions}
        // The installed AppShell fills the sidebar from `adminNavApi` (the
        // catalogue-backed chrome payload). This empty list is only the
        // pre-chrome fallback while that request is in flight.
        groups={[]}
        currentTitle={currentTitle}
        breadcrumb={breadcrumb}
        sidebarCollapsedDefault={initialCollapsed}
        rightHeaderSlot={(
          <BackendHeaderChrome
            email={auth?.email}
            userId={auth?.sub ?? null}
            embeddingConfigured={embeddingConfigured}
            missingConfigMessage={missingConfigMessage}
            tenantId={auth?.tenantId ?? null}
            organizationId={auth?.orgId ?? null}
          />
        )}
        adminNavApi="/api/crm_navigation/navigation?chrome=1"
        version={DISPLAY_VERSION}
        hideFooter={hideBackendFooter}
      >
        <PageInjectionBoundary path={path} context={injectionContext}>
          {children}
        </PageInjectionBoundary>
        {demoModeEnabled ? <DemoFeedbackWidget demoModeEnabled={demoModeEnabled} /> : null}
        <BrowserTelemetry config={browserTelemetryConfig} />
      </AppShell>
    </I18nProvider>
  )
}

export const dynamic = 'force-dynamic'
