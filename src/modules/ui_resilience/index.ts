import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Bounded loading for installed list surfaces.
 *
 * The installed profile communication-channels page starts its DataTable in the
 * loading state and clears it only when the `me/channels` request settles — with no
 * client-side budget, a request that never answers leaves the table showing
 * "正在加载表格…" forever, with no error and no retry. This module owns the app-side
 * guard for that class of surface: it decorates a DataTable host so a table still
 * loading past the budget renders a readable error with a retry exit instead of an
 * endless spinner, and returns to the real table if the late answer ever arrives.
 *
 * The installed page itself is untouched (`node_modules` is never edited) and the
 * override is a client-side component wrapper on the table's stable UMES handle, so
 * disabling this module restores the stock behaviour with no stale route or menu entry.
 */
export const metadata: ModuleInfo = {
  name: 'ui_resilience',
  title: 'UI resilience',
  version: '0.1.0',
  description:
    'Bounded loading for installed list surfaces: a table stuck in its loading state past the budget shows a readable error with a retry exit instead of an endless spinner.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
