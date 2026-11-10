/**
 * Injection table for the CRM navigation shell.
 *
 * The installed AppShell renders the sidebar itself from the catalogue-backed
 * chrome payload; this module only contributes an error+retry card for the one
 * state the stock shell cannot describe (a settled payload with no usable
 * catalogue). It renders nothing while the catalogue is healthy or loading.
 */
const injectionTable = {
  'backend:sidebar:nav': [
    { widgetId: 'crm_navigation.injection.nav-error', priority: 20 },
  ],
}

export default injectionTable
export { injectionTable }
