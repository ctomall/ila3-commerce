'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type EmptyStateProps = {
  title?: string
  description?: string
  /** Label of the primary action; omit when there is nothing to create. */
  actionLabel?: string
  onAction?: () => void
  /** Override the illustration (defaults to the shared empty-state art). */
  illustration?: string
}

/**
 * Shared "nothing here yet" surface.
 *
 * Every list in the product used to fall back to a bare `t('...empty')` string,
 * which reads as a dead end: no illustration, no next step. This component makes
 * the three parts explicit (art, explanation, primary action) so an empty screen
 * still tells the user what to do.
 */
export function EmptyState({ title, description, actionLabel, onAction, illustration }: EmptyStateProps) {
  const t = useT()
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <img
        src={illustration ?? '/brand/state-empty.svg'}
        alt=""
        aria-hidden="true"
        width={160}
        height={120}
        className="text-muted-foreground opacity-70"
      />
      <p className="text-sm font-medium">{title ?? t('ui.states.empty.title', '暂无数据')}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

export default EmptyState
