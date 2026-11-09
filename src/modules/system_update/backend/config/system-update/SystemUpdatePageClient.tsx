'use client'

import * as React from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  History,
  Loader2,
  RefreshCw,
  Rocket,
  RotateCcw,
  Server,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { ErrorState } from '@/components/states/ErrorState'
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
import {
  formatDuration,
  type CandidateDeployment,
  type DeployResult,
  type DeploymentRun,
  type DeploymentStatus,
  type RunningDeployment,
} from '../../../lib/deployment'

type UpdateRunState = 'running' | 'succeeded' | 'failed' | 'rolled-back'

type UpdateState = {
  status: UpdateRunState
  step?: string
  startedAt?: string
  finishedAt?: string | null
  fromCommit?: string | null
  toCommit?: string | null
  fromVersion?: string | null
  toVersion?: string | null
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
  version?: string
  releaseLabel?: string
  releaseTags?: string[]
  runningVersion?: string
  runningCommit?: string
  runningBuiltAt?: string
  dirtyCount?: number
}

type StatusPayload = {
  enabled: boolean
  canManage: boolean
  unitActive: boolean
  state: UpdateState | null
  stateDerived?: boolean
  repo: RepoInfo
  log: string[]
  /** Present on the new API. Optional so a rolling deploy can still render. */
  deployment?: DeploymentStatus | null
}

const RESULT_LABEL: Record<DeployResult, string> = {
  deployed: '已部署',
  'already-current': '已是最新（未重启）',
  refused: '已拒绝',
  failed: '失败',
  'rolled-back': '已回滚',
  'rollback-failed': '回滚失败',
  running: '进行中',
  unknown: '未知',
}

function resultVariant(result: DeployResult) {
  if (result === 'deployed' || result === 'already-current') return 'success' as const
  if (result === 'refused' || result === 'rolled-back' || result === 'running') {
    return 'warning' as const
  }
  if (result === 'failed' || result === 'rollback-failed') return 'error' as const
  return 'outline' as const
}

function statusVariant(status?: UpdateRunState | null) {
  if (status === 'succeeded') return 'success' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'rolled-back') return 'warning' as const
  return 'secondary' as const
}

function when(value?: string | null): string {
  return formatDateTime(value) ?? '—'
}

function runReason(run: DeploymentRun): string {
  if (run.error?.text) return run.error.text
  if (run.failedSteps.length) return `失败步骤：${run.failedSteps.join('、')}`
  return '—'
}

export default function SystemUpdatePageClient() {
  const t = useT()
  const [payload, setPayload] = React.useState<StatusPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [offline, setOffline] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [refInput, setRefInput] = React.useState('')
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [submittedAt, setSubmittedAt] = React.useState<string | null>(null)

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

  const deployment = payload?.deployment ?? null
  const running: RunningDeployment | null = deployment?.running ?? null
  const candidate: CandidateDeployment | null = deployment?.candidate ?? null
  const lock = deployment?.lock ?? null
  const latest = deployment?.latest ?? null
  const relation = deployment?.relation ?? 'unknown'
  const behindCommits = deployment?.behindCommits ?? null

  // Liveness compatibility: a legacy `running` record only counts as live while
  // its unit is actually active. `reconcileLiveness` already turned an inactive
  // record into `failed` in the payload, so this is the same rule, reused.
  const legacyRunning = payload?.unitActive === true && payload?.state?.status === 'running'
  const lockHeld = lock?.held === true
  const submittedRecently = submittedAt
    ? Date.now() - Date.parse(submittedAt) < 3 * 60 * 1000
    : false
  const active = lockHeld || legacyRunning || submittedRecently

  React.useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => {
      void load()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [active, load])

  const start = async () => {
    setConfirmOpen(false)
    setBusy(true)
    setError(null)
    const result = await apiCall('/api/system_update/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ref: refInput.trim() || undefined,
        // Echo the RUNNING commit (what the upgrade would replace); the checkout
        // HEAD may already be ahead of it after a push.
        confirm:
          payload?.deployment?.running?.shortSha ??
          payload?.repo?.runningCommit?.slice(0, 8) ??
          payload?.repo?.shortCommit ??
          '',
      }),
    })
    setBusy(false)
    if (!result.ok) {
      const detail = (result.result as { detail?: string; error?: string } | null) ?? null
      setError(detail?.detail || detail?.error || t('system_update.error.start', 'Failed to start the upgrade'))
      return
    }
    setSubmittedAt(new Date().toISOString())
    await load()
  }

  const tableRuns = React.useMemo(() => {
    const current = payload?.deployment
    if (!current) return [] as DeploymentRun[]
    const all = current.latest ? [current.latest, ...current.recentRuns] : current.recentRuns
    const seen = new Set<string>()
    const unique: DeploymentRun[] = []
    for (const run of all) {
      if (seen.has(run.runId)) continue
      seen.add(run.runId)
      unique.push(run)
      if (unique.length >= 6) break
    }
    return unique
  }, [payload])

  const relationLabel = () => {
    if (relation === 'same') return t('system_update.deploy.relation.same', '一致')
    if (relation === 'behind') {
      return behindCommits !== null
        ? t('system_update.deploy.relation.behindCount', '落后 {count} 个提交', { count: behindCommits })
        : t('system_update.deploy.relation.behind', '落后于最新候选')
    }
    if (relation === 'ahead') return t('system_update.deploy.relation.ahead', '运行版本更新')
    if (relation === 'diverged') return t('system_update.deploy.relation.diverged', '已分叉')
    return t('system_update.deploy.relation.unknown', '无法判定')
  }

  const relationBadgeVariant = () => {
    if (relation === 'same') return 'success' as const
    if (relation === 'behind') return 'warning' as const
    if (relation === 'diverged') return 'error' as const
    return 'outline' as const
  }

  const candidateSourceLabel = () => {
    if (candidate?.source === 'origin/main') {
      return t('system_update.deploy.candidate.sourceOrigin', 'origin/main（本地跟踪 ref）')
    }
    if (candidate?.source === 'gates/latest.json') {
      return t('system_update.deploy.candidate.sourceGate', 'gates/latest.json 发布门禁')
    }
    return '—'
  }

  const entryLabel = (run: DeploymentRun) => {
    const base =
      run.entry === 'auto'
        ? t('system_update.deploy.entry.auto', '自动')
        : run.entry === 'manual'
          ? t('system_update.deploy.entry.manual', '手动')
          : '—'
    return run.drill ? `${base} · ${t('system_update.deploy.entry.drill', '演练')}` : base
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('system_update.page.title', 'System Update')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'system_update.deploy.page.subtitle',
              '真实发布状态：当前运行版本、最新候选与 ila3-auto-deploy 发布记录（只读）。',
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
        <ErrorState
          title={t('system_update.error.load', '无法加载升级状态')}
          detail={error}
          onRetry={() => void load()}
        />
      ) : null}

      {!payload && !error ? (
        <div aria-busy="true" role="status" className="space-y-3 rounded-lg border p-4">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
        </div>
      ) : null}

      {payload && !payload.canManage ? (
        <div className="rounded-lg border p-3 text-sm">
          {t('system_update.noPermission', 'Only a superadmin can view or run upgrades.')}
        </div>
      ) : null}

      {payload ? (
        <>
      {deployment ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Badge
            variant={lockHeld ? 'warning' : lock?.held === false ? 'neutral' : 'outline'}
            size="sm"
            dot
          >
            {lockHeld
              ? t('system_update.deploy.lock.held', '发布进行中')
              : lock?.held === false
                ? t('system_update.deploy.lock.free', '发布锁空闲')
                : t('system_update.deploy.lock.unknown', '发布锁状态未知')}
          </Badge>
          <span>{t('system_update.deploy.checkedAt', '读取于 {time}', { time: when(deployment.checkedAt) })}</span>
          {lock?.staleFile ? (
            <span>{t('system_update.deploy.lock.staleFile', '锁文件为 flock 遗留，不视为进行中')}</span>
          ) : null}
        </div>
      ) : null}

      {lockHeld ? (
        <div className="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span>
            {t(
              'system_update.deploy.inProgress',
              '发布进行中：ila3-auto-deploy 持有发布锁。进度见下方发布记录，页面每 5 秒自动刷新。',
            )}
          </span>
        </div>
      ) : null}

      {relation === 'behind' ? (
        <div className="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {behindCommits !== null
              ? t(
                  'system_update.deploy.behindBannerCount',
                  '有新提交待发布：当前 {running} → 候选 {candidate}，落后 {count} 个提交。',
                  {
                    running: running?.shortSha ?? '—',
                    candidate: candidate?.shortSha ?? '—',
                    count: behindCommits,
                  },
                )
              : t(
                  'system_update.deploy.behindBanner',
                  '有新提交待发布：当前 {running} → 候选 {candidate}。',
                  { running: running?.shortSha ?? '—', candidate: candidate?.shortSha ?? '—' },
                )}
          </span>
        </div>
      ) : null}

      {deployment && !deployment.stateDirExists ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t(
              'system_update.deploy.unavailable',
              '未接入发布记录：{path} 不存在。页面不会伪造版本、时间或结果。',
              { path: deployment.stateDir },
            )}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Server className="h-4 w-4" />
            {t('system_update.deploy.running.title', '当前运行版本')}
          </h3>
          {running ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.commit', '提交')}</dt>
                <dd className="font-mono" title={running.sha ?? ''}>
                  {running.shortSha ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.builtAt', '构建时间')}</dt>
                <dd className="font-mono text-xs">{when(running.builtAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.version', '版本')}</dt>
                <dd className="font-mono">{running.version ? `v${running.version}` : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.location', '运行位置')}</dt>
                <dd className="flex min-w-0 items-center justify-end gap-2 text-right">
                  <Badge variant={running.kind === 'release' ? 'info' : 'warning'} size="sm">
                    {running.kind === 'release'
                      ? t('system_update.deploy.location.release', '发布槽位')
                      : t('system_update.deploy.location.dev', '非发布槽位')}
                  </Badge>
                  <span
                    className="max-w-[220px] truncate font-mono text-xs"
                    title={running.cwd ?? ''}
                  >
                    {running.kind === 'release' ? running.releaseDir ?? '—' : running.cwd ?? '—'}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.process', '进程')}</dt>
                <dd className="font-mono text-xs">
                  {running.pid !== null
                    ? `pid ${running.pid} · :${running.port}`
                    : t('system_update.deploy.process.notFound', '{port} 端口未找到监听进程', {
                        port: running.port,
                      })}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('system_update.deploy.running.none', '未找到运行中的服务。')}
            </p>
          )}
          {running?.source === 'process.cwd' ? (
            <p className="mt-3 text-xs text-amber-700">
              {t(
                'system_update.deploy.running.fallback',
                '未能从 3000 端口进程解析运行目录，以上位置取自当前服务进程 cwd，可能不是生产发布槽位。',
              )}
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4" />
            {t('system_update.deploy.candidate.title', '最新候选')}
          </h3>
          {candidate?.found ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.commit', '提交')}</dt>
                <dd className="font-mono" title={candidate.sha ?? ''}>
                  {candidate.shortSha ?? '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.relation', '当前运行')}</dt>
                <dd>
                  <Badge variant={relationBadgeVariant()} size="sm" dot>
                    {relationLabel()}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.source', '来源')}</dt>
                <dd className="max-w-[62%] truncate text-right font-mono text-xs" title={candidateSourceLabel()}>
                  {candidateSourceLabel()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.committedAt', '提交时间')}</dt>
                <dd className="font-mono text-xs">{when(candidate.committedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t('system_update.deploy.field.subject', '提交说明')}</dt>
                <dd className="max-w-[62%] truncate text-right text-xs" title={candidate.subject ?? ''}>
                  {candidate.subject ?? '—'}
                </dd>
              </div>
              {candidate.ciGate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('system_update.deploy.field.gate', '发布门禁')}</dt>
                  <dd className="max-w-[62%] text-right text-xs">
                    <Badge
                      variant={
                        candidate.ciGate.allow === true
                          ? 'success'
                          : candidate.ciGate.allow === false
                            ? 'error'
                            : 'outline'
                      }
                      size="sm"
                      dot
                    >
                      {candidate.ciGate.allow === true
                        ? t('system_update.deploy.gate.allow', '允许')
                        : candidate.ciGate.allow === false
                          ? t('system_update.deploy.gate.deny', '拒绝')
                          : t('system_update.deploy.gate.unknown', '未知')}
                    </Badge>
                    {candidate.ciGate.reason ? (
                      <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={candidate.ciGate.reason}>
                        {candidate.ciGate.reason}
                      </div>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('system_update.deploy.candidate.none', '无记录：无法读取 origin/main 或发布门禁。')}
            </p>
          )}
          {candidate?.error ? (
            <p className="mt-3 break-words text-xs text-amber-700">{candidate.error}</p>
          ) : null}
        </section>
      </div>

      <section className="rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" />
            {t('system_update.deploy.runs.title', '最近发布记录')}
          </h3>
          {latest ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t('system_update.deploy.latest.label', '最近一次')}</span>
              <Badge variant={resultVariant(latest.result)} size="sm" dot>
                {t(`system_update.deploy.result.${latest.result}`, RESULT_LABEL[latest.result])}
              </Badge>
              <span className="font-mono">{when(latest.startedAt)}</span>
              <span>·</span>
              <span>{entryLabel(latest)}</span>
              <span>·</span>
              <span className="font-mono" title={latest.sha ?? ''}>{latest.shortSha ?? '—'}</span>
            </div>
          ) : null}
        </div>

        {tableRuns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{t('system_update.deploy.table.time', '时间')}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{t('system_update.deploy.table.result', '结果')}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{t('system_update.deploy.table.entry', '入口')}</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">{t('system_update.deploy.table.sha', 'SHA')}</th>
                  <th className="px-3 py-2 font-medium">{t('system_update.deploy.table.reason', '失败原因')}</th>
                </tr>
              </thead>
              <tbody>
                {tableRuns.map((run) => (
                  <tr key={run.runId} className="border-b align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                      <div>{when(run.startedAt)}</div>
                      {run.durationMs !== null ? (
                        <div className="text-[11px] text-muted-foreground">{formatDuration(run.durationMs)}</div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge variant={resultVariant(run.result)} size="sm" dot>
                        {t(`system_update.deploy.result.${run.result}`, RESULT_LABEL[run.result])}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{entryLabel(run)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs" title={run.sha ?? ''}>
                      {run.shortSha ?? '—'}
                    </td>
                    <td className="max-w-[460px] break-words px-3 py-2.5 text-xs text-muted-foreground">
                      {runReason(run)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('system_update.deploy.runs.empty', '无发布记录。')}
          </p>
        )}
      </section>

      <section className="rounded-lg border p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Rocket className="h-4 w-4" />
          {t('system_update.deploy.action.title', '发起升级')}
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {t(
            'system_update.deploy.action.hint',
            '提交后由 ila3-auto-deploy 执行：CI 门禁 → 构建 release → 候选健康检查 → 切换发布槽位。进度以上方发布记录为准，不再使用旧的“检出/打标签”更新器。',
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="system-update-ref">{t('system_update.action.ref', '目标 ref（可选）')}</Label>
            <Input
              id="system-update-ref"
              value={refInput}
              onChange={(event) => setRefInput(event.target.value)}
              placeholder="origin/main"
              disabled={lockHeld || legacyRunning || busy}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(
                'system_update.deploy.action.refHint',
                '仅支持 main / origin/main 或完整 40 位 SHA；发布标签不再作为升级目标。',
              )}
            </p>
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!payload?.enabled || !payload?.canManage || lockHeld || legacyRunning || busy}
          >
            {lockHeld || legacyRunning ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-1 h-4 w-4" />
            )}
            {lockHeld || legacyRunning
              ? t('system_update.deploy.action.inProgress', '发布进行中…')
              : t('system_update.action.start', 'Upgrade now')}
          </Button>
        </div>
        {submittedAt ? (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t('system_update.deploy.action.submitted', '已提交，进度见发布记录。')}
              {' '}
              {t('system_update.deploy.action.submittedAt', '提交于 {time}', { time: when(submittedAt) })}
            </span>
          </div>
        ) : null}
        {!payload?.enabled ? (
          <p className="mt-2 text-xs text-amber-700">
            {t('system_update.disabled', 'Disabled: ENABLE_SELF_UPDATE is not true on the server.')}
          </p>
        ) : null}
      </section>

      {payload?.state ? (
        <section className="rounded-lg border border-dashed p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <RotateCcw className="h-4 w-4" />
            {t('system_update.deploy.legacy.title', '旧升级请求记录（兼容）')}
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {t(
              'system_update.deploy.legacy.hint',
              '旧的 system-update 状态仅作兼容展示；真实发布结果以上方发布记录为准。',
            )}
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={statusVariant(payload.state.status)} size="sm">
              {t(`system_update.status.${payload.state.status}`, payload.state.status)}
            </Badge>
            {payload.state.step ? <span className="text-muted-foreground">{payload.state.step}</span> : null}
            <span className="text-muted-foreground">
              {t('system_update.status.started', 'Started')}: {when(payload.state.startedAt)}
            </span>
            <span className="text-muted-foreground">
              {t('system_update.status.actor', 'Triggered by')}: {payload.state.actor || '—'}
            </span>
          </div>
          {payload.stateDerived ? (
            <p className="text-xs text-amber-700">
              {t(
                'system_update.deploy.legacy.derived',
                '记录为 running，但对应 unit 已不活跃，按失败展示；state.json 原记录未改写。',
              )}
            </p>
          ) : null}
          {payload.state.message ? (
            <p className="mt-2 break-words text-xs text-muted-foreground">{payload.state.message}</p>
          ) : null}
        </section>
      ) : null}

      {payload?.log?.length ? (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {t('system_update.deploy.legacy.logTitle', '旧升级器日志（兼容）')}
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto rounded bg-muted p-3 text-xs leading-relaxed">
            {payload.log.join('\n')}
          </pre>
        </details>
      ) : null}

      {deployment ? (
        <div className="space-y-2 text-[11px] text-muted-foreground">
          <p>
            {t(
              'system_update.deploy.footer.source',
              '发布记录目录：{stateDir} · 发布槽位根：{releasesRoot} · 只读',
              { stateDir: deployment.stateDir, releasesRoot: deployment.releasesRoot },
            )}
          </p>
          {deployment.notes.length ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer font-medium">
                {t('system_update.deploy.notes.title', '数据说明（{count}）', {
                  count: deployment.notes.length,
                })}
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {deployment.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="break-words">
                    {note}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
        </>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('system_update.confirm.title', '确认立即升级？')}</DialogTitle>
            <DialogDescription>
              {t(
                'system_update.deploy.confirm.body',
                '将提交给 ila3-auto-deploy：先过 CI 门禁，再构建 release 并做候选健康检查，通过后切换发布槽位。期间会有短暂中断，进度见发布记录。',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('system_update.confirm.cancel', '取消')}
            </Button>
            <Button onClick={() => void start()}>{t('system_update.confirm.ok', '开始升级')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
