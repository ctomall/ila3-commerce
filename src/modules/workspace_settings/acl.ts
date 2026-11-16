export const features = [
  { id: 'workspace_settings.view', title: 'View workspace layout and presets', module: 'workspace_settings' },
  {
    id: 'workspace_settings.manage',
    title: 'Edit workspace order, visibility, labels and presets',
    module: 'workspace_settings',
    dependsOn: ['workspace_settings.view'],
  },
] as const

export default features
