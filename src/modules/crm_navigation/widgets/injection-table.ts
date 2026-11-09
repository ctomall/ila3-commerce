/**
 * Injection table for the CRM navigation shell.
 *
 * - `backend:sidebar:nav`      five primary scenes (desktop rail)
 * - `backend:sidebar:nav:footer` management-centre entry above the account footer
 * - `backend:layout:top`       content-area second level (tabs / related records)
 */
const injectionTable = {
  'backend:sidebar:nav': [
    { widgetId: 'crm_navigation.injection.sidebar-nav', priority: 20 },
  ],
  'backend:sidebar:nav:footer': [
    { widgetId: 'crm_navigation.injection.manage-link', priority: 20 },
  ],
  'backend:layout:top': [
    { widgetId: 'crm_navigation.injection.content-nav', priority: 20 },
  ],
}

export default injectionTable
export { injectionTable }
