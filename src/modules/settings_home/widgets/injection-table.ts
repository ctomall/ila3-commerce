/**
 * Injection table for the settings-home module.
 *
 * The only entry places the sidebar footer widget in the shell's footer spot,
 * which is rendered inside the sidebar column and can read the collapse state.
 */
const injectionTable = {
  'backend:sidebar:footer': [
    { widgetId: 'settings_home.injection.sidebar-footer', priority: 100 },
  ],
}

export default injectionTable
export { injectionTable }
