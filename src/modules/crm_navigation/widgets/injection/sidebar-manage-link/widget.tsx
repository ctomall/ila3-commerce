'use client'
import { SidebarFixedLinks } from '../../../components/SidebarFixedLinks'

/**
 * Headless-to-rendered bridge: the shell's `backend:sidebar:footer` spot is
 * inside the sticky footer, so the hub entry never scrolls with the groups.
 * The account entry and collapse control come from the settings-home widget at
 * the same spot; a lower priority keeps this row above them.
 */
const widget = {
  metadata: {
    id: 'crm_navigation.injection.sidebar-manage-link',
    title: '管理中心（固定）',
    description: 'Pinned management-hub entry next to the account footer',
    enabled: true,
    priority: 90,
  },
  Widget: () => <SidebarFixedLinks variant="footer" />,
}

export default widget
