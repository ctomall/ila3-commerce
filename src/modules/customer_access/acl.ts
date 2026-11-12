export const features = [
  { id: 'customer_access.view', title: 'View customer access grants', module: 'customer_access' },
  {
    id: 'customer_access.manage',
    title: 'Grant or revoke customer access',
    module: 'customer_access',
    dependsOn: ['customer_access.view'],
  },
] as const

export default features
