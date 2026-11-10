import * as React from 'react'
import { BoundedTableGate } from './bounded-table-gate'

/**
 * How long a table may stay in its loading state before the app stops waiting.
 *
 * Deliberately far above a healthy load (the profile channels table answers in
 * ~0.1–0.6 s locally and ~2–4 s through the public ingress) so it never fires on a
 * slow-but-working request, and far below "the user has already given up". A stalled
 * request can stay open indefinitely at the network layer — a browser only gives up
 * when the *connection* dies, not when a route handler stops answering — so without
 * this budget the loading state has no upper bound at all.
 */
export const DEFAULT_TABLE_LOAD_BUDGET_MS = 20_000

type AnyProps = Record<string, unknown>
/** Matches the `ComponentOverride.wrapper` contract (`ComponentType<unknown>`). */
type AnyComponent = React.ComponentType<unknown>

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
 * Builds a decorator that gives a `DataTable` host's loading state an upper bound.
 *
 * **This file must stay free of `'use client'` and of hooks.** The module registry
 * imports `widgets/components.ts` (and therefore this factory) while collecting server
 * configuration; if the factory lived in a client module, merely *calling* it there
 * would fail the build. Only `BoundedTableGate` — imported as a reference and rendered
 * later — is a client component, which is exactly the boundary React allows.
 *
 * Contract, in order of priority:
 *  1. A host-reported `error` always wins — it is a real answer from the API and the
 *     budget must not replace it.
 *  2. While loading, the budget runs; when it expires the gate renders the app's
 *     shared error surface (role="alert", readable message, retry exit) instead of the
 *     table, so the spinner cannot be the last thing on screen.
 *  3. If the request answers late (the host clears `isLoading`), the real table takes
 *     over again on the next render — the error is not sticky.
 *
 * Every prop is forwarded verbatim, so the happy path renders the installed table
 * exactly as it did before this module existed.
 */
export function createBoundedLoadingWrapper(options: BoundedTableWrapperOptions = {}) {
  const budgetMs = options.budgetMs ?? DEFAULT_TABLE_LOAD_BUDGET_MS
  const reload = options.reload ?? reloadPage

  return function withBoundedLoading(Original: AnyComponent): AnyComponent {
    function BoundedLoadingTable(rawProps: unknown) {
      const props = (rawProps ?? {}) as AnyProps
      return (
        <BoundedTableGate
          isLoading={props.isLoading === true}
          hasReportedError={props.error !== null && props.error !== undefined}
          budgetMs={budgetMs}
          reload={reload}
        >
          {React.createElement(Original, props)}
        </BoundedTableGate>
      )
    }

    BoundedLoadingTable.displayName = `BoundedLoadingTable(${
      Original.displayName ?? Original.name ?? 'DataTable'
    })`
    return BoundedLoadingTable
  }
}
