'use client'

import * as React from 'react'
import { AppWindow, Boxes, GitCommitHorizontal } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDateTime } from '@open-mercato/shared/lib/time'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { VersionSurfaces, VersionTargetStatus, VersionUpgradeSummary } from '../../../lib/versions'

type Props = {
  versions: VersionSurfaces | null
  versionsError?: string | null
}

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'outline' | 'neutral'

function versionText(value: string | null): string {
  if (!value) return '—'
  return /^\d/.test(value) ? `v${value}` : value
}

function when(value: string | null): string {
  return formatDateTime(value) ?? '—'
}

function targetMeta(status: VersionTargetStatus, kernel: boolean): {
  variant: BadgeVariant
  label: string
} {
  switch (status) {
    case 'available':
      return { variant: 'warning', label: kernel ? '有内核更新' : '有系统更新' }
    case 'none':
      return { variant: 'success', label: '无可用更新' }
    case 'blocked':
      return { variant: 'warning', label: '发布门禁未通过' }
    case 'unsupported':
      return { variant: 'neutral', label: '暂不支持检测' }
    case 'failed':
      return { variant: 'error', label: '检查失败' }
    default:
      return { variant: 'outline', label: '未知' }
  }
}

function summaryText(summary: VersionUpgradeSummary, t: ReturnType<typeof useT>): string {
  if (summary === 'mixed') {
    return t(
      'system_update.versions.summary.mixed',
      '检测到混合升级：内核与系统均有目标。实际仍按既有原子发布流程执行，本页不提供拆分热升级。',
    )
  }
  if (summary === 'app') return t('system_update.versions.summary.app', '检测到系统更新（ILA3 应用）。')
  if (summary === 'kernel') {
    return t('system_update.versions.summary.kernel', '检测到内核更新（Open Mercato 业务底座）。')
  }
  if (summary === 'unknown') {
    return t(
      'system_update.versions.summary.unknown',
      '版本检查未完成或存在失败，不能判断是否有升级。',
    )
  }
  return t('system_update.versions.summary.none', '当前没有可用的升级目标。')
}

function summaryLabel(summary: VersionUpgradeSummary, t: ReturnType<typeof useT>): string {
  if (summary === 'mixed') return t('system_update.versions.summary.badge.mixed', '混合升级')
  if (summary === 'app') return t('system_update.versions.summary.badge.app', '系统更新')
  if (summary === 'kernel') return t('system_update.versions.summary.badge.kernel', '内核更新')
  if (summary === 'unknown') return t('system_update.versions.summary.badge.unknown', '检查未完成')
  return t('system_update.versions.summary.badge.none', '无可用升级')
}

function summaryVariant(summary: VersionUpgradeSummary): BadgeVariant {
  if (summary === 'mixed') return 'warning'
  if (summary === 'app') return 'info'
  if (summary === 'kernel') return 'warning'
  if (summary === 'unknown') return 'neutral'
  return 'success'
}

function Field({
  label,
  children,
  mono = false,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? 'min-w-0 truncate text-right font-mono text-xs' : 'min-w-0 text-right'}>
        {children}
      </dd>
    </div>
  )
}

export default function VersionSurfacesPanel({ versions, versionsError }: Props) {
  const t = useT()

  if (versionsError) {
    return (
      <Alert status="warning" size="sm">
        {t('system_update.versions.error', '版本检查失败：{detail}', { detail: versionsError })}
      </Alert>
    )
  }

  if (!versions) {
    return (
      <Alert status="information" size="sm">
        {t(
          'system_update.versions.unavailable',
          '当前服务端未提供版本数据（可能正在滚动发布）。页面不会据此推断版本或升级目标。',
        )}
      </Alert>
    )
  }

  const { kernel, app, summary } = versions
  const kernelTarget = targetMeta(kernel.targetStatus, true)
  const appTarget = targetMeta(app.targetStatus, false)

  return (
    <section className="space-y-3" aria-labelledby="system-update-versions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="system-update-versions-title" className="flex items-center gap-2 text-sm font-semibold">
            <Boxes className="h-4 w-4" />
            {t('system_update.versions.title', '版本概览')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              'system_update.versions.subtitle',
              '内核（Open Mercato 业务底座）与系统（ILA3 应用）分别展示当前版本、可升级目标与来源。',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={summaryVariant(summary)} size="sm" dot>
            {summaryLabel(summary, t)}
          </Badge>
          <span>{t('system_update.versions.field.checkedAt', '检查时间')}: {when(versions.checkedAt)}</span>
        </div>
      </div>

      {summary !== 'none' ? (
        <Alert
          status={summary === 'mixed' || summary === 'kernel' ? 'warning' : 'information'}
          size="sm"
        >
          {summaryText(summary, t)}
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border p-4" aria-labelledby="system-update-kernel-title">
          <header className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h4 id="system-update-kernel-title" className="flex items-center gap-2 text-sm font-semibold">
                <Boxes className="h-4 w-4" />
                {t('system_update.versions.kernel.title', '内核版本（Open Mercato）')}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'system_update.versions.kernel.hint',
                  '运行发布槽位实际安装的 @open-mercato/* 包版本，不取自本地源码 package.json。',
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold">{versionText(kernel.currentVersion)}</div>
              <div className="text-xs text-muted-foreground">
                {t('system_update.versions.kernel.packages', '{count} 个包', { count: kernel.packages.length })}
              </div>
            </div>
          </header>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {kernel.consistent === true ? (
              <Badge variant="success" size="sm" dot>
                {t('system_update.versions.kernel.consistent', '包版本一致')}
              </Badge>
            ) : kernel.consistent === false ? (
              <Badge variant="error" size="sm" dot>
                {t('system_update.versions.kernel.inconsistent', '内核包版本不一致')}
              </Badge>
            ) : (
              <Badge variant="outline" size="sm">
                {t('system_update.versions.kernel.unreadable', '版本可读性未知')}
              </Badge>
            )}
            {kernel.distinctVersions.length > 1 ? (
              <span className="font-mono text-xs text-muted-foreground">
                {kernel.distinctVersions.join(' / ')}
              </span>
            ) : null}
          </div>

          {kernel.inconsistency ? (
            <div className="mb-3">
              <Alert status="warning" size="sm">
                {kernel.inconsistency}
              </Alert>
            </div>
          ) : null}

          <dl className="space-y-2 text-sm">
            <Field label={t('system_update.versions.field.status', '更新状态')}>
              <Badge variant={kernelTarget.variant} size="sm" dot>
                {t(`system_update.versions.status.${kernel.targetStatus}`, kernelTarget.label)}
              </Badge>
            </Field>
            <Field label={t('system_update.versions.field.target', '可升级目标')} mono>
              {kernel.targetVersion ? versionText(kernel.targetVersion) : '—'}
            </Field>
            {kernel.declaredVersion ? (
              <Field label={t('system_update.versions.field.declared', '声明版本')} mono>
                {kernel.declaredVersion}
              </Field>
            ) : null}
            {kernel.compatibility ? (
              <Field label={t('system_update.versions.kernel.riskCompat', '兼容性')}>
                {kernel.compatibility}
              </Field>
            ) : null}
            {kernel.migrationRisk ? (
              <Field label={t('system_update.versions.kernel.riskMigration', '迁移风险')}>
                {kernel.migrationRisk}
              </Field>
            ) : null}
            <Field label={t('system_update.versions.field.source', '来源')}>
              <span className="block max-w-56 truncate" title={kernel.source.detail ?? ''}>
                {kernel.source.label}
              </span>
            </Field>
            {kernel.targetStatus !== 'unsupported' ? (
              <Field label={t('system_update.versions.field.targetSource', '目标来源')}>
                <span className="block max-w-56 truncate" title={kernel.targetSource.detail ?? ''}>
                  {kernel.targetSource.label}
                </span>
              </Field>
            ) : null}
          </dl>

          {kernel.targetError ? (
            <p className="mt-2 break-words text-xs text-destructive">{kernel.targetError}</p>
          ) : null}
          {kernel.note ? <p className="mt-2 break-words text-xs text-muted-foreground">{kernel.note}</p> : null}
          {kernel.error ? <p className="mt-2 break-words text-xs text-destructive">{kernel.error}</p> : null}

          <p className="mt-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            {t(
              'system_update.versions.kernel.noAction',
              '内核更新需按依赖升级流程单独处理（含迁移与权限评估）；本页不提供一键更新内核。',
            )}
          </p>
        </article>

        <article className="rounded-lg border p-4" aria-labelledby="system-update-app-title">
          <header className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h4 id="system-update-app-title" className="flex items-center gap-2 text-sm font-semibold">
                <AppWindow className="h-4 w-4" />
                {t('system_update.versions.app.title', '系统版本（ILA3 应用）')}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'system_update.versions.app.hint',
                  '运行发布槽位 release.json 的语义版本；构建 SHA 与时间仅用于追踪。',
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold">{versionText(app.currentVersion)}</div>
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                <GitCommitHorizontal className="h-3 w-3" />
                <span title={app.currentSha ?? ''}>{app.currentShortSha ?? '—'}</span>
              </div>
            </div>
          </header>

          <dl className="space-y-2 text-sm">
            <Field label={t('system_update.versions.field.buildTime', '构建时间')} mono>
              {when(app.builtAt)}
            </Field>
            <Field label={t('system_update.versions.field.status', '更新状态')}>
              <Badge variant={appTarget.variant} size="sm" dot>
                {t(`system_update.versions.status.${app.targetStatus}`, appTarget.label)}
              </Badge>
            </Field>
            <Field label={t('system_update.versions.field.target', '可升级目标')}>
              <span className="font-mono">{app.targetVersion ? versionText(app.targetVersion) : '—'}</span>
              {app.targetShortSha ? (
                <span className="ml-1 font-mono text-xs text-muted-foreground">({app.targetShortSha})</span>
              ) : null}
            </Field>
            <Field label={t('system_update.versions.field.source', '来源')}>
              <span className="block max-w-56 truncate" title={app.targetSource.detail ?? ''}>
                {app.targetSource.label}
              </span>
            </Field>
            {app.behindCommits !== null ? (
              <Field label={t('system_update.versions.app.behind', '落后提交')} mono>
                {app.behindCommits}
              </Field>
            ) : null}
            {app.ciGate ? (
              <Field label={t('system_update.versions.app.gate', '发布门禁')}>
                <Badge
                  variant={app.ciGate.allow === true ? 'success' : app.ciGate.allow === false ? 'error' : 'outline'}
                  size="sm"
                  dot
                >
                  {app.ciGate.allow === true ? '允许' : app.ciGate.allow === false ? '拒绝' : '未知'}
                </Badge>
              </Field>
            ) : null}
          </dl>

          <p className="mt-2 text-xs text-muted-foreground">{app.targetVersionNote}</p>
          {app.targetError ? (
            <p className="mt-2 break-words text-xs text-destructive">{app.targetError}</p>
          ) : null}
          {app.note ? <p className="mt-2 break-words text-xs text-muted-foreground">{app.note}</p> : null}
          {app.error ? <p className="mt-2 break-words text-xs text-destructive">{app.error}</p> : null}

          <p className="mt-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
            {t(
              'system_update.versions.app.actionHint',
              '系统更新使用下方「发起升级」，仍走 CI 门禁 → 构建 → 候选健康检查 → 切换发布槽位的原子流程。',
            )}
          </p>
        </article>
      </div>

      {versions.notes.length ? (
        <details className="rounded-lg border p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">
            {t('system_update.versions.notes.title', '版本数据说明（{count}）', { count: versions.notes.length })}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {versions.notes.map((note, index) => (
              <li key={`${index}-${note}`} className="break-words">
                {note}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
