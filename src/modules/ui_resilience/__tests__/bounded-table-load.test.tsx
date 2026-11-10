/** @jest-environment jsdom */
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, cleanup, render, screen } from '@testing-library/react'

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({
  useT: () => (key: string, fallback?: string, params?: Record<string, unknown>) => {
    if (!fallback) return key
    if (!params) return fallback
    return fallback.replace(/\{(\w+)\}/g, (_match: string, name: string) =>
      params[name] === undefined ? `{${name}}` : String(params[name]),
    )
  },
}))

import {
  DEFAULT_TABLE_LOAD_BUDGET_MS,
  createBoundedLoadingWrapper,
} from '../components/bounded-table-load'

type TableProps = {
  isLoading?: boolean
  error?: string | null
  emptyState?: string
  title?: string
  data?: unknown[]
}

/**
 * Stand-in for the installed DataTable: proves the wrapper forwards props verbatim.
 *
 * Its props are `unknown` on purpose — that is exactly the contract `ComponentOverride.wrapper`
 * gives the framework (`ComponentType<unknown>`), so the test exercises the same typing the
 * registry does instead of a friendlier one that the real call site does not have.
 */
function FakeTable(rawProps: unknown) {
  const { isLoading, error, emptyState, title } = (rawProps ?? {}) as TableProps
  return (
    <div data-testid="installed-table" data-loading={String(isLoading)} data-title={title}>
      {isLoading ? <span>正在加载表格…</span> : null}
      {error ? <span role="alert">{error}</span> : null}
      {!isLoading && !error ? <span>{emptyState ?? 'empty'}</span> : null}
    </div>
  )
}

const BUDGET_MS = 1_000

function renderTable(props: TableProps, reload = jest.fn()) {
  const Wrapped = createBoundedLoadingWrapper({ budgetMs: BUDGET_MS, reload })(FakeTable)
  const Host = Wrapped as React.ComponentType<TableProps>
  const utils = render(<Host {...props} />)
  return { ...utils, reload }
}

beforeEach(() => {
  jest.useFakeTimers()
})
afterEach(() => {
  cleanup()
  jest.useRealTimers()
})

describe('bounded table loading', () => {
  it('renders the installed table untouched while it is loading within budget', () => {
    renderTable({ isLoading: true, title: 'Your channels' })
    expect(screen.getByTestId('installed-table')).toHaveAttribute('data-loading', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('turns a loading state that outlives the budget into a readable error with a retry exit', () => {
    const { reload } = renderTable({ isLoading: true })
    act(() => {
      jest.advanceTimersByTime(BUDGET_MS)
    })
    // The spinner is gone — the last thing on screen is an actionable failure.
    expect(screen.queryByTestId('installed-table')).toBeNull()
    expect(screen.queryByText('正在加载表格…')).toBeNull()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Loading timed out')
    // The message carries the budget so the user can tell a stall from a slow load.
    expect(alert).toHaveTextContent(`within ${Math.round(BUDGET_MS / 1000)} seconds`)
    const retry = screen.getByRole('button', { name: 'Reload' })
    act(() => {
      retry.click()
    })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never fires the budget when the request answers in time', () => {
    const { rerender, reload } = renderTable({ isLoading: true })
    const Wrapped = createBoundedLoadingWrapper({ budgetMs: BUDGET_MS, reload })(
      FakeTable,
    ) as React.ComponentType<TableProps>
    act(() => {
      jest.advanceTimersByTime(BUDGET_MS - 1)
    })
    rerender(<Wrapped isLoading={false} emptyState="You have no connected channels yet." />)
    act(() => {
      jest.advanceTimersByTime(BUDGET_MS * 5)
    })
    expect(screen.getByText('You have no connected channels yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(reload).not.toHaveBeenCalled()
  })

  it('restores the real table when a late answer arrives after the budget expired', () => {
    const { rerender } = renderTable({ isLoading: true })
    act(() => {
      jest.advanceTimersByTime(BUDGET_MS)
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    const Wrapped = createBoundedLoadingWrapper({ budgetMs: BUDGET_MS })(
      FakeTable,
    ) as React.ComponentType<TableProps>
    rerender(<Wrapped isLoading={false} emptyState="late data" />)
    expect(screen.getByTestId('installed-table')).toHaveAttribute('data-loading', 'false')
    expect(screen.getByText('late data')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('never overrides an error the API actually reported', () => {
    const { reload } = renderTable({ isLoading: false, error: 'Failed to load channels' })
    act(() => {
      jest.advanceTimersByTime(BUDGET_MS * 5)
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load channels')
    expect(screen.getByTestId('installed-table')).toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('exposes a default budget well above a healthy load', () => {
    expect(DEFAULT_TABLE_LOAD_BUDGET_MS).toBeGreaterThanOrEqual(15_000)
  })
})
