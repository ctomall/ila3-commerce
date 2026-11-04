import * as React from 'react'

export type SkeletonTableProps = {
  rows?: number
  columns?: number
  /** Announced to screen readers while the table is loading. */
  label?: string
}

/**
 * Table loading placeholder.
 *
 * Lists used to render a single "Loading…" cell, which made the layout jump
 * when data arrived. This keeps the column frame stable and marks the region
 * busy for assistive tech.
 */
export function SkeletonTable({ rows = 6, columns = 4, label = '正在加载表格…' }: SkeletonTableProps) {
  return (
    <div aria-busy="true" aria-label={label} role="status" className="w-full">
      <div className="flex gap-3 border-b px-3 py-2">
        {Array.from({ length: columns }).map((_, c) => (
          <div key={`h-${c}`} className="h-3 flex-1 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`r-${r}`} className="flex gap-3 border-b px-3 py-3 last:border-b-0">
          {Array.from({ length: columns }).map((_, c) => (
            <div key={`c-${r}-${c}`} className="h-3 flex-1 animate-pulse rounded bg-muted/70" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default SkeletonTable
