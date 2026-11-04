'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, GitBranch, Loader2, RefreshCw, RotateCcw, Rocket } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'

type UpdateRunState = 'running' | 'succeeded' | 'failed' | 'rolled-back'

type UpdateState = {
  status: UpdateRunState
  step?: string
  startedAt?: string
  finishedAt?: string | null
  fromCommit?: string | null
  toCommit?: string | null
  message?: string | null
  actor?: string | null
}

type RepoInfo = {
  isRepo: boolean
  branch?: string
  commit?: string
  shortCommit?: string
  subject?: string
  committedAt?: string
  remote?: string
  tags?: string[]
  dirtyCount?: number
}

type StatusPayload = {
  enabled: boolean
  canManage: boolean
  unitActive: boolean
  state: UpdateState | null
  repo: RepoInfo
  log: string[]
}

function statusVariant(status?: UpdateRunState | null) {
  if (status === 'succeeded') return 'success' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'rolled-back') return 'warning' as const
  return 'secondary' as const
}

export default function SystemUpdatePageClient() {
  const t = useT()
  const [payload, setPayload] = React.useState<StatusPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [offline, setOffline] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [refInput, setRefInput] = React.useState('')
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const result = await apiCall<StatusPayload>('/api/system_update/status', { method: 'GET' })
    if (!result.ok || !result.result) {
      setOffline(true)
      setError(t('system_update.error.load', 'Failed to load update status'))
      return
    }
    setOffline(false)
    setError(null)
    setPayload(result.result)
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const running = payload?.state?.status === 'running' || payload?.unitActive === true

  React.useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      void load()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [running, load])

  const start = async () => {
    setConfirmOpen(false)
    setBusy(true)
    setError(null)
    const result = await apiCall('/api/system_update/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref: refInput.trim() || undefined, confirm: payload?.repo?.shortCommit ?? '' }),
    })
    setBusy(false)
    if (!result.ok) {
      const detail = (result.result as { detail?: string; error?: string } | null) ?? null
      setError(detail?.detail || detail?.error || t('system_update.error.start', 'Failed to start the upgrade'))
      return
    }
    await load()
  }

  const repo = payload?.repo
  const state = payload?.state

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('system_update.page.title', 'System Update')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'system_update.page.subtitle',
              'Upgrade this deployment from the configured git remote with a pre-update tag, health check and automatic rollback.',
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className="mr-1 h-4 w-4" />
            {t('system_update.action.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {offline ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t(
              'system_update.offline',
              'The service is not reachable right now — an upgrade may be in progress. This page reconnects automatically.',
            )}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {payload && !payload.canManage ? (
        <div className="rounded-lg border p-3 text-sm">
          {t('system_update.noPermission', 'Only a superadmin can view or run upgrades.')}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4" />
            {t('system_update.current.title', 'Current deployment')}
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.current.branch', 'Branch')}</dt>
              <dd className="font-mono">{repo?.branch || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.current.commit', 'Commit')}</dt>
              <dd className="font-mono">{repo?.shortCommit || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.current.subject', 'Last change')}</dt>
              <dd className="max-w-[60%] truncate text-right" title={repo?.subject || ''}>
                {repo?.subject || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.current.remote', 'Remote')}</dt>
              <dd className="max-w-[60%] truncate text-right font-mono" title={repo?.remote || ''}>
                {repo?.remote || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.current.dirty', 'Uncommitted paths')}</dt>
              <dd className="font-mono">{repo?.dirtyCount ?? 0}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {state?.status === 'running' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state?.status === 'succeeded' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {t('system_update.status.title', 'Last upgrade')}
          </h3>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant={statusVariant(state?.status)}>
              {state?.status ? t(`system_update.status.${state.status}`, state.status) : t('system_update.status.none', 'never run')}
            </Badge>
            {state?.step ? <span className="text-xs text-muted-foreground">{state.step}</span> : null}
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.status.started', 'Started')}</dt>
              <dd className="font-mono text-xs">{state?.startedAt ? new Date(state.startedAt).toLocaleString() : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.status.finished', 'Finished')}</dt>
              <dd className="font-mono text-xs">{state?.finishedAt ? new Date(state.finishedAt).toLocaleString() : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('system_update.status.actor', 'Triggered by')}</dt>
              <dd className="max-w-[60%] truncate text-right text-xs">{state?.actor || '—'}</dd>
            </div>
            {state?.message ? (
              <div className="pt-1 text-xs text-muted-foreground break-words">{state.message}</div>
            ) : null}
          </dl>
        </section>
      </div>

      <section className="rounded-lg border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Rocket className="h-4 w-4" />
          {t('system_update.action.title', 'Run an upgrade')}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {t(
            'system_update.action.hint',
            'Checks out the remote HEAD (or the ref below), rebuilds and restarts the service. Expect a short outage; the previous commit is tagged and restored automatically on failure.',
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="system-update-ref">{t('system_update.action.ref', 'Target ref (optional)')}</Label>
            <Input
              id="system-update-ref"
              value={refInput}
              onChange={(event) => setRefInput(event.target.value)}
              placeholder={repo?.branch ? `origin/${repo.branch}` : 'origin/main'}
              disabled={running || busy}
            />
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!payload?.enabled || !payload?.canManage || running || busy}
          >
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            {running
              ? t('system_update.action.running', 'Upgrading…')
              : t('system_update.action.start', 'Upgrade now')}
          </Button>
        </div>
        {!payload?.enabled ? (
          <p className="mt-2 text-xs text-amber-700">
            {t('system_update.disabled', 'Disabled: ENABLE_SELF_UPDATE is not true on the server.')}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">{t('system_update.log.title', 'Upgrade log')}</h3>
        <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
          {payload?.log?.length ? payload.log.join('\n') : t('system_update.log.empty', 'No upgrade has run yet.')}
        </pre>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('system_update.confirm.title', 'Start the upgrade now?')}</DialogTitle>
            <DialogDescription>
              {t(
                'system_update.confirm.body',
                'The service will stop, rebuild and start again. Users see a short outage and the pages disconnect until it finishes.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('system_update.confirm.cancel', 'Cancel')}
            </Button>
            <Button onClick={() => void start()}>{t('system_update.confirm.ok', 'Start upgrade')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
