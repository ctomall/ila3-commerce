import type { CrmCatalog } from './crm-navigation'
import { buildShellChrome, type ShellTranslate, type ShellChrome } from './shell-chrome'
import { buildWorkspaces, selectWorkspace } from './workspaces'

/** A presentation projection; the caller retains the complete authorized catalogue. */
export function buildWorkspaceChrome(catalog: CrmCatalog, pathname?: string, translate?: ShellTranslate): ShellChrome {
  if (!pathname || pathname.length > 2048 || !/^\/backend(?:\/|$)/.test(pathname) || /[?#]/.test(pathname)) {
    return buildShellChrome(catalog, translate)
  }
  const workspace = selectWorkspace(buildWorkspaces(catalog.groups), pathname)
  if (!workspace) return buildShellChrome(catalog, translate)
  const selected = new Set(workspace.groups.map(group => group.id))
  return buildShellChrome({ ...catalog, groups: catalog.groups.filter(group => group.id === 'home' || selected.has(group.id)) }, translate)
}
