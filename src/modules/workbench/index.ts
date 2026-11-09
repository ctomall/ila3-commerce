import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * 工作台入口（P1 正式菜单收敛）。
 *
 * The five target areas start with a workbench, but `/backend` — the page that already is
 * the dashboard — is the app root and therefore has no nav entry at all. This module adds a
 * named entry that points at it, so "工作台" is a real destination instead of an empty
 * grouping nobody can click.
 *
 * It renders no data of its own: it redirects to the existing dashboard, so there is one
 * dashboard implementation, not two.
 */
export const metadata: ModuleInfo = {
  name: 'workbench',
  title: '工作台',
  version: '0.1.0',
  description: 'Named entry for the existing backend dashboard so it can sit in the menu.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
