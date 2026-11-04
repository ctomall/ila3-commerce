'use client'

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type ErrorStateProps = {
  title?: string
  /** Technical detail; kept visually secondary so it never reads as the message. */
  detail?: string
  onRetry?: () => void
  retryLabel?: string
}

/**
 * Shared failure surface.
 *
 * Screens that failed to load previously showed either a raw error string or
 * nothing at all. This keeps the message short, puts the technical detail on a
 * second line, and always offers a way forward.
 */
export function ErrorState({ title, detail, onRetry, retryLabel }: ErrorStateProps) {
  const t = useT()
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <img
        src="/brand/state-error.svg"
        alt=""
        aria-hidden="true"
        width={160}
        height={120}
        className="text-destructive opacity-80"
      />
      <p className="text-sm font-medium">{title ?? t('ui.states.error.title', '加载失败')}</p>
      {detail ? <p className="max-w-sm break-words text-xs text-muted-foreground">{detail}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {retryLabel ?? t('ui.states.error.retry', '重试')}
        </button>
      ) : null}
    </div>
  )
}

export default ErrorState
