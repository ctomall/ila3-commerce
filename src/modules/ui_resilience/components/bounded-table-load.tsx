'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorState } from '@/components/states/ErrorState'

/**
 * How long a table may stay in its loading state before the app stops waiting.
 *
 * The budget is deliberately far above a healthy load (the profile channels table
 * answers in ~0.1–0.6 s locally and ~2–4 s through the public ingress) so it never
 * fires on a slow-but-working request, and far below "the user has already given up".
 * A stalled request can stay open indefinitely at the network layer — a browser only
 * gives up when the *connection* dies, not when a route handler stops answering — so
 * without this budget the loading state has no upper bound at all.
 */
export const DEFAULT_TABLE_LOAD_BUDGET_MS = 20_000

type TableLikeProps = {
  /** The host table's own loading flag; anything else is passed through untouched. */
  isLoading?: unknown
  /** A real, host-reported failure — never overridden by the budget. */
  error?: unknown
  [key: string]: unknown
}

export type BoundedTableWrapperOptions = {
  /** Overridable so tests can assert the transition without waiting 20 s. */
  budgetMs?: number
  /** Overridable so the retry exit is assertable without navigating. */
  reload?: () => void
}

function reloadPage() {
  if (typeof window !== 'undefined') window.location.reload()
}

/**
 * Wraps a DataTable host so its loading state has an upper bound.
 *
 * Contract, in order of priority:
 *  1. A host-reported `error` always wins — it is a real answer from the API and the
 *     budget must not replace it.
 *  2. While loading, the budget runs; when it expires the wrapper renders the app's
 *     shared error surface (role="alert", readable message, retry exit) instead of the
 *     table, so the spinner cannot be the last thing on screen.
 *  3. If the request answers late (the host clears `isLoading`), the real table takes
 *     over again on the next render — the error is not sticky.
 *
 * Every other prop is forwarded verbatim, so the happy path renders the installed
 * table exactly as it did before this module existed.
 */
export function createBoundedLoadingWrapper(options: BoundedTableWrapperOptions = {}) {
  const budgetMs = options.budgetMs ?? DEFAULT_TABLE_LOAD_BUDGET_MS
  const reload = options.reload ?? reloadPage

  return function withBoundedLoading(Original: React.ComponentType<unknown>): React.ComponentType<unknown> {
    function BoundedLoadingTable(rawProps: unknown) {
      const t = useT()
      const props = (rawProps ?? {}) as TableLikeProps
      const reportedFailure = props.error !== null && props.error !== undefined
      const loading = props.isLoading === true && !reportedFailure
      const [expired, setExpired] = React.useState(false)

      React.useEffect(() => {
        if (!loading) {
          setExpired(false)
          return
        }
        const timer = setTimeout(() => setExpired(true), budgetMs)
        return () => clearTimeout(timer)
      }, [loading, budgetMs])

      if (!expired) return <Original {...(props as Record<string, unknown>)} />

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

    BoundedLoadingTable.displayName = `BoundedLoadingTable(${Original.displayName ?? Original.name ?? 'DataTable'})`
    return BoundedLoadingTable
  }
}
