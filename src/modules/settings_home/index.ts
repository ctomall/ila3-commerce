import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * App-owned settings landing page.
 *
 * Replaces the stock placeholder at `/backend/settings` with a searchable card
 * grid of every settings surface, plus a recent-visits row and a unified AI
 * group. The stock page is disabled through the `auth` module override in
 * `src/modules.ts`.
 */
export const metadata: ModuleInfo = {
  name: 'settings_home',
  title: 'Settings Home',
  version: '0.1.0',
  description: 'Searchable card grid for all settings pages, with recent visits and a unified AI group.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
