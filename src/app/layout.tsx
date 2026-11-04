import type { Metadata } from 'next'
import './globals.css'
import '@/lib/i18n/register-dictionary-loader'
import { AppProviders } from '@/components/AppProviders'
import { BRAND } from '@/lib/branding'
import { isAuthRoute, namespacesForBackendRoute, trimDictionaryForAuthRoute, trimDictionaryToNamespaces } from '@/lib/i18n/auth-dict'
import { headers } from 'next/headers'

import { THEME_INIT_SCRIPT } from '@open-mercato/ui/theme/theme-init-script'
import { detectLocale, loadDictionary, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { resolveForcedLocale } from '@open-mercato/shared/lib/i18n/locale'
import { resolveDevRuntimeLayoutConfig } from '@open-mercato/shared/lib/dev-runtime/layout'
import { DevRuntimeDiagnosticsBanner } from '@open-mercato/ui/backend/dev/DevRuntimeDiagnosticsBanner'
import { DevRuntimeReporter } from '@open-mercato/ui/backend/dev/DevRuntimeReporter'

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.description,
  icons: {
    icon: [
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: BRAND.icon, type: 'image/svg+xml' },
    ],
    apple: [{ url: '/brand/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: BRAND.name,
    description: BRAND.description,
    images: [{ url: '/brand/og-512.png', width: 512, height: 512, alt: BRAND.name }],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolved server-side (the tenant's Settings selection needs a container and
  // the app registry) and handed to the client provider, which can read neither.
  const supportedLocales = await resolveSupportedLocalesForRequest()
  const locale = await detectLocale({ supportedLocales })
  const dict = await loadDictionary(locale)
  // The unauthenticated shell does not need every module namespace; trimming
  // it here keeps /login's RSC payload small without touching /backend.
  const requestPath = (await headers()).get('x-next-url')
  // Both this provider and the nested (backend) one serialize their dict into
  // the RSC payload, so both must be trimmed or the full dictionary still ships.
  const backendNamespaces = requestPath ? namespacesForBackendRoute(requestPath) : null
  const dictForRequest = isAuthRoute(requestPath)
    ? trimDictionaryForAuthRoute(dict)
    : backendNamespaces
      ? trimDictionaryToNamespaces(dict, backendNamespaces)
      : dict
  const localeLocked = resolveForcedLocale(process.env) !== null
  const demoModeEnabled = process.env.DEMO_MODE !== 'false'
  const noticeBarsEnabled = process.env.OM_INTEGRATION_TEST !== 'true'
  const devRuntime = resolveDevRuntimeLayoutConfig(process.env)
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {devRuntime.meta.map((meta) => (
          <meta key={meta.name} name={meta.name} content={meta.content} />
        ))}
      </head>
      <body className="antialiased" suppressHydrationWarning data-gramm="false">
        <script id="om-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppProviders locale={locale} dict={dictForRequest} localeLocked={localeLocked} supportedLocales={supportedLocales} demoModeEnabled={demoModeEnabled} noticeBarsEnabled={noticeBarsEnabled}>
          {devRuntime.enabled ? <DevRuntimeReporter /> : null}
          {devRuntime.bannerEnabled ? <DevRuntimeDiagnosticsBanner /> : null}
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
