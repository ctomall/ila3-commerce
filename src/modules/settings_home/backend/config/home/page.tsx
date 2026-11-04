import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import backendRouteMetadata from '@/.mercato/generated/backend-route-metadata.generated'
import SettingsHomeClient, { type SettingsCard } from './SettingsHomeClient'

type PageManifest = {
  moduleId?: string
  pattern?: string
  path?: string
  title?: string
  titleKey?: string
  group?: string
  groupKey?: string
  pageContext?: string
  navHidden?: boolean
  enabled?: boolean
  order?: number
}

const AI_GROUP_KEY = 'settings.sections.ai'

export default function SettingsHomePage() {
  const seen = new Set<string>()
  const cards: SettingsCard[] = []

  for (const entry of (backendRouteMetadata ?? []) as PageManifest[]) {
    const path = entry?.pattern ?? entry?.path
    if (!path || seen.has(path)) continue
    if (entry.pageContext !== 'settings' || entry.navHidden === true || entry.enabled === false) continue
    seen.add(path)

    const isAi = path.startsWith('/backend/config/ai-assistant') || path.startsWith('/backend/config/ai-agents')
    cards.push({
      path,
      title: entry.title ?? path,
      titleKey: entry.titleKey,
      group: isAi ? 'AI' : (entry.group ?? 'System'),
      groupKey: isAi ? AI_GROUP_KEY : (entry.groupKey ?? 'settings.sections.system'),
      order: typeof entry.order === 'number' ? entry.order : 999,
    })
  }

  cards.sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))

  return (
    <Page>
      <PageBody>
        <SettingsHomeClient cards={cards} />
      </PageBody>
    </Page>
  )
}
