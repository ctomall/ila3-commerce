'use client'

import * as React from 'react'
import { Inbox, Loader2, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'

type Decision = 'approve' | 'reject'

type Approval = {
  id: string
  tool: string
  summary: unknown
  requestedAt: string
  expiresAt: string
  runId: string
}

type ApprovalsPayload = {
  approvals: Approval[]
}

type Confirmation = {
  approval: Approval
  decision: Decision
}

type ApprovalSummary = {
  companyId: string | null
  companyName: string | null
  fields: Array<{ name: string; value: string }>
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** `summary` is stored as JSON; render only the fields this page understands. */
function readSummary(value: unknown): ApprovalSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { companyId: null, companyName: null, fields: [] }
  }
  const record = value as Record<string, unknown>
  const fields: Array<{ name: string; value: string }> = []
  const rawFields = record.fields
  if (typeof rawFields === 'object' && rawFields !== null && !Array.isArray(rawFields)) {
    for (const [name, rawValue] of Object.entries(rawFields as Record<string, unknown>)) {
      fields.push({ name, value: displayValue(rawValue) })
    }
  }
  return {
    companyId: readString(record.companyId),
    companyName: readString(record.companyName),
    fields,
  }
}

function readErrorBody(value: unknown): { code: string | null; error: string | null } {
  if (typeof value !== 'object' || value === null) return { code: null, error: null }
  const record = value as Record<string, unknown>
  return {
    code: readString(record.code),
    error: readString(record.error),
  }
}

/** `HTTP <status> · <server code> — <server message>`; never a blank string. */
function httpFailure(status: number, body: unknown): string {
  const { code, error } = readErrorBody(body)
  const head = code ? `HTTP ${status} · ${code}` : `HTTP ${status}`
  return error ? `${head} — ${error}` : head
}

export default function AiWriteApprovalsPageClient() {
  const [approvals, setApprovals] = React.useState<Approval[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null)

  const busy = busyId !== null

  const load = React.useCallback(async (): Promise<void> => {
    setError(null)
    try {
      const result = await apiCall<ApprovalsPayload>('/api/internal/dsh-write-approvals', {
        method: 'GET',
      })
      if (!result.ok) {
        setApprovals(null)
        setError(httpFailure(result.status, result.result))
        return
      }
      if (!result.result || !Array.isArray(result.result.approvals)) {
        setApprovals(null)
        setError('HTTP 200 — 响应缺少 approvals 数组')
        return
      }
      setApprovals(result.result.approvals)
    } catch {
      setApprovals(null)
      setError('网络请求失败：未收到 HTTP 响应。')
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const refresh = (): void => {
    setSuccess(null)
    setActionError(null)
    void load()
  }

  const decide = React.useCallback(
    async (approval: Approval, decision: Decision): Promise<void> => {
      setConfirmation(null)
      setBusyId(approval.id)
      setActionError(null)
      setSuccess(null)
      try {
        const result = await apiCall<{ approval: unknown }>(
          `/api/internal/dsh-write-approvals/${encodeURIComponent(approval.id)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ decision }),
          },
        )
        if (!result.ok) {
          setActionError(
            `${decision === 'approve' ? '批准' : '拒绝'}失败：${httpFailure(result.status, result.result)}`,
          )
          return
        }
        setSuccess(
          decision === 'approve'
            ? '已批准这次写入，DSH 可以在有效期内执行。'
            : '已拒绝这次写入，DSH 不会执行。',
        )
        await load()
      } catch {
        setActionError(
          `${decision === 'approve' ? '批准' : '拒绝'}失败：网络请求失败（未收到 HTTP 响应）。`,
        )
      } finally {
        setBusyId(null)
      }
    },
    [load],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">写入审批</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            DSH 助手请求的 CRM 写入必须由你逐条批准；批准后的请求只能使用一次，并在有效期内执行。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新
        </Button>
      </div>

      {success ? <Alert status="success">{success}</Alert> : null}
      {actionError ? <Alert status="error">{actionError}</Alert> : null}

      {error ? (
        <Alert
          status="error"
          action={
            <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
              重试
            </Button>
          }
        >
          <div className="space-y-1">
            <div className="font-medium">无法加载写入审批</div>
            <div className="break-all text-xs">{error}</div>
          </div>
        </Alert>
      ) : null}

      {approvals === null && !error ? (
        <div role="status" aria-busy="true" className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载待审批的写入…
          </div>
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
        </div>
      ) : null}

      {approvals !== null && approvals.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">暂无待审批的写入</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            DSH 助手发起的 CRM 写入请求会显示在这里。批准或拒绝后，该请求会从列表中移除。
          </p>
        </div>
      ) : null}

      {approvals !== null && approvals.length > 0 ? (
        <div className="space-y-3">
          {approvals.map((approval) => {
            const summary = readSummary(approval.summary)
            const companyLabel = summary.companyName ?? summary.companyId ?? '未知公司'
            return (
              <section
                key={approval.id}
                aria-label={`${approval.tool} 写入审批`}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" size="sm">
                        {approval.tool}
                      </Badge>
                      {summary.companyName !== null && summary.companyId !== null ? (
                        <span className="text-xs text-muted-foreground">
                          公司 ID：{summary.companyId}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-base font-semibold">{companyLabel}</h3>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>请求：{formatDateTime(approval.requestedAt) ?? '—'}</div>
                    <div>过期：{formatDateTime(approval.expiresAt) ?? '—'}</div>
                  </div>
                </div>

                {summary.fields.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {summary.fields.map((field) => (
                      <li key={field.name} className="flex flex-wrap gap-x-2">
                        <span className="font-medium">{field.name}:</span>
                        <span className="break-all text-muted-foreground">{field.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">未提供字段明细。</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    runId: {approval.runId}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirmation({ approval, decision: 'approve' })}
                    >
                      批准
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation({ approval, decision: 'reject' })}
                    >
                      拒绝
                    </Button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      ) : null}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.decision === 'reject' ? '确认拒绝这次写入？' : '确认批准这次写入？'}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.decision === 'reject'
                ? '拒绝后 DSH 不会执行这次写入；助手可以重新发起请求。'
                : '批准后 DSH 可以在有效期内执行这次写入。请求只能使用一次。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button
              variant={confirmation?.decision === 'reject' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => {
                if (confirmation) void decide(confirmation.approval, confirmation.decision)
              }}
            >
              {confirmation?.decision === 'reject' ? '确认拒绝' : '确认批准'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
