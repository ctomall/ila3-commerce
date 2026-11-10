import { ComponentReplacementHandles } from '@open-mercato/shared/modules/widgets/component-registry'
import type { ComponentOverride } from '@open-mercato/shared/modules/widgets/component-registry'
import { createBoundedLoadingWrapper } from '../components/bounded-table-load'

/**
 * The installed profile communication-channels table.
 *
 * This id comes from the module's own host descriptor
 * (`extensionPoints.hosts.profileChannelsTable.tableId`), and the page passes it to
 * `DataTable` as `extensionTableId`. `DataTable` resolves its `data-table:<id>` handle
 * through `useRegisteredComponent`, which is a *client* host — the resolution that
 * actually runs, unlike the `page:` handle which the server resolves before the
 * override provider has mounted. The handle is therefore the smallest seam that
 * changes this one table and nothing else.
 */
export const PROFILE_CHANNELS_TABLE_HANDLE = ComponentReplacementHandles.dataTable(
  'communication_channels.profile.channels',
)

/**
 * Bounded loading for the profile communication-channels table.
 *
 * The installed page clears its loading state only when
 * `GET /api/communication_channels/me/channels` settles and passes no abort signal,
 * so a request that never answers (a stalled ingress, an edge that holds the stream,
 * a route handler that stops responding) keeps the table in "正在加载表格…" forever.
 * This wrapper gives that wait an upper bound: past the budget the table is replaced
 * by the shared error surface with a retry exit, and a late answer still restores the
 * real table. It decorates the host rather than replacing it, so connect/share/poll
 * actions and all columns stay exactly as installed.
 */
export const componentOverrides: ComponentOverride[] = [
  {
    target: { componentId: PROFILE_CHANNELS_TABLE_HANDLE },
    priority: 10,
    wrapper: createBoundedLoadingWrapper(),
  },
]

export default componentOverrides
