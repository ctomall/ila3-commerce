'use client'

import * as React from 'react'
import { Loader2, Plus, RefreshCw, ShieldOff } from 'lucide-react'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@open-mercato/ui/primitives/table'

type Suppression = {
  id: string
  email: string
  reason: 'unsubscribe' | 'complaint' | 'bounce'
  createdAt: string
  releasedAt: string | null
}

type ListPayload = { items: Suppression[] }

const REASONS: Array<{ value: Suppression['reason']; label: string }> = [
  { value: 'unsubscribe', label: '退订' },
  { value: 'complaint', label: '投诉' },
  { value: 'bounce', label: '退信' },
]

/** The list is the only source of truth: a hit here blocks every dispatch. */
function reasonLabel(reason: string): string {
  return REASONS.find((entry) => entry.value === reason)?.label ?? reason
}

function failureText(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as { error?: unknown; code?: unknown }
    const code = typeof record.code === 'string' ? record.code : null
    const message = typeof record.error === 'string' ? record.error : null
    return `HTTP ${status}${code ? ` · ${code}` : ''}${message ? ` — ${message}` : ''}`
  }
  return `HTTP ${status}`
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) throw new Error(failureText(response.status, body))
  return body as T
}

export default function SuppressionsPageClient() {
  const [items, setItems] = React.useState<Suppression[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState('')
  const [reason, setReason] = React.useState<Suppression['reason']>('unsubscribe')
  const [submitting, setSubmitting] = React.useState(false)
  const [releasing, setReleasing] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = await request<ListPayload>('/api/leadgen/suppressions?limit=100')
      setItems(payload.items ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const address = email.trim()
    if (!address) return
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const result = await request<{ created?: boolean }>('/api/leadgen/suppressions', {
        method: 'POST',
        body: JSON.stringify({ email: address, reason }),
      })
      setEmail('')
      setNotice(result?.created === false ? `${address} 已在抑制名单中` : `已加入抑制名单：${address}`)
      await load()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  async function release(item: Suppression) {
    setReleasing(item.id)
    setError(null)
    setNotice(null)
    try {
      await request<{ released: number }>(`/api/leadgen/suppressions?email=${encodeURIComponent(item.email)}`, {
        method: 'DELETE',
      })
      setNotice(`已解除：${item.email}（该地址恢复可投递）`)
      await load()
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : String(releaseError))
    } finally {
      setReleasing(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">抑制名单</h1>
          <p className="text-sm text-muted-foreground">
            命中本名单的收件人会被发送边界直接拒绝（409 suppressed）；解除后恢复可投递。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </header>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">邮箱地址</span>
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="customer@example.com"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">原因</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value as Suppression['reason'])}
          >
            {REASONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={submitting || !email.trim()}>
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          加入名单
        </Button>
      </form>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {notice ? <Alert>{notice}</Alert> : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>原因</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  {loading ? '加载中…' : '名单为空：没有任何地址被抑制。'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">{item.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{reasonLabel(item.reason)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDateTime(item.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void release(item)}
                      disabled={releasing === item.id}
                    >
                      {releasing === item.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldOff className="mr-2 h-4 w-4" />
                      )}
                      解除
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
