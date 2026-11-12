export const features = [
  { id: 'leadgen.candidates.view', title: 'View lead candidates', module: 'leadgen' },
  {
    id: 'leadgen.candidates.review',
    title: 'Review and decide lead candidates',
    module: 'leadgen',
    dependsOn: ['leadgen.candidates.view'],
  },
  {
    id: 'leadgen.crm.write',
    title: 'Write approved candidates into the CRM',
    module: 'leadgen',
    dependsOn: ['leadgen.candidates.view'],
  },
  { id: 'leadgen.runs.create', title: 'Create lead research runs', module: 'leadgen' },
  { id: 'leadgen.quota.view', title: 'View lead quotas', module: 'leadgen' },
  {
    id: 'leadgen.quota.manage',
    title: 'Reserve lead quota',
    module: 'leadgen',
    dependsOn: ['leadgen.quota.view'],
  },
] as const

export default features
