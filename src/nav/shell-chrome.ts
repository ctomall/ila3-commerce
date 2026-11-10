import type {
  BackendChromeNavGroup,
  BackendChromeSectionGroup,
} from '@open-mercato/shared/modules/navigation/backendChrome'
import type { CrmCatalog, CrmNavItem } from './crm-navigation'

/**
 * Mapping from the declared CRM catalogue (v2) to the installed AppShell chrome
 * payload.
 *
 * The sidebar is rendered by `@open-mercato/ui`'s `AppShell` (`renderSidebar`):
 * logo, search, uppercase group headers with chevrons, icon + label items,
 * active state, the 240px/80px collapse and the mobile drawer all belong to the
 * shell. The app only supplies data. This module is that adapter, so the shell
 * is fed the same declared groups the catalogue exposes without a second,
 * app-owned navigation surface.
 *
 * Deliberate v1 choices, with their source evidence:
 *
 * - `groups` mirrors `catalog.groups` one-to-one. `AppShell` renders
 *   `groups[].name` as the uppercase header and `items[].href/title/iconName/
 *   iconMarkup` as the icon + label entries (`AppShell.tsx` renderSidebar).
 *   Item order is the catalogue order, so `AppShell` never re-sorts it.
 * - The management hub (`/backend/manage`, an app page marked `navHidden`) is
 *   appended as its own group. The stock shell has no "utility link" slot, and
 *   a hidden page with no entry would be orphaned. It remains the single
 *   rendering of `/backend/manage` in this payload.
 * - `settingsSections` / `profileSections` stay empty: v1 intentionally keeps
 *   the sidebar constant on settings/profile routes instead of switching the
 *   shell into its second-level panel. Every management page is listed by
 *   `/backend/manage`, and the per-user pages are reachable from the top-right
 *   profile dropdown (stock `ProfileDropdown` plus the `communication_channels`
 *   and `notifications` profile-menu injections) and from `/backend/profile`.
 *   When a real settings/profile landing exists, those sections can be filled
 *   without changing the sidebar.
 * - `children` are supported by the shell contract; the catalogue currently
 *   exposes a flat item list per group, so this adapter does not synthesize a
 *   hierarchy the declarations do not provide.
 */
export type ShellTranslate = (key: string, fallback: string) => string

export type ShellChrome = {
  groups: BackendChromeNavGroup[]
  settingsSections: BackendChromeSectionGroup[]
  settingsPathPrefixes: string[]
  profileSections: BackendChromeSectionGroup[]
  profilePathPrefixes: string[]
}

/** Stable id for the shell-only group that carries the management hub link. */
export const SHELL_MANAGE_GROUP_ID = 'crm_navigation.utility'

const identityTranslate: ShellTranslate = (_key, fallback) => fallback

function labelOf(
  labelKey: string | undefined,
  fallback: string,
  translate: ShellTranslate,
): string {
  return labelKey ? translate(labelKey, fallback) : fallback
}

function toShellItem(item: CrmNavItem): NonNullable<BackendChromeNavGroup['items']>[number] {
  return {
    id: item.href,
    href: item.href,
    title: item.label,
    defaultTitle: item.label,
    iconName: item.iconName,
    iconMarkup: item.iconMarkup,
    order: item.order,
  }
}

/**
 * Build the chrome payload the installed `AppShell` renders as its default
 * sidebar. Pure: the caller supplies the catalogue and the server translator.
 */
export function buildShellChrome(
  catalog: CrmCatalog,
  translate: ShellTranslate = identityTranslate,
): ShellChrome {
  const groups: BackendChromeNavGroup[] = catalog.groups.map((group) => ({
    id: group.id,
    name: labelOf(group.labelKey, group.label, translate),
    defaultName: group.label,
    items: group.items.map(toShellItem),
  }))

  const manage = catalog.utility.find((entry) => entry.id === 'manage')
  // Never duplicate a page the catalogue already renders as a daily entry (the
  // hub is `navHidden` today, but that declaration can change).
  const alreadyRendered = new Set(groups.flatMap((group) => group.items.map((item) => item.href)))
  if (manage && !alreadyRendered.has(manage.href)) {
    const label = translate('crmNav.utility.manage', manage.label)
    groups.push({
      id: SHELL_MANAGE_GROUP_ID,
      name: label,
      defaultName: manage.label,
      items: [
        {
          id: manage.href,
          href: manage.href,
          title: label,
          defaultTitle: manage.label,
          iconName: manage.icon,
          order: 0,
        },
      ],
    })
  }

  return {
    groups,
    settingsSections: [],
    settingsPathPrefixes: [],
    profileSections: [],
    profilePathPrefixes: [],
  }
}

/**
 * Every backend href the shell will render. Used by the contract gate to prove
 * that the shell adds no entry the catalogue (or the management hub) does not
 * declare, and that nothing is repeated.
 */
export function shellHrefs(chrome: ShellChrome): string[] {
  return chrome.groups.flatMap((group) => group.items.map((item) => item.href))
}
