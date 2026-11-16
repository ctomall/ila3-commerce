import type { CrmCatalog } from './crm-navigation'
import { buildShellChrome, type ShellTranslate, type ShellChrome } from './shell-chrome'
import { buildWorkspaces, selectWorkspace } from './workspaces'
import { applyLayout, type WorkspaceLayoutConfig } from '@/modules/workspace_settings/lib/layout'

/**
 * A presentation projection; the caller retains the complete authorized
 * catalogue.
 *
 * A path with no owning workspace (settings, profile, the management hub) must
 * not fall back to every declared group: the caller may pass the workspace it
 * was in before, and that id is only honoured when it names a workspace this
 * caller can actually see. Otherwise the rail shrinks to the fixed entries.
 */
export function buildWorkspaceChrome(
  catalog: CrmCatalog,
  pathname?: string,
  translate?: ShellTranslate,
  fallbackWorkspaceId?: string,
  layout?: WorkspaceLayoutConfig | null,
): ShellChrome {
  if (!pathname || pathname.length > 2048 || !/^\/backend(?:\/|$)/.test(pathname) || /[?#]/.test(pathname)) {
    return buildShellChrome(catalog, translate)
  }
  const spaces = buildWorkspaces(catalog.groups)
  // The organization document may reorder, relabel and hide workspaces; hidden
  // ones stay addressable, they only stop being offered in the rail.
  const { ordered, visible } = layout ? applyLayout(spaces, layout) : { ordered: spaces, visible: spaces }
  const visibleIds = new Set(visible.map(space => space.id))
  const owner = selectWorkspace(ordered, pathname)
  const workspace =
    (owner && visibleIds.has(owner.id) ? owner : null)
    ?? (fallbackWorkspaceId ? visible.find(space => space.id === fallbackWorkspaceId) ?? null : null)
  const keep = workspace ? new Set(workspace.groups.map(group => group.id)) : new Set<string>()
  return buildShellChrome(
    { ...catalog, groups: catalog.groups.filter(group => group.id === 'home' || keep.has(group.id)) },
    translate,
  )
}
