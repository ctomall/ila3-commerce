'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'

type MergedModel = {
  entryId: string | null
  providerId: string
  modelId: string
  name: string
  contextWindow: number | null
  tags: string[]
  enabled: boolean
  builtin: boolean
  overridden: boolean
}

type ProviderInfo = {
  id: string
  name: string
  configured: boolean
  envKey: string | null
  builtinModelCount: number
  customModelCount: number
  enabledModelCount: number
}

type CatalogResponse = {
  providers: ProviderInfo[]
  models: MergedModel[]
  scope: { tenantId: string | null }
}

type ProviderRow = {
  id: string
  name: string
  builtin: boolean
  protocol: string
  configured: boolean
  keySource: 'env' | 'settings' | 'none'
  envKey: string | null
  baseURL: string | null
  defaultModel: string
  modelCount: number
  enabled: boolean
}

type SystemDefault = {
  providerId: string
  modelId: string
  updatedAt: string
}

type ProviderListResponse = {
  providers: ProviderRow[]
  systemDefault: SystemDefault | null
}

type AiModelTag = 'flagship' | 'reasoning' | 'coding' | 'vision' | 'budget' | 'fast'

const TAG_OPTIONS: Array<{ value: AiModelTag; key: string; label: string }> = [
  { value: 'flagship', key: 'ai_assistant.models.tag.flagship', label: 'Flagship' },
  { value: 'reasoning', key: 'ai_assistant.models.tag.reasoning', label: 'Reasoning' },
  { value: 'coding', key: 'ai_assistant.models.tag.coding', label: 'Coding' },
  { value: 'vision', key: 'ai_assistant.models.tag.vision', label: 'Vision' },
  { value: 'budget', key: 'ai_assistant.models.tag.budget', label: 'Budget' },
  { value: 'fast', key: 'ai_assistant.models.tag.fast', label: 'Fast' },
]

const ALL_PROVIDERS = '__all__'

async function fetchCatalog(): Promise<CatalogResponse> {
  const result = await apiCall<CatalogResponse>('/api/ai_model_config/models', { method: 'GET' })
  if (!result.ok || !result.result) throw new Error('Failed to load the model catalog')
  return result.result
}

async function fetchProviders(): Promise<ProviderListResponse> {
  const result = await apiCall<ProviderListResponse>('/api/ai_model_config/providers', { method: 'GET' })
  if (!result.ok || !result.result) throw new Error('Failed to load providers')
  return result.result
}

async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const result = await apiCall<T>(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!result.ok) {
    const message = (result.result as { error?: string } | null)?.error
    throw new Error(message ?? `Request failed (${result.status})`)
  }
  return result.result as T
}

function formatContext(value: number | null): string {
  if (!value) return '—'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}

function tagLabel(tag: string, t: (key: string, fallback?: string) => string): string {
  const option = TAG_OPTIONS.find((entry) => entry.value === tag)
  return option ? t(option.key, option.label) : tag
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; row: MergedModel }
  | null

export default function ModelCatalogPageClient() {
  const t = useT()
  const queryClient = useQueryClient()
  const catalogQuery = useQuery({ queryKey: ['ai_model_config', 'catalog'], queryFn: fetchCatalog, staleTime: 0 })
  const providersQuery = useQuery({ queryKey: ['ai_model_config', 'providers'], queryFn: fetchProviders, staleTime: 0 })

  const [search, setSearch] = React.useState('')
  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_PROVIDERS)
  const [editor, setEditor] = React.useState<EditorState>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<MergedModel | null>(null)
  const [busyRow, setBusyRow] = React.useState<string | null>(null)
  const [savingDefault, setSavingDefault] = React.useState(false)
  const [bannerError, setBannerError] = React.useState<string | null>(null)

  const [defaultProviderId, setDefaultProviderId] = React.useState('')
  const [defaultModelId, setDefaultModelId] = React.useState('')

  const { runMutation } = useGuardedMutation({ contextId: 'ai-model-catalog' })

  const providers = catalogQuery.data?.providers ?? []
  const models = catalogQuery.data?.models ?? []
  const providerById = React.useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  )

  const currentDefault = React.useMemo(() => {
    const systemDefault = providersQuery.data?.systemDefault
    if (systemDefault?.providerId && systemDefault.modelId) {
      return { providerId: systemDefault.providerId, modelId: systemDefault.modelId }
    }
    return null
  }, [providersQuery.data])

  React.useEffect(() => {
    if (!currentDefault) return
    setDefaultProviderId((previous) => previous || currentDefault.providerId)
    setDefaultModelId((previous) => previous || currentDefault.modelId)
  }, [currentDefault])

  const defaultProviderModels = React.useMemo(
    () => models.filter((model) => model.providerId === defaultProviderId && model.enabled),
    [models, defaultProviderId],
  )

  const filteredModels = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return models.filter((model) => {
      if (providerFilter !== ALL_PROVIDERS && model.providerId !== providerFilter) return false
      if (!needle) return true
      return (
        model.name.toLowerCase().includes(needle)
        || model.modelId.toLowerCase().includes(needle)
        || model.providerId.toLowerCase().includes(needle)
      )
    })
  }, [models, providerFilter, search])

  const stats = React.useMemo(() => {
    const enabled = models.filter((model) => model.enabled).length
    const custom = models.filter((model) => !model.builtin).length
    const configuredProviders = providers.filter((provider) => provider.configured).length
    return { total: models.length, enabled, custom, configuredProviders, providerCount: providers.length }
  }, [models, providers])

  const invalidate = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ai_model_config', 'catalog'] }),
      queryClient.invalidateQueries({ queryKey: ['ai_model_config', 'providers'] }),
      queryClient.invalidateQueries({ queryKey: ['ai_assistant', 'settings'] }),
    ])
  }, [queryClient])

  const reportError = React.useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    setBannerError(message)
    flash(message, 'error')
  }, [])

  const handleSaveDefault = React.useCallback(async () => {
    if (!defaultProviderId || !defaultModelId) return
    setSavingDefault(true)
    setBannerError(null)
    try {
      await runMutation({
        operation: async () => {
          await sendJson('/api/ai_model_config/default', 'PUT', {
            providerId: defaultProviderId,
            modelId: defaultModelId,
          })
        },
        context: {},
      })
      flash(t('ai_assistant.models.default.saved', 'Default model saved.'), 'success')
      await invalidate()
    } catch (error) {
      reportError(error)
    } finally {
      setSavingDefault(false)
    }
  }, [defaultModelId, defaultProviderId, invalidate, reportError, runMutation, t])

  const handleClearDefault = React.useCallback(async () => {
    setSavingDefault(true)
    setBannerError(null)
    try {
      await runMutation({
        operation: async () => {
          await sendJson('/api/ai_model_config/default', 'DELETE', {})
        },
        context: {},
      })
      flash(t('ai_assistant.models.default.cleared', 'Default model cleared.'), 'success')
      await invalidate()
    } catch (error) {
      reportError(error)
    } finally {
      setSavingDefault(false)
    }
  }, [invalidate, reportError, runMutation, t])

  const handleSetDefault = React.useCallback(
    async (model: MergedModel) => {
      setDefaultProviderId(model.providerId)
      setDefaultModelId(model.modelId)
      setSavingDefault(true)
      setBannerError(null)
      try {
        await runMutation({
          operation: async () => {
            await sendJson('/api/ai_model_config/default', 'PUT', {
              providerId: model.providerId,
              modelId: model.modelId,
            })
          },
          context: {},
        })
        flash(t('ai_assistant.models.default.saved', 'Default model saved.'), 'success')
        await invalidate()
      } catch (error) {
        reportError(error)
      } finally {
        setSavingDefault(false)
      }
    },
    [invalidate, reportError, runMutation, t],
  )

  const handleToggleEnabled = React.useCallback(
    async (row: MergedModel) => {
      setBusyRow(`${row.providerId}:${row.modelId}`)
      setBannerError(null)
      const clearsSystemDefault = row.enabled
        && currentDefault?.providerId === row.providerId
        && currentDefault.modelId === row.modelId
      try {
        await runMutation({
          operation: async () => {
            if (row.entryId) {
              await sendJson(`/api/ai_model_config/models/${row.entryId}`, 'PUT', { enabled: !row.enabled })
            } else {
              await sendJson('/api/ai_model_config/models', 'POST', {
                providerId: row.providerId,
                modelId: row.modelId,
                name: row.name,
                contextWindow: row.contextWindow,
                tags: row.tags,
                enabled: false,
              })
            }
            if (clearsSystemDefault) {
              await sendJson('/api/ai_model_config/default', 'DELETE', {})
            }
          },
          context: {},
        })
        if (clearsSystemDefault) {
          queryClient.setQueryData<ProviderListResponse | undefined>(
            ['ai_model_config', 'providers'],
            (previous) => (previous ? { ...previous, systemDefault: null } : previous),
          )
          setDefaultProviderId('')
          setDefaultModelId('')
          flash(
            t(
              'ai_assistant.models.default.clearedBecauseDisabled',
              'Model disabled. The system default was cleared because it pointed at this model.',
            ),
            'info',
          )
        } else {
          flash(
            row.enabled
              ? t('ai_assistant.models.disabledToast', 'Model disabled.')
              : t('ai_assistant.models.enabledToast', 'Model enabled.'),
            'success',
          )
        }
        await invalidate()
      } catch (error) {
        reportError(error)
      } finally {
        setBusyRow(null)
      }
    },
    [currentDefault, invalidate, reportError, runMutation, t],
  )

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget?.entryId) return
    setBusyRow(`${deleteTarget.providerId}:${deleteTarget.modelId}`)
    setBannerError(null)
    try {
      await runMutation({
        operation: async () => {
          await sendJson(`/api/ai_model_config/models/${deleteTarget.entryId}`, 'DELETE')
        },
        context: {},
      })
      flash(
        deleteTarget.builtin
          ? t('ai_assistant.models.restoredToast', 'Built-in model restored.')
          : t('ai_assistant.models.deletedToast', 'Model deleted.'),
        'success',
      )
      setDeleteTarget(null)
      await invalidate()
    } catch (error) {
      reportError(error)
    } finally {
      setBusyRow(null)
    }
  }, [deleteTarget, invalidate, reportError, runMutation, t])

  const pageHeader = (
    <div className="space-y-2">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Cpu className="size-6" aria-hidden />
        {t('ai_assistant.models.title', 'Model Configuration')}
      </h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t(
          'ai_assistant.models.subtitle',
          'Manage the models the AI assistant can use. Add any model id supported by a provider, rename or retag built-in models, disable the ones you do not want, and choose the tenant-wide default.',
        )}
      </p>
    </div>
  )

  if (catalogQuery.isLoading || providersQuery.isLoading) {
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        {pageHeader}
        <div className="flex w-fit items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('ai_assistant.models.loading', 'Loading model catalog…')}
        </div>
      </div>
    )
  }

  if (catalogQuery.isError) {
    return (
      <div className="flex max-w-6xl flex-col gap-6">
        {pageHeader}
        <div className="rounded-md border border-status-error-border bg-status-error-bg px-4 py-3 text-sm text-status-error-text">
          {t('ai_assistant.models.loadError', 'Could not load the model catalog.')}
          <Button type="button" variant="outline" size="sm" className="ml-3" onClick={() => void catalogQuery.refetch()}>
            {t('ai_assistant.models.retry', 'Retry')}
          </Button>
        </div>
      </div>
    )
  }

  const configuredProviderCountLabel = t(
    'ai_assistant.models.providerSummary',
    '{{count}} providers configured',
  ).replace('{{count}}', String(stats.providerCount))

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      {pageHeader}

      {bannerError ? (
        <div className="flex items-start gap-2 rounded-md border border-status-error-border bg-status-error-bg px-4 py-3 text-sm text-status-error-text">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">{bannerError}</span>
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            onClick={() => setBannerError(null)}
          >
            {t('ai_assistant.models.dismiss', 'Dismiss')}
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t('ai_assistant.models.default.title', 'Default model')}</h2>
            <p className="max-w-xl text-xs text-muted-foreground">
              {t(
                'ai_assistant.models.default.description',
                'The system-wide AI base model. Every module, agent and conversation without an explicit override uses it.',
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              <span>
                {t('ai_assistant.models.default.current', 'Current:')}
              </span>
              {currentDefault ? (
                <>
                  <Badge variant="neutral" size="sm">
                    {providerById.get(currentDefault.providerId)?.name ?? currentDefault.providerId}
                  </Badge>
                  <span className="font-mono text-foreground">{currentDefault.modelId}</span>
                  <Badge variant="brand" size="sm">
                    {t('ai_assistant.models.default.sourceSystem', 'System default')}
                  </Badge>
                </>
              ) : (
                <span>{t('ai_assistant.models.default.none', 'Not resolved yet')}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                {t('ai_assistant.models.default.provider', 'Provider')}
              </Label>
              <Select
                value={defaultProviderId}
                onValueChange={(value) => {
                  setDefaultProviderId(value)
                  setDefaultModelId('')
                }}
                disabled={savingDefault}
              >
                <SelectTrigger className="w-[190px]" data-ai-models-default-provider="">
                  <SelectValue placeholder={t('ai_assistant.models.default.selectProvider', 'Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      <span className="flex items-center gap-2">
                        {provider.name}
                        {!provider.configured ? (
                          <span className="text-[10px] text-muted-foreground">
                            {t('ai_assistant.models.notConfigured', 'no credentials')}
                          </span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">
                {t('ai_assistant.models.default.model', 'Model')}
              </Label>
              <Select
                value={defaultModelId}
                onValueChange={setDefaultModelId}
                disabled={savingDefault || !defaultProviderId}
              >
                <SelectTrigger className="w-[240px]" data-ai-models-default-model="">
                  <SelectValue placeholder={t('ai_assistant.models.default.selectModel', 'Select model')} />
                </SelectTrigger>
                <SelectContent>
                  {defaultProviderModels.map((model) => (
                    <SelectItem key={`${model.providerId}:${model.modelId}`} value={model.modelId}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={savingDefault || !defaultProviderId || !defaultModelId}
              onClick={() => void handleSaveDefault()}
              data-ai-models-default-save=""
            >
              {savingDefault ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {t('ai_assistant.models.default.save', 'Save default')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={savingDefault || !providersQuery.data?.systemDefault}
              onClick={() => void handleClearDefault()}
              data-ai-models-default-clear=""
            >
              {t('ai_assistant.models.default.clear', 'Clear default')}
            </Button>
          </div>
        </div>
        {defaultProviderId && !providerById.get(defaultProviderId)?.configured ? (
          <p className="mt-3 flex items-center gap-1.5 rounded-md border border-status-warning-border bg-status-warning-bg/60 px-3 py-1.5 text-[11px] text-status-warning-text">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            {t(
              'ai_assistant.models.default.unconfiguredWarning',
              'This provider has no API key configured yet. Set its environment variable before relying on this default in a conversation.',
            )}
          </p>
        ) : null}
      </div>

      <ProviderSection
        providers={providersQuery.data?.providers ?? []}
        loading={providersQuery.isLoading}
        onChanged={invalidate}
        onError={reportError}
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{t('ai_assistant.models.catalog.title', 'Model catalog')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('ai_assistant.models.catalog.summary', '{{total}} models · {{enabled}} enabled · {{custom}} custom · {{providers}}')
                .replace('{{total}}', String(stats.total))
                .replace('{{enabled}}', String(stats.enabled))
                .replace('{{custom}}', String(stats.custom))
                .replace('{{providers}}', configuredProviderCountLabel)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('ai_assistant.models.searchPlaceholder', 'Search models…')}
                className="h-8 w-[210px] pl-8 text-xs"
                aria-label={t('ai_assistant.models.searchAria', 'Search models')}
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs" data-ai-models-provider-filter="">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROVIDERS}>{t('ai_assistant.models.allProviders', 'All providers')}</SelectItem>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => { void catalogQuery.refetch(); void providersQuery.refetch() }}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              {t('ai_assistant.models.refresh', 'Refresh')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setEditor({ mode: 'create' })}
              data-ai-models-add=""
            >
              <Plus className="size-3.5" aria-hidden />
              {t('ai_assistant.models.add', 'Add model')}
            </Button>
          </div>
        </div>

        {filteredModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <Cpu className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {providers.length === 0
                ? t('ai_assistant.models.empty.noProvidersTitle', 'No provider configured')
                : t('ai_assistant.models.empty.title', 'No models match')}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              {providers.length === 0
                ? t(
                    'ai_assistant.models.empty.noProvidersDescription',
                    'Configure a provider key above — the system will fetch its models automatically. Only models from providers with a saved key are shown here.',
                  )
                : t(
                    'ai_assistant.models.empty.description',
                    'Adjust the filters, or add a model id that your provider supports — for example a newly released or self-hosted model.',
                  )}
            </p>
            {providers.length === 0 ? null : (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditor({ mode: 'create' })}>
                <Plus className="size-3.5" aria-hidden />
                {t('ai_assistant.models.add', 'Add model')}
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="whitespace-nowrap px-5 py-2.5 font-medium">{t('ai_assistant.models.column.model', 'Model')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('ai_assistant.models.column.provider', 'Provider')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('ai_assistant.models.column.context', 'Context')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('ai_assistant.models.column.tags', 'Tags')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('ai_assistant.models.column.status', 'Status')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('ai_assistant.models.column.source', 'Source')}</th>
                  <th className="sticky right-0 z-10 whitespace-nowrap bg-card px-5 py-2.5 text-right font-medium shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">{t('ai_assistant.models.column.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((model) => {
                  const isDefault = model.enabled
                    && currentDefault?.providerId === model.providerId
                    && currentDefault.modelId === model.modelId
                  const rowKey = `${model.providerId}:${model.modelId}`
                  const isBusy = busyRow === rowKey
                  const provider = providerById.get(model.providerId)
                  return (
                    <tr
                      key={rowKey}
                      className="border-b last:border-0 hover:bg-muted/30"
                      data-ai-models-row={rowKey}
                    >
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5 font-medium">
                            {model.name}
                            {isDefault ? (
                              <Badge variant="brand" size="sm" className="gap-1">
                                <Star className="size-2.5" aria-hidden />
                                {t('ai_assistant.models.defaultBadge', 'Default')}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{model.modelId}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col">
                          <span className="whitespace-nowrap">{provider?.name ?? model.providerId}</span>
                          <span
                            className={`flex items-center gap-1 font-mono text-[10px] ${
                              provider?.configured ? 'text-muted-foreground' : 'text-status-warning-text'
                            }`}
                            title={
                              provider?.configured
                                ? t('ai_assistant.models.credentialsConfigured', 'Credentials configured')
                                : t('ai_assistant.models.credentialsMissing', 'Set this environment variable to enable the provider')
                            }
                          >
                            <KeyRound className="size-2.5 shrink-0" aria-hidden />
                            {provider?.envKey ?? t('ai_assistant.models.notConfigured', 'no credentials')}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">{formatContext(model.contextWindow)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {model.tags.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            model.tags.map((tag) => (
                              <Badge key={tag} variant="muted" size="sm" className="whitespace-nowrap">
                                {tagLabel(tag, t)}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={model.enabled ? 'success' : 'neutral'} size="sm" dot className="whitespace-nowrap">
                          {model.enabled
                            ? t('ai_assistant.models.status.enabled', 'Enabled')
                            : t('ai_assistant.models.status.disabled', 'Disabled')}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={model.builtin ? 'outline' : 'info'} size="sm" className="whitespace-nowrap">
                          {model.overridden
                            ? t('ai_assistant.models.source.overridden', 'Built-in · edited')
                            : model.builtin
                              ? t('ai_assistant.models.source.builtin', 'Built-in')
                              : t('ai_assistant.models.source.custom', 'Custom')}
                        </Badge>
                      </td>
                      <td className="sticky right-0 z-10 bg-card px-5 py-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={isBusy}
                            onClick={() => setEditor({ mode: 'edit', row: model })}
                            data-ai-models-edit={rowKey}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            {t('ai_assistant.models.action.edit', 'Edit')}
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                aria-label={t('ai_assistant.models.action.more', 'More actions')}
                                data-ai-models-more={rowKey}
                              >
                                <MoreHorizontal className="size-4" aria-hidden />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-40 p-1">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                                disabled={isBusy || isDefault || !model.enabled}
                                onClick={() => void handleSetDefault(model)}
                              >
                                <Star className="size-3.5" aria-hidden />
                                {t('ai_assistant.models.action.setDefault', 'Set as default')}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                                disabled={isBusy}
                                onClick={() => void handleToggleEnabled(model)}
                              >
                                {isBusy ? (
                                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <Power className="size-3.5" aria-hidden />
                                )}
                                {model.enabled
                                  ? t('ai_assistant.models.action.disable', 'Disable')
                                  : t('ai_assistant.models.action.enable', 'Enable')}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted disabled:opacity-50"
                                disabled={isBusy || (!model.entryId && model.builtin === false)}
                                onClick={() => setDeleteTarget(model)}
                              >
                                {model.builtin && model.overridden ? (
                                  <RotateCcw className="size-3.5" aria-hidden />
                                ) : (
                                  <Trash2 className="size-3.5" aria-hidden />
                                )}
                                {model.builtin && model.overridden
                                  ? t('ai_assistant.models.action.restore', 'Restore')
                                  : t('ai_assistant.models.action.delete', 'Delete')}
                              </button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 px-5 py-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">{t('ai_assistant.models.note.title', 'How this works')}</p>
        <p className="mt-1 max-w-4xl">
          {t(
            'ai_assistant.models.note.body',
            'Credentials and endpoints stay in the server environment (for example OPENAI_API_KEY or OPENROUTER_API_KEY), so secrets are never stored in tenant data. This page controls which models are offered by each configured provider and which one is the default. Disabled models disappear from the assistant model picker.',
          )}
        </p>
      </div>

      {editor ? (
        <ModelEditorDialog
          key={editor.mode === 'edit' ? `edit:${editor.row.providerId}:${editor.row.modelId}` : 'create'}
          editor={editor}
          providers={providers}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await invalidate()
          }}
          onError={reportError}
          runMutation={runMutation}
        />
      ) : null}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.builtin
                ? t('ai_assistant.models.delete.restoreTitle', 'Restore built-in model?')
                : t('ai_assistant.models.delete.title', 'Delete model?')}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.builtin
                ? t(
                    'ai_assistant.models.delete.restoreDescription',
                    'This removes your edits and makes the model that ships with the provider visible again.',
                  )
                : t(
                    'ai_assistant.models.delete.description',
                    'The model will be removed from this tenant’s catalog and from the assistant model picker. This cannot be undone.',
                  )}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-mono">{deleteTarget.modelId}</span>
              <span className="text-muted-foreground"> · {providerById.get(deleteTarget.providerId)?.name ?? deleteTarget.providerId}</span>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('ai_assistant.models.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyRow !== null}
              onClick={() => void handleDelete()}
              data-ai-models-delete-confirm=""
            >
              {busyRow !== null ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {deleteTarget?.builtin
                ? t('ai_assistant.models.delete.restoreAction', 'Restore')
                : t('ai_assistant.models.delete.confirm', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ModelEditorDialogProps = {
  editor: EditorState
  providers: ProviderInfo[]
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (error: unknown) => void
  runMutation: (input: {
    operation: () => Promise<unknown>
    context: Record<string, unknown>
  }) => Promise<unknown>
}

function ModelEditorDialog({ editor, providers, onClose, onSaved, onError, runMutation }: ModelEditorDialogProps) {
  const t = useT()
  const editing = editor?.mode === 'edit' ? editor.row : null
  const initialProviderId = editing?.providerId
    ?? providers.find((provider) => provider.configured)?.id
    ?? providers.find((provider) => provider.id === 'openai')?.id
    ?? providers[0]?.id
    ?? ''
  const [providerId, setProviderId] = React.useState(initialProviderId)
  const [modelId, setModelId] = React.useState(editing?.modelId ?? '')
  const [name, setName] = React.useState(editing?.name ?? '')
  const [contextWindow, setContextWindow] = React.useState(
    editing?.contextWindow ? String(editing.contextWindow) : '',
  )
  const [tags, setTags] = React.useState<string[]>(editing?.tags ?? [])
  const [enabled, setEnabled] = React.useState(editing?.enabled ?? true)
  const [saving, setSaving] = React.useState(false)

  const isBuiltinRow = editing?.builtin === true
  const canSave = providerId.length > 0 && modelId.trim().length > 0 && name.trim().length > 0 && !saving

  const toggleTag = (tag: string) => {
    setTags((previous) => (previous.includes(tag) ? previous.filter((entry) => entry !== tag) : [...previous, tag]))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      const payload = {
        providerId,
        modelId: modelId.trim(),
        name: name.trim(),
        contextWindow: contextWindow.trim().length > 0 ? Number(contextWindow) : null,
        tags,
        enabled,
      }
      await runMutation({
        operation: async () => {
          if (editing?.entryId) {
            await sendJson(`/api/ai_model_config/models/${editing.entryId}`, 'PUT', {
              name: payload.name,
              contextWindow: payload.contextWindow,
              tags: payload.tags,
              enabled: payload.enabled,
            })
          } else {
            await sendJson('/api/ai_model_config/models', 'POST', payload)
          }
        },
        context: {},
      })
      flash(
        editing
          ? t('ai_assistant.models.savedToast', 'Model updated.')
          : t('ai_assistant.models.createdToast', 'Model added.'),
        'success',
      )
      await onSaved()
    } catch (error) {
      onError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('ai_assistant.models.editor.editTitle', 'Edit model')
                : t('ai_assistant.models.editor.createTitle', 'Add model')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'ai_assistant.models.editor.description',
                'The model id must match exactly what the provider’s API expects. One model id per provider.',
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ai-model-provider">{t('ai_assistant.models.editor.provider', 'Provider')}</Label>
              <Select value={providerId} onValueChange={setProviderId} disabled={Boolean(editing) || saving}>
                <SelectTrigger id="ai-model-provider" data-ai-models-editor-provider="">
                  <SelectValue placeholder={t('ai_assistant.models.editor.selectProvider', 'Select a provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                      {!provider.configured
                        ? ` · ${t('ai_assistant.models.notConfigured', 'no credentials')}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ai-model-id">{t('ai_assistant.models.editor.modelId', 'Model ID')}</Label>
              <Input
                id="ai-model-id"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                placeholder={t('ai_assistant.models.editor.modelIdPlaceholder', 'e.g. gpt-5.2 or deepseek-chat')}
                disabled={Boolean(editing) || saving}
                autoComplete="off"
                required
                data-ai-models-editor-id=""
              />
              {isBuiltinRow ? (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    'ai_assistant.models.editor.builtinHint',
                    'This is a built-in model. Your changes are stored as an override and can be reverted with Restore.',
                  )}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ai-model-name">{t('ai_assistant.models.editor.name', 'Display name')}</Label>
              <Input
                id="ai-model-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('ai_assistant.models.editor.namePlaceholder', 'Shown in the model picker')}
                disabled={saving}
                required
                data-ai-models-editor-name=""
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="ai-model-context">{t('ai_assistant.models.editor.contextWindow', 'Context window (tokens)')}</Label>
              <Input
                id="ai-model-context"
                type="number"
                min={1}
                step={1}
                value={contextWindow}
                onChange={(event) => setContextWindow(event.target.value)}
                placeholder={t('ai_assistant.models.editor.contextWindowPlaceholder', 'Optional, e.g. 128000')}
                disabled={saving}
                data-ai-models-editor-context=""
              />
            </div>

            <div className="grid gap-1.5">
              <Label>{t('ai_assistant.models.editor.tags', 'Capability tags')}</Label>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={tags.includes(option.value)}
                      onCheckedChange={() => toggleTag(option.value)}
                      disabled={saving}
                    />
                    {t(option.key, option.label)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
              <div>
                <p className="text-xs font-medium">{t('ai_assistant.models.editor.enabled', 'Enabled')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t('ai_assistant.models.editor.enabledHint', 'Disabled models are hidden from the assistant picker.')}
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('ai_assistant.models.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSave} data-ai-models-editor-save="">
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              {t('ai_assistant.models.editor.save', 'Save model')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ProviderEditorState =
  | { mode: 'create' }
  | { mode: 'edit'; row: ProviderRow }
  | { mode: 'credentials'; row: ProviderRow }
  | null

type ProviderSectionProps = {
  providers: ProviderRow[]
  loading: boolean
  onChanged: () => Promise<void>
  onError: (error: unknown) => void
}

function ProviderSection({ providers, loading, onChanged, onError }: ProviderSectionProps) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'ai-model-provider' })
  const [editor, setEditor] = React.useState<ProviderEditorState>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ProviderRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [syncingProvider, setSyncingProvider] = React.useState<string | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [providerFilter, setProviderFilter] = React.useState<'all' | 'configured' | 'unconfigured'>('all')
  const [importTarget, setImportTarget] = React.useState<{ providerId: string; models: Array<{ id: string; name: string }> } | null>(null)

  const handleRefreshModels = React.useCallback(
    async (provider: ProviderRow) => {
      setSyncingProvider(provider.id)
      try {
        const result = await runMutation({
          operation: async () =>
            sendJson<{ models?: Array<{ id: string; name: string }> }>(
              `/api/ai_model_config/providers/${provider.id}/models`,
              'POST',
              { preview: true },
            ),
          context: {},
        })
        if (result?.models && result.models.length > 0) {
          setImportTarget({ providerId: provider.id, models: result.models })
        } else {
          flash(t('ai_assistant.models.provider.nothingFetched', 'The provider returned no models.'), 'warning')
        }
      } catch (error) {
        onError(error)
      } finally {
        setSyncingProvider(null)
      }
    },
    [onChanged, onError, runMutation, t],
  )

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await runMutation({
        operation: async () => {
          await sendJson(`/api/ai_model_config/providers/${deleteTarget.id}`, 'DELETE')
        },
        context: {},
      })
      flash(t('ai_assistant.models.provider.deletedToast', 'Provider deleted.'), 'success')
      setDeleteTarget(null)
      await onChanged()
    } catch (error) {
      onError(error)
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, onChanged, onError, runMutation, t])

  const configuredCount = providers.filter((provider) => provider.configured).length
  const visibleProviders = providers.filter((provider) =>
    providerFilter === 'all' ? true : providerFilter === 'configured' ? provider.configured : !provider.configured,
  )

  const credentialBadge = (provider: ProviderRow) => {
    if (provider.keySource === 'settings') {
      return (
        <Badge variant="success" size="sm" dot className="whitespace-nowrap">
          {t('ai_assistant.models.provider.keySourceSettings', 'Settings')}
        </Badge>
      )
    }
    if (provider.keySource === 'env') {
      return (
        <Badge variant="info" size="sm" dot className="whitespace-nowrap">
          {t('ai_assistant.models.provider.keySourceEnv', 'Environment')}
        </Badge>
      )
    }
    return (
      <Badge variant="warning" size="sm" dot className="whitespace-nowrap">
        {t('ai_assistant.models.provider.keyMissing', 'Not configured')}
      </Badge>
    )
  }

  return (
    <div className="rounded-lg border bg-card" data-ai-providers="">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{t('ai_assistant.models.provider.title', 'Providers')}</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            {t(
              'ai_assistant.models.provider.description',
              'Store provider API keys here — saved instantly, no restart. Keys are encrypted at rest and never shown again. A key saved here takes precedence over the matching environment variable.',
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t('ai_assistant.models.provider.summary', '{{configured}} / {{total}} providers have credentials')
              .replace('{{configured}}', String(configuredCount))
              .replace('{{total}}', String(providers.length))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={providerFilter} onValueChange={(value) => setProviderFilter(value as 'all' | 'configured' | 'unconfigured')}>
            <SelectTrigger className="h-8 w-[120px]" data-ai-providers-filter="">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('ai_assistant.models.provider.filterAll', 'All')}</SelectItem>
              <SelectItem value="configured">{t('ai_assistant.models.provider.filterConfigured', 'Configured')}</SelectItem>
              <SelectItem value="unconfigured">{t('ai_assistant.models.provider.filterUnconfigured', 'Not configured')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setExpanded((value) => !value)}
            data-ai-providers-toggle=""
          >
            {expanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
            {expanded
              ? t('ai_assistant.models.provider.collapse', 'Collapse')
              : t('ai_assistant.models.provider.expand', 'Expand')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setEditor({ mode: 'create' })}
            data-ai-providers-add=""
          >
            <Plus className="size-3.5" aria-hidden />
            {t('ai_assistant.models.provider.add', 'Add provider')}
          </Button>
        </div>
      </div>

      {!loading && configuredCount === 0 ? (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg/60 px-3 py-2 text-xs text-status-warning-text">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {t(
              'ai_assistant.models.provider.noCredentials',
              'No provider has credentials yet, so AI assistant calls will fail. Configure a key below — DeepSeek, OpenAI, or any OpenAI-compatible gateway.',
            )}
          </span>
        </div>
      ) : null}

      {expanded ? (
        <>
      {loading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t('ai_assistant.models.provider.loading', 'Loading providers…')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="whitespace-nowrap px-5 py-2.5 font-medium">
                  {t('ai_assistant.models.provider.column.provider', 'Provider')}
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {t('ai_assistant.models.provider.column.type', 'Type')}
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {t('ai_assistant.models.provider.column.credentials', 'Credentials')}
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {t('ai_assistant.models.provider.column.models', 'Models')}
                </th>
                <th className="sticky right-0 z-10 whitespace-nowrap bg-card px-5 py-2.5 text-right font-medium shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                  {t('ai_assistant.models.provider.column.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProviders.map((provider) => (
                <tr
                  key={provider.id}
                  className="border-b last:border-0 hover:bg-muted/30"
                  data-ai-provider-row={provider.id}
                >
                  <td className="px-5 py-2.5">
                    <div className="flex flex-col">
                      <span className="whitespace-nowrap font-medium">{provider.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {provider.baseURL ?? provider.envKey ?? provider.id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={provider.builtin ? 'outline' : 'brand'} size="sm" className="whitespace-nowrap">
                      {provider.builtin
                        ? t('ai_assistant.models.provider.typeBuiltin', 'Built-in')
                        : t('ai_assistant.models.provider.typeCustom', 'Custom')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {credentialBadge(provider)}
                      <span className="font-mono text-[10px] text-muted-foreground">{provider.envKey ?? ''}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">{provider.modelCount}</td>
                  <td className="sticky right-0 z-10 bg-card px-5 py-2.5 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                    <div className="flex items-center justify-end gap-1">
                      {provider.builtin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => setEditor({ mode: 'credentials', row: provider })}
                          data-ai-provider-configure={provider.id}
                        >
                          <KeyRound className="size-3.5" aria-hidden />
                          {t('ai_assistant.models.provider.configure', 'Configure key')}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => setEditor({ mode: 'edit', row: provider })}
                          data-ai-provider-edit={provider.id}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          {t('ai_assistant.models.provider.edit', 'Edit')}
                        </Button>
                      )}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            aria-label={t('ai_assistant.models.action.more', 'More actions')}
                            data-ai-provider-more={provider.id}
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-40 p-1">
                          {provider.configured ? (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                              disabled={syncingProvider !== null}
                              onClick={() => void handleRefreshModels(provider)}
                              data-ai-provider-fetch-models={provider.id}
                            >
                              {syncingProvider === provider.id ? (
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                              ) : (
                                <RefreshCw className="size-3.5" aria-hidden />
                              )}
                              {t('ai_assistant.models.provider.fetchModels', 'Fetch models')}
                            </button>
                          ) : null}
                          {!provider.builtin ? (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                              onClick={() => setDeleteTarget(provider)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                              {t('ai_assistant.models.provider.delete', 'Delete')}
                            </button>
                          ) : null}
                          {!provider.configured && provider.builtin ? (
                            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                              {t('ai_assistant.models.provider.noActions', 'Configure a key first')}
                            </p>
                          ) : null}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t px-5 py-3 text-[11px] text-muted-foreground">
        {t(
          'ai_assistant.models.provider.footnote',
          'Provider connections are instance-wide (shared by all tenants); the model catalog above stays tenant-scoped. Custom providers use the OpenAI-compatible protocol.',
        )}
      </div>
        </>
      ) : null}

      {editor ? (
        <ProviderDialog
          key={`${editor.mode}:${editor.mode === 'create' ? 'new' : editor.row.id}`}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={async (providerId, discovery) => {
            setEditor(null)
            await onChanged()
            if (discovery?.ok && discovery.models && discovery.models.length > 0) {
              setImportTarget({ providerId, models: discovery.models })
            } else if (discovery?.error) {
              flash(
                t(
                  'ai_assistant.models.provider.fetchFailed',
                  'Key saved, but fetching models failed: {{error}}',
                ).replace('{{error}}', discovery.error),
                'warning',
              )
            }
          }}
          onError={onError}
          runMutation={runMutation}
        />
      ) : null}

      {importTarget ? (
        <ModelImportDialog
          providerId={importTarget.providerId}
          models={importTarget.models}
          onClose={() => setImportTarget(null)}
          onImported={async () => {
            setImportTarget(null)
            await onChanged()
          }}
          onError={onError}
        />
      ) : null}

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ai_assistant.models.provider.deleteTitle', 'Delete provider?')}</DialogTitle>
            <DialogDescription>
              {t(
                'ai_assistant.models.provider.deleteDescription',
                'The provider, its saved key and its custom models will be removed. Built-in providers cannot be deleted.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('ai_assistant.models.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
              data-ai-provider-delete-confirm=""
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {t('ai_assistant.models.provider.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ProviderDialogProps = {
  editor: ProviderEditorState
  onClose: () => void
  onSaved: (providerId: string, discovery?: DiscoveryInfo) => Promise<void>
  onError: (error: unknown) => void
  runMutation: (input: {
    operation: () => Promise<unknown>
    context: Record<string, unknown>
  }) => Promise<unknown>
}

type DiscoveryInfo = {
  ok: boolean
  models?: Array<{ id: string; name: string }>
  error?: string
}

function ProviderDialog({ editor, onClose, onSaved, onError, runMutation }: ProviderDialogProps) {
  const t = useT()
  const editing = editor && editor.mode !== 'create' ? editor.row : null
  const isCreate = editor?.mode === 'create'
  const isCredentials = editor?.mode === 'credentials'

  const [name, setName] = React.useState(editing?.name ?? '')
  const [providerId, setProviderId] = React.useState('')
  const [baseURL, setBaseURL] = React.useState(editing?.baseURL ?? '')
  const [apiKey, setApiKey] = React.useState('')
  const [defaultModel, setDefaultModel] = React.useState(
    editing && editing.builtin === false ? editing.defaultModel : '',
  )
  const [saving, setSaving] = React.useState(false)

  const hasStoredKey = editing?.keySource === 'settings'
  const canSave = (() => {
    if (saving) return false
    if (isCreate) {
      return name.trim().length > 0
        && /^[a-z0-9][a-z0-9-]{1,63}$/.test(providerId.trim())
        && baseURL.trim().length > 0
        && apiKey.trim().length > 0
    }
    if (isCredentials) {
      return Boolean(hasStoredKey || apiKey.trim().length > 0)
    }
    return name.trim().length > 0 && baseURL.trim().length > 0
  })()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    setSaving(true)
    try {
      const result = (await runMutation({
        operation: async () => {
          if (isCreate) {
            return sendJson<{ discovery?: DiscoveryInfo }>('/api/ai_model_config/providers', 'POST', {
              id: providerId.trim(),
              name: name.trim(),
              baseURL: baseURL.trim(),
              apiKey: apiKey.trim(),
              defaultModel: defaultModel.trim() || undefined,
            })
          }
          const body: Record<string, unknown> = {}
          if (apiKey.trim().length > 0) body.apiKey = apiKey.trim()
          if (isCredentials) {
            if (baseURL.trim().length > 0) body.baseURL = baseURL.trim()
          } else {
            body.name = name.trim()
            body.baseURL = baseURL.trim()
            if (defaultModel.trim().length > 0) body.defaultModel = defaultModel.trim()
          }
          return sendJson<{ discovery?: DiscoveryInfo }>(
            `/api/ai_model_config/providers/${editing?.id}`,
            'PUT',
            body,
          )
        },
        context: {},
      })) as { discovery?: DiscoveryInfo }
      flash(
        isCreate
          ? t('ai_assistant.models.provider.createdToast', 'Provider added.')
          : t('ai_assistant.models.provider.savedToast', 'Provider saved.'),
        'success',
      )
      await onSaved(isCreate ? providerId.trim() : (editing?.id ?? ''), result?.discovery)
    } catch (error) {
      onError(error)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await runMutation({
        operation: async () => {
          await sendJson(`/api/ai_model_config/providers/${editing.id}`, 'PUT', { clear: true })
        },
        context: {},
      })
      flash(t('ai_assistant.models.provider.clearedToast', 'Saved key removed; falling back to .env.'), 'success')
      await onSaved(editing.id)
    } catch (error) {
      onError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {isCreate
                ? t('ai_assistant.models.provider.createTitle', 'Add a provider')
                : isCredentials
                  ? t('ai_assistant.models.provider.credentialsTitle', 'Configure {{name}}', { name: editing?.name ?? '' })
                  : t('ai_assistant.models.provider.editTitle', 'Edit provider')}
            </DialogTitle>
            <DialogDescription>
              {isCredentials
                ? t(
                    'ai_assistant.models.provider.credentialsDescription',
                    'The key is encrypted at rest and only used server-side. Saving takes effect immediately — no restart.',
                  )
                : t(
                    'ai_assistant.models.provider.descriptionField',
                    'OpenAI-compatible endpoint. Examples: DeepSeek https://api.deepseek.com/v1, Ollama http://localhost:11434/v1.',
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {isCreate ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="provider-name">{t('ai_assistant.models.provider.name', 'Display name')}</Label>
                  <Input
                    id="provider-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('ai_assistant.models.provider.namePlaceholder', 'e.g. DeepSeek (official)')}
                    disabled={saving}
                    required
                    data-ai-provider-name=""
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="provider-id">{t('ai_assistant.models.provider.id', 'Provider ID')}</Label>
                  <Input
                    id="provider-id"
                    value={providerId}
                    onChange={(event) => setProviderId(event.target.value.toLowerCase())}
                    placeholder={t('ai_assistant.models.provider.idPlaceholder', 'e.g. deepseek-cn')}
                    disabled={saving}
                    required
                    autoComplete="off"
                    data-ai-provider-id=""
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('ai_assistant.models.provider.idHint', 'Lowercase letters, digits and dashes. Cannot be changed later.')}
                  </p>
                </div>
              </>
            ) : (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="font-medium">{editing?.name}</span>
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">{editing?.id}</span>
              </div>
            )}

            {!isCredentials ? (
              <div className="grid gap-1.5">
                <Label htmlFor="provider-base-url">{t('ai_assistant.models.provider.baseURL', 'Base URL')}</Label>
                <Input
                  id="provider-base-url"
                  value={baseURL}
                  onChange={(event) => setBaseURL(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  disabled={saving}
                  required
                  data-ai-provider-base-url=""
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="provider-base-url">
                  {t('ai_assistant.models.provider.baseURLOptional', 'Base URL (optional override)')}
                </Label>
                <Input
                  id="provider-base-url"
                  value={baseURL}
                  onChange={(event) => setBaseURL(event.target.value)}
                  placeholder={t('ai_assistant.models.provider.baseURLKeep', 'Leave blank to use the default endpoint')}
                  disabled={saving}
                  data-ai-provider-base-url=""
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="provider-api-key">{t('ai_assistant.models.provider.apiKey', 'API key')}</Label>
              <Input
                id="provider-api-key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  hasStoredKey
                    ? t('ai_assistant.models.provider.apiKeyKeep', 'A key is saved — leave blank to keep it')
                    : 'sk-…'
                }
                disabled={saving}
                autoComplete="new-password"
                data-ai-provider-api-key=""
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'ai_assistant.models.provider.apiKeyHint',
                  'Encrypted with AES-256-GCM. The plaintext value is never returned by the API.',
                )}
              </p>
            </div>

            {!isCredentials ? (
              <div className="grid gap-1.5">
                <Label htmlFor="provider-default-model">
                  {t('ai_assistant.models.provider.defaultModel', 'Seed model ID (optional)')}
                </Label>
                <Input
                  id="provider-default-model"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  placeholder="deepseek-chat"
                  disabled={saving}
                  data-ai-provider-default-model=""
                />
                <p className="text-[11px] text-muted-foreground">
                  {t('ai_assistant.models.provider.defaultModelHint', 'Adds this model to the catalog automatically.')}
                </p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-wrap gap-2">
            {hasStoredKey ? (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                onClick={() => void handleClear()}
                disabled={saving}
                data-ai-provider-clear=""
              >
                {t('ai_assistant.models.provider.clear', 'Remove saved key')}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              {t('ai_assistant.models.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSave} data-ai-provider-save="">
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              {t('ai_assistant.models.provider.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ModelImportDialogProps = {
  providerId: string
  models: Array<{ id: string; name: string }>
  onClose: () => void
  onImported: () => Promise<void>
  onError: (error: unknown) => void
}

function ModelImportDialog({ providerId, models, onClose, onImported, onError }: ModelImportDialogProps) {
  const t = useT()
  const [importing, setImporting] = React.useState(false)

  const handleImport = async () => {
    setImporting(true)
    try {
      const result = await sendJson<{ imported: number; total: number }>(
        `/api/ai_model_config/providers/${providerId}/models`,
        'POST',
        { models },
      )
      flash(
        t('ai_assistant.models.import.imported', 'Imported {{imported}} of {{total}} models.')
          .replace('{{imported}}', String(result?.imported ?? models.length))
          .replace('{{total}}', String(result?.total ?? models.length)),
        'success',
      )
      await onImported()
    } catch (error) {
      onError(error)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg" data-model-import-dialog="">
        <DialogHeader>
          <DialogTitle>
            {t('ai_assistant.models.import.title', 'Fetched {{count}} models', { count: models.length })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'ai_assistant.models.import.description',
              'Confirm to import these models into the catalog. If no system default exists, the first model becomes the system AI base.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
          {models.map((model) => (
            <div key={model.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="truncate font-mono">{model.id}</span>
              {model.name && model.name !== model.id ? (
                <span className="shrink-0 text-muted-foreground">{model.name}</span>
              ) : null}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={importing}>
            {t('ai_assistant.models.import.later', 'Not now')}
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={importing} data-model-import-confirm="">
            {importing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {t('ai_assistant.models.import.confirm', 'Import {{count}} models', { count: models.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
