'use client'

import * as React from 'react'
import { Loader2, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp, Upload } from 'lucide-react'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'

type Candidate = {
  id: string
  companyName: string
  companyDomain: string | null
  contactName: string | null
  contactEmail: string | null
  status: string
  crmEntityId: string | null
  updatedAt: string
}

type ListPayload = { items: Candidate[] }

const STATUSES = ['submitted', 'needs_review', 'approved', 'crm_written', 'rejected', 'merged', 'writing_crm', 'failed']

/** Stable user-facing label; unknown statuses stay visible instead of disappearing. */
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: '待验证',
    needs_review: '需人工复核',
    approved: '已通过',
    writing_crm: '入库中',
    crm_written: '已入库',
    rejected: '已拒绝',
    merged: '已合并',
    failed: '失败',
  }
  return labels[status] ?? status
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
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
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

export default function LeadgenCandidatesPageClient() {
  const [items, setItems] = React.useState<Candidate[]>([])
  const [status, setStatus] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = status ? `?limit=100&status=${encodeURIComponent(status)}` : '?limit=100'
      const payload = await request<ListPayload>(`/api/leadgen/candidates${query}`)
      setItems(Array.isArray(payload.items) ? payload.items : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [status])

  React.useEffect(() => {
    void load()
  }, [load])

  async function act(candidate: Candidate, action: 'verify' | 'approve' | 'reject' | 'write') {
    setBusy(candidate.id)
    setError(null)
    setNotice(null)
    try {
      if (action === 'verify') {
        const result = await request<{ verdict: string; cached: boolean }>(
          `/api/leadgen/candidates/${candidate.id}/verify`,
          { method: 'POST', body: JSON.stringify({ mxChecked: false }) },
        )
        setNotice(`验证结论：${result.verdict}${result.cached ? '（复用已存结论）' : ''}`)
      } else if (action === 'write') {
        const result = await request<{ crmEntityId: string; created: boolean }>(
          `/api/leadgen/candidates/${candidate.id}/crm-write`,
          { method: 'POST', body: JSON.stringify({}) },
        )
        setNotice(result.created ? `已写入 CRM：${result.crmEntityId}` : `已入库，未重复创建：${result.crmEntityId}`)
      } else {
        // The decision key makes a double click a replay, not a second decision.
        const decisionKey = `ui-${action}-${candidate.id}-${Date.now()}`
        const result = await request<{ replayed: boolean }>(
          `/api/leadgen/candidates/${candidate.id}/decisions`,
          {
            method: 'POST',
            body: JSON.stringify({
              decision: action === 'approve' ? 'approve' : 'reject',
              decisionKey,
              reasonCode: 'ui_review',
            }),
          },
        )
        setNotice(`${action === 'approve' ? '已通过' : '已拒绝'}${result.replayed ? '（重放）' : ''}`)
      }
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">获客候选</h1>
          <p className="text-sm text-muted-foreground">
            调研候选的人工审核队列：验证结论是确定性的，入库前必须由人通过。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="leadgen-status">
            状态
          </label>
          <select
            id="leadgen-status"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">全部</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
        </div>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {notice ? <Alert>{notice}</Alert> : null}

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
        </div>
      ) : items.length === 0 ? (
        <Alert>没有符合条件的候选。</Alert>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">公司</th>
                <th className="px-3 py-2">联系人</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">更新</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((candidate) => (
                <tr key={candidate.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{candidate.companyName}</div>
                    <div className="text-xs text-muted-foreground">{candidate.companyDomain ?? '无域名'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{candidate.contactName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{candidate.contactEmail ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={candidate.status === 'crm_written' ? 'default' : 'secondary'}>
                      {statusLabel(candidate.status)}
                    </Badge>
                    {candidate.crmEntityId ? (
                      <div className="mt-1 text-xs text-muted-foreground">CRM {candidate.crmEntityId.slice(0, 8)}…</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {candidate.updatedAt ? formatDateTime(candidate.updatedAt) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === candidate.id}
                        onClick={() => void act(candidate, 'verify')}
                      >
                        <ShieldCheck className="h-4 w-4" /> 验证
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === candidate.id || !['submitted', 'needs_review', 'approved'].includes(candidate.status)}
                        onClick={() => void act(candidate, 'approve')}
                      >
                        <ThumbsUp className="h-4 w-4" /> 通过
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === candidate.id || !['submitted', 'needs_review'].includes(candidate.status)}
                        onClick={() => void act(candidate, 'reject')}
                      >
                        <ThumbsDown className="h-4 w-4" /> 拒绝
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === candidate.id || candidate.status !== 'approved' || Boolean(candidate.crmEntityId)}
                        onClick={() => void act(candidate, 'write')}
                      >
                        <Upload className="h-4 w-4" /> 入库
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
