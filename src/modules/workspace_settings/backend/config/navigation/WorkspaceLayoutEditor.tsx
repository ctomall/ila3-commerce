'use client'
import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { readCrmCatalog } from '@/nav/crm-navigation'
import { buildWorkspaces, type Workspace } from '@/nav/workspaces'
import { EMPTY_LAYOUT, applyLayout, type WorkspaceLayoutConfig, type WorkspacePreset } from '../../../lib/layout'

type Row = { id: string; label: string; visible: boolean }
type UserOption = { id: string; label: string }

type LayoutResponse = { config: WorkspaceLayoutConfig; revision: number | null }

function rowsFrom(config: WorkspaceLayoutConfig, spaces: Workspace[]): Row[] {
  const ordered = applyLayout(spaces, config).ordered
  return ordered.map((space) => ({
    id: space.id,
    label: config.labels[space.id] ?? space.label,
    visible: !config.hidden.includes(space.id),
  }))
}

export function WorkspaceLayoutEditor() {
  const t = useT()
  const [config, setConfig] = React.useState<WorkspaceLayoutConfig>(EMPTY_LAYOUT)
  const [rows, setRows] = React.useState<Row[]>([])
  const [presets, setPresets] = React.useState<WorkspacePreset[]>([])
  const [assignments, setAssignments] = React.useState<Record<string, string[]>>({})
  const [users, setUsers] = React.useState<UserOption[]>([])
  const [spaces, setSpaces] = React.useState<Workspace[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [layoutResult, navResult, usersResult] = await Promise.all([
          apiCall<LayoutResponse>('/api/workspace_settings/layout', { method: 'GET' }),
          apiCall<unknown>('/api/crm_navigation/navigation?chrome=1&path=%2Fbackend%2Fmanage', { method: 'GET' }),
          apiCall<{ items?: Array<{ id: string; email?: string; name?: string }> }>('/api/auth/users?pageSize=100', { method: 'GET' }),
        ])
        if (!active) return
        if (!layoutResult.ok || !layoutResult.result) throw new Error(t('workspace_settings.error.load', 'Could not load the layout'))
        const loaded = layoutResult.result.config
        const catalog = navResult.ok ? readCrmCatalog(navResult.result) : null
        const list = buildWorkspaces(catalog?.groups ?? [])
        setSpaces(list)
        setConfig(loaded)
        setRows(rowsFrom(loaded, list))
        setPresets(loaded.presets)
        setAssignments(loaded.assignments)
        setUsers((usersResult.ok ? usersResult.result?.items ?? [] : []).map((user) => ({
          id: user.id,
          label: user.name || user.email || user.id.slice(0, 8),
        })))
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [t])

  const move = (index: number, delta: number) => {
    setRows((previous) => {
      const next = [...previous]
      const target = index + delta
      if (target < 0 || target >= next.length) return previous
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const addPreset = () => {
    const id = `preset-${presets.length + 1}`
    setPresets((previous) => [...previous, { id, name: t('workspace_settings.preset.new', 'New preset'), workspaces: rows.filter((row) => row.visible).slice(0, 2).map((row) => row.id), landing: null }])
  }

  const updatePreset = (id: string, patch: Partial<WorkspacePreset>) => {
    setPresets((previous) => previous.map((preset) => (preset.id === id ? { ...preset, ...patch } : preset)))
  }

  const togglePresetWorkspace = (id: string, workspaceId: string) => {
    setPresets((previous) => previous.map((preset) => {
      if (preset.id !== id) return preset
      const has = preset.workspaces.includes(workspaceId)
      return { ...preset, workspaces: has ? preset.workspaces.filter((entry) => entry !== workspaceId) : [...preset.workspaces, workspaceId] }
    }))
  }

  const assign = (userId: string, presetId: string, enabled: boolean) => {
    setAssignments((previous) => {
      const current = previous[userId] ?? []
      const next = enabled ? [...new Set([...current, presetId])] : current.filter((entry) => entry !== presetId)
      const copy = { ...previous }
      if (next.length) copy[userId] = next
      else delete copy[userId]
      return copy
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    const labels: Record<string, string> = {}
    for (const row of rows) {
      const original = spaces.find((space) => space.id === row.id)?.label ?? row.id
      if (row.label.trim() && row.label.trim() !== original) labels[row.id] = row.label.trim()
    }
    const document: WorkspaceLayoutConfig = {
      version: 1,
      order: rows.map((row) => row.id),
      hidden: rows.filter((row) => !row.visible).map((row) => row.id),
      labels,
      presets: presets.filter((preset) => preset.workspaces.length > 0),
      assignments,
    }
    try {
      const result = await apiCall<LayoutResponse>('/api/workspace_settings/layout', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: document }),
      })
      if (!result.ok || !result.result) {
        const detail = (result.result as { error?: string } | null)?.error
        throw new Error(detail ?? t('workspace_settings.error.save', 'Could not save the layout'))
      }
      setConfig(result.result.config)
      setRows(rowsFrom(result.result.config, spaces))
      setNotice(t('workspace_settings.saved', 'Layout saved. Reload the page to see it in the sidebar.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div role="status" className="h-40 animate-pulse rounded-lg border bg-muted/30" aria-hidden />
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t('workspace_settings.title', 'Workspace layout')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('workspace_settings.subtitle', 'Order, hide or rename the workspaces this organization sees. Hidden workspaces stay reachable by URL and in search; membership is declared by the modules and cannot be edited here.')}
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}
      {notice ? <Alert>{notice}</Alert> : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t('workspace_settings.workspaces', 'Workspaces')}</h2>
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3" data-layout-row={row.id}>
            <Badge variant="muted" size="sm">{row.id}</Badge>
            <Input
              value={row.label}
              onChange={(event) => updateRow(row.id, { label: event.target.value })}
              aria-label={t('workspace_settings.labelFor', 'Label for {{id}}', { id: row.id })}
              className="h-8 max-w-xs"
              maxLength={60}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={row.visible} onCheckedChange={(checked) => updateRow(row.id, { visible: checked })} />
              {t('workspace_settings.visible', 'Show in sidebar')}
            </label>
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t('workspace_settings.moveUp', 'Move up')}>
                <ArrowUp className="size-4" aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={t('workspace_settings.moveDown', 'Move down')}>
                <ArrowDown className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('workspace_settings.presets', 'Position presets')}</h2>
          <Button type="button" variant="outline" size="sm" onClick={addPreset}>
            <Plus className="size-4" aria-hidden /> {t('workspace_settings.addPreset', 'Add preset')}
          </Button>
        </div>
        {presets.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            {t('workspace_settings.noPresets', 'No presets yet. A preset is an ordered list of workspaces you can hand to employees.')}
          </p>
        ) : null}
        {presets.map((preset) => (
          <div key={preset.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3" data-preset-row={preset.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={preset.name} onChange={(event) => updatePreset(preset.id, { name: event.target.value })} aria-label={t('workspace_settings.presetName', 'Preset name')} className="h-8 max-w-xs" maxLength={60} />
              <Badge variant="muted" size="sm">{preset.id}</Badge>
              <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => setPresets((previous) => previous.filter((entry) => entry.id !== preset.id))} aria-label={t('workspace_settings.removePreset', 'Remove preset')}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {rows.map((row) => (
                <label key={row.id} className="flex items-center gap-1.5 text-xs">
                  <Switch checked={preset.workspaces.includes(row.id)} onCheckedChange={() => togglePresetWorkspace(preset.id, row.id)} />
                  {row.label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Label className="text-muted-foreground">{t('workspace_settings.landing', 'Landing page (optional)')}</Label>
              <Input value={preset.landing ?? ''} onChange={(event) => updatePreset(preset.id, { landing: event.target.value || null })} placeholder="/backend/…" className="h-8 max-w-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('workspace_settings.assigned', 'Assigned employees')}</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(assignments).filter((userId) => assignments[userId].includes(preset.id))).map((userId) => (
                  <Badge key={userId} variant="outline" size="sm">{users.find((user) => user.id === userId)?.label ?? userId.slice(0, 8)}</Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label={t('workspace_settings.assignUser', 'Assign an employee')}
                  defaultValue=""
                  onChange={(event) => { if (event.target.value) assign(event.target.value, preset.id, true); event.target.value = '' }}
                >
                  <option value="">{t('workspace_settings.pickUser', 'Add employee…')}</option>
                  {users.filter((user) => !(assignments[user.id] ?? []).includes(preset.id)).map((user) => (
                    <option key={user.id} value={user.id}>{user.label}</option>
                  ))}
                </select>
                {(Object.keys(assignments).filter((userId) => assignments[userId].includes(preset.id))).map((userId) => (
                  <Button key={`unassign-${userId}`} type="button" variant="ghost" size="sm" onClick={() => assign(userId, preset.id, false)} aria-label={t('workspace_settings.unassign', 'Remove assignment')}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={saving} data-layout-save="">
          <Save className="size-4" aria-hidden /> {t('workspace_settings.save', 'Save layout')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {config.order.length > 0 ? t('workspace_settings.revision', 'Stored order: {{count}} workspaces', { count: rows.length }) : t('workspace_settings.usingDefaults', 'Using the code-declared defaults until you save.')}
        </span>
      </div>
    </div>
  )
}
