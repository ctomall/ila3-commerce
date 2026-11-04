import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { modulesInfo } from '@/.mercato/generated/modules.generated'
import backendRouteMetadata from '@/.mercato/generated/backend-route-metadata.generated'
import ModuleDirectoryClient, { type ModuleDirectoryRow } from './ModuleDirectoryClient'

type PageManifest = {
  moduleId?: string
  pattern?: string
  path?: string
  title?: string
  pageTitle?: string
  titleKey?: string
  pageTitleKey?: string
  navHidden?: boolean
}

export default function ModuleDirectoryPage() {
  const pagesByModule = new Map<string, ModuleDirectoryRow['pages']>()
  for (const entry of (backendRouteMetadata ?? []) as PageManifest[]) {
    const moduleId = entry?.moduleId
    const path = entry?.pattern ?? entry?.path
    if (!moduleId || !path) continue
    const list = pagesByModule.get(moduleId) ?? []
    list.push({
      path,
      title: entry.title ?? entry.pageTitle ?? path,
      titleKey: entry.titleKey ?? entry.pageTitleKey,
      navHidden: entry.navHidden === true,
      isConfig: path.startsWith('/backend/config'),
    })
    pagesByModule.set(moduleId, list)
  }

  const rows: ModuleDirectoryRow[] = (modulesInfo ?? []).map((info) => {
    const moduleId = info.id
    const pages = (pagesByModule.get(moduleId) ?? []).sort((a, b) => a.path.localeCompare(b.path))
    const configPages = pages.filter((page) => page.isConfig)
    const primaryPage = pages.find((page) => !page.navHidden) ?? pages[0]
    return {
      id: moduleId,
      title: info.title ?? info.name ?? moduleId,
      name: info.name ?? moduleId,
      version: info.version ?? '',
      description: info.description ?? '',
      author: info.author ?? '',
      license: info.license ?? '',
      pageCount: pages.length,
      configCount: configPages.length,
      configPath: configPages[0]?.path ?? null,
      openPath: primaryPage?.path ?? null,
      pages,
    }
  })

  rows.sort((a, b) => a.title.localeCompare(b.title))

  return (
    <Page>
      <PageBody>
        <ModuleDirectoryClient modules={rows} />
      </PageBody>
    </Page>
  )
}
