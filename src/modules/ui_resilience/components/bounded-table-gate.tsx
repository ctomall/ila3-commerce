'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorState } from '@/components/states/ErrorState'

/**
 * The client half of the bounded-load guard.
 *
 * Everything that needs hooks or browser APIs lives here, so the factory that builds
 * the override (`./bounded-table-load`) stays safe to evaluate from a **server**
 * module. That split is load-bearing: the module registry imports
 * `widgets/components.ts` while collecting server configuration, and calling a
 * `'use client'` export from that context fails the build with
 * "Attempted to call … from the server".
 *
 * The host table arrives as `children`, already rendered from the `Original` element
 * the wrapper created. Passing it as children (rather than as a component prop) keeps
 * the decoration out of the RSC serialization surface: the server may pass elements,
 * it may not pass functions.
 */
export type BoundedTableGateProps = {
  /** The host table's own loading flag. */
  isLoading: boolean
  /** A real, host-reported failure — never overridden by the budget. */
  hasReportedError: boolean
  /** How long a loading state may last before it is treated as a stall. */
  budgetMs: number
  /** Retry exit; the host page reload is the default. */
  reload: () => void
  children: React.ReactNode
}

export function BoundedTableGate({
  isLoading,
  hasReportedError,
  budgetMs,
  reload,
  children,
}: BoundedTableGateProps) {
  const t = useT()
  const loading = isLoading && !hasReportedError
  const [expired, setExpired] = React.useState(false)

  React.useEffect(() => {
    if (!loading) {
      setExpired(false)
      return
    }
    const timer = setTimeout(() => setExpired(true), budgetMs)
    return () => clearTimeout(timer)
  }, [loading, budgetMs])

  // A late answer clears `loading` on the next render; the guard below makes that
  // render go straight back to the real table instead of flashing the error.
  if (!expired || !loading) return <>{children}</>

  return (
    <ErrorState
      title={t('ui.resilience.table.timeout.title', 'Loading timed out')}
      detail={t(
        'ui.resilience.table.timeout.detail',
        'The server did not answer within {seconds} seconds. The network or the service may be temporarily unavailable — reloading usually recovers.',
        { seconds: Math.round(budgetMs / 1000) },
      )}
      onRetry={reload}
      retryLabel={t('ui.resilience.table.timeout.retry', 'Reload')}
    />
  )
}

export default BoundedTableGate
