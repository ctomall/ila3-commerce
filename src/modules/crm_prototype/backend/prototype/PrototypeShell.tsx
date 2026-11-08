'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@open-mercato/ui/primitives/badge'

export type PrototypePageId = 'home' | 'tasks' | 'candidates' | 'accounts' | 'account-detail' | 'drafts'

const PAGES: Array<{ id: PrototypePageId; href: string; label: string }> = [
  { id: 'home', href: '/backend/prototype', label: '业务员首页' },
  { id: 'tasks', href: '/backend/prototype/tasks', label: '开发任务' },
  { id: 'candidates', href: '/backend/prototype/candidates', label: '候选审核' },
  { id: 'accounts', href: '/backend/prototype/accounts', label: '客户列表' },
  { id: 'account-detail', href: '/backend/prototype/accounts/detail', label: '客户详情' },
  { id: 'drafts', href: '/backend/prototype/drafts', label: '邮件草稿审批' },
]

export function PrototypeShell({
  active,
  children,
}: {
  active: PrototypePageId
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/40 px-4 py-3">
        <Badge variant="outline" tone="warning">原型演示</Badge>
        <span className="text-sm text-muted-foreground">
          非生产数据 · 不落库 · 不发送 · 路由前缀 <code className="rounded bg-background px-1">/backend/prototype</code>
        </span>
      </div>

      <nav className="flex flex-wrap items-center gap-1 border-b border-[color:var(--border)] pb-2" aria-label="原型页面">
        {PAGES.map((page) => {
          const isActive = page.id === active
          return (
            <Link
              key={page.id}
              href={page.href}
              aria-current={isActive ? 'page' : undefined}
              className={
                isActive
                  ? 'rounded-md bg-[color:var(--foreground)] px-3 py-1.5 text-sm font-medium text-[color:var(--background)]'
                  : 'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-[color:var(--muted)] hover:text-[color:var(--foreground)]'
              }
            >
              {page.label}
            </Link>
          )
        })}
      </nav>

      {children}
    </div>
  )
}

/** Demo-state switcher: the interface states the real pages must handle later. */
export function StateSwitcher({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (next: string) => void
  options: Array<{ id: string; label: string }>
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="mr-1 text-muted-foreground">状态</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={
            option.id === value
              ? 'rounded border border-[color:var(--foreground)] px-2 py-0.5 font-medium'
              : 'rounded border border-[color:var(--border)] px-2 py-0.5 text-muted-foreground hover:text-[color:var(--foreground)]'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PrototypeNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-card px-5 py-8 text-center">
      <p className="text-sm font-medium">{children}</p>
      <p className="mt-1 text-xs text-muted-foreground">原型里这是占位；生产实现必须给出可操作入口，而不是只留一句提示。</p>
    </div>
  )
}
