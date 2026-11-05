'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bot, Loader2, Search, Settings2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'

type AgentTool = {
  name: string
  displayName?: string
  isMutation: boolean
  registered: boolean
}

type Agent = {
  id: string
  moduleId: string
  label: string
  description: string
  executionMode: 'chat' | 'object' | string
  defaultProvider: string | null
  defaultModel: string | null
  mutationPolicy: string
  readOnly: boolean
  maxSteps: number | null
  taskPlan?: { enabled?: boolean }
  tools: AgentTool[]
  requiredFeatures: string[]
  hasOutputSchema: boolean
}

type AgentResolution = {
  agentId: string
  providerId: string
  modelId: string
  source: string
}

type AgentsResponse = { agents: Agent[]; total: number }
type SettingsResponse = { agents: AgentResolution[] }

async function fetchAgents(): Promise<AgentsResponse> {
  const result = await apiCall<AgentsResponse>('/api/ai_assistant/ai/agents', { method: 'GET' })
  if (!result.ok || !result.result) throw new Error('Failed to load agents')
  return result.result
}

async function fetchResolutions(): Promise<SettingsResponse> {
  const result = await apiCall<SettingsResponse>('/api/ai_assistant/settings', { method: 'GET' })
  if (!result.ok || !result.result) throw new Error('Failed to load agent model resolutions')
  return result.result
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'tenant_override':
      return 'override'
    case 'env_default':
      return 'system'
    case 'provider_default':
      return 'provider'
    case 'agent_default':
      return 'agent'
    default:
      return source
  }
}

export default function AgentDirectoryClient() {
  const t = useT()
  const [agents, setAgents] = React.useState<Agent[]>([])
  const [resolutions, setResolutions] = React.useState<Map<string, AgentResolution>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [moduleFilter, setModuleFilter] = React.useState('__all__')

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([fetchAgents(), fetchResolutions()])
      .then(([agentData, settingsData]) => {
        if (!active) return
        setAgents(agentData.agents ?? [])
        setResolutions(new Map((settingsData.agents ?? []).map((entry) => [entry.agentId, entry])))
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load agents')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const modules = React.useMemo(() => {
    const ids = new Set(agents.map((agent) => agent.moduleId))
    return Array.from(ids).sort()
  }, [agents])

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return agents.filter((agent) => {
      if (moduleFilter !== '__all__' && agent.moduleId !== moduleFilter) return false
      if (!needle) return true
      return [agent.id, agent.label, agent.moduleId, agent.description,
        t(`agents.directory.agent.${agent.id}.label`, agent.label),
        t(`agents.directory.agent.${agent.id}.desc`, agent.description)]
        .some((value) => value.toLowerCase().includes(needle))
    })
  }, [agents, moduleFilter, search, t])

  const stats = React.useMemo(() => ({
    total: agents.length,
    readOnly: agents.filter((agent) => agent.readOnly || agent.mutationPolicy === 'read-only').length,
    modules: new Set(agents.map((agent) => agent.moduleId)).size,
    tools: new Set(agents.flatMap((agent) => agent.tools.map((tool) => tool.name))).size,
  }), [agents])

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="size-6" aria-hidden />
          {t('agents.directory.title', 'AI agents')}
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t(
            'agents.directory.subtitle',
            'Every AI agent registered in this deployment, with its module, execution mode, mutation policy and the model it will actually use.',
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('agents.directory.stat.total', 'Agents')}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('agents.directory.stat.readOnly', 'Read-only')}</p>
          <p className="text-2xl font-semibold">{stats.readOnly}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('agents.directory.stat.modules', 'Modules')}</p>
          <p className="text-2xl font-semibold">{stats.modules}</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">{t('agents.directory.stat.tools', 'Distinct tools')}</p>
          <p className="text-2xl font-semibold">{stats.tools}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{t('agents.directory.listTitle', 'Agents')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('agents.directory.listSummary', '{{shown}} of {{total}} agents')
                .replace('{{shown}}', String(filtered.length))
                .replace('{{total}}', String(agents.length))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
              aria-label={t('agents.directory.moduleFilter', 'Filter by module')}
            >
              <option value="__all__">{t('agents.directory.allModules', 'All modules')}</option>
              {modules.map((moduleId) => (
                <option key={moduleId} value={moduleId}>{moduleId}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('agents.directory.search', 'Search agents…')}
                className="h-8 w-[240px] pl-8 text-xs"
                aria-label={t('agents.directory.search', 'Search agents…')}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-5 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('agents.directory.loading', 'Loading agents…')}
          </div>
        ) : error ? (
          <div className="px-5 py-8 text-sm text-status-error-text">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="whitespace-nowrap px-5 py-2.5 font-medium">{t('agents.directory.column.agent', 'Agent')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.module', 'Module')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.mode', 'Mode')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.policy', 'Mutation policy')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.steps', 'Max steps')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.tools', 'Tools')}</th>
                  <th className="whitespace-nowrap px-3 py-2.5 font-medium">{t('agents.directory.column.model', 'Model')}</th>
                  <th className="whitespace-nowrap px-5 py-2.5 text-right font-medium">{t('agents.directory.column.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((agent) => {
                  const resolution = resolutions.get(agent.id)
                  const providerId = resolution?.providerId ?? agent.defaultProvider ?? null
                  const modelId = resolution?.modelId ?? agent.defaultModel ?? null
                  const source = resolution?.source ?? (agent.defaultProvider || agent.defaultModel ? 'agent_default' : 'system')
                  const readOnly = agent.readOnly || agent.mutationPolicy === 'read-only'
                  return (
                    <tr key={agent.id} className="border-b last:border-0 hover:bg-muted/30" data-agent-row={agent.id}>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="whitespace-nowrap font-medium" title={agent.id}>
                            {t(`agents.directory.agent.${agent.id}.label`, agent.label)}
                          </span>
                          {agent.description ? (
                            <span className="line-clamp-1 max-w-[360px] text-[11px] text-muted-foreground">
                              {t(`agents.directory.agent.${agent.id}.desc`, agent.description)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="neutral" size="sm" className="whitespace-nowrap">{agent.moduleId}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" size="sm" className="whitespace-nowrap">{agent.executionMode}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={readOnly ? 'success' : 'warning'} size="sm" className="whitespace-nowrap">
                          {readOnly ? t('agents.directory.policy.readOnly', 'read-only') : agent.mutationPolicy}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {agent.maxSteps === null ? t('agents.directory.unlimited', 'Unlimited') : agent.maxSteps}
                      </td>
                      <td className="px-3 py-3 text-xs">{agent.tools.length}</td>
                      <td className="px-3 py-3">
                        {modelId ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="whitespace-nowrap font-mono text-xs">{providerId} / {modelId}</span>
                            <Badge variant="muted" size="sm" className="w-fit whitespace-nowrap">
                              {t(`agents.directory.source.${sourceLabel(source)}`, sourceLabel(source))}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            <Link href="/backend/config/ai-assistant/agents" data-agent-configure={agent.id}>
                              <Settings2 className="size-3.5" aria-hidden />
                              {t('agents.directory.configure', 'Configure')}
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t('agents.directory.empty', 'No agents match the filters.')}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t(
          'agents.directory.footnote',
          'Agents are declared by modules (ai-agents.ts) and filtered by your role features. Model overrides are managed on the AI agent settings page.',
        )}
      </p>
    </div>
  )
}
