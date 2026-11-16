"use client"
import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@open-mercato/ui/primitives/select'
import { useNavigationPreferences } from './NavigationPreferences'
import { readCrmCatalog } from '@/nav/crm-navigation'
import recommendations from '@/nav/workspace-recommendations.json'
import { buildWorkspaces, selectWorkspace, recommendWorkspaces } from '@/nav/workspaces'
import { layoutSpaces, presetLanding, readAssignedPresets, readWorkspaceLayout } from '@/nav/workspace-payload'

/** No role checks or route arrays: choices are derived from the complete authorized catalogue. */
export function WorkspaceSwitcher() {
  const { payload, isLoading } = useBackendChrome()
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const catalog = readCrmCatalog(payload)
  const layout = React.useMemo(() => readWorkspaceLayout(payload), [payload])
  const presets = React.useMemo(() => readAssignedPresets(payload), [payload])
  const spaces = React.useMemo(() => layoutSpaces(buildWorkspaces(catalog?.groups ?? []), layout), [catalog, layout])
  const { preference } = useNavigationPreferences()
  const recent = spaces.find(space => space.id === preference.recentWorkspace)
  const rankedSpaces = React.useMemo(() => recommendWorkspaces(spaces, payload?.grantedFeatures ?? [], recommendations), [spaces, payload?.grantedFeatures])
  const active = selectWorkspace(spaces, pathname ?? '/backend')
  const workspaceEnabled = (payload as unknown as { workspaceNavigationEnabled?: boolean } | null)?.workspaceNavigationEnabled !== false
  if (!workspaceEnabled || !catalog || catalog.error || !spaces.length) return null
  return (
    <Select value={active?.id ?? ''} onValueChange={id => {
      if (id.startsWith('preset:')) {
        const preset = presets.find(entry => entry.id === id.slice(7))
        if (!preset) return
        const landing = presetLanding(preset, spaces)
        if (landing) router.push(landing)
        return
      }
      const target = id.startsWith('recent:') ? id.slice(7) : id
      const space = spaces.find(entry => entry.id === target)
      if (space) router.push(space.landing)
    }} disabled={isLoading}>
      <SelectTrigger size="sm" className="w-32 sm:w-40" aria-label={t('crmNav.workspace.choose', '切换工作空间')} data-workspace-switcher="">
        <SelectValue placeholder={t('crmNav.workspace.choose', '切换工作空间')} />
      </SelectTrigger>
      <SelectContent>
        {active?.id === 'home' && recent ? <SelectItem value={`recent:${recent.id}`}>{t('crmNav.workspace.continue', '继续上次工作空间')} · {recent.labelKey ? t(recent.labelKey, recent.label) : recent.label}</SelectItem> : null}
        {presets.map(preset => (
          <SelectItem key={`preset:${preset.id}`} value={`preset:${preset.id}`}>
            {t('crmNav.preset.label', '预设')} · {preset.name}
          </SelectItem>
        ))}
        {rankedSpaces.map(space => <SelectItem key={space.id} value={space.id}>{space.labelKey ? t(space.labelKey, space.label) : space.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
