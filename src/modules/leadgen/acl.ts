export const features = [
  { id: 'leadgen.candidates.view', title: 'View lead candidates', module: 'leadgen' },
  {
    id: 'leadgen.candidates.review',
    title: 'Review and decide lead candidates',
    module: 'leadgen',
    dependsOn: ['leadgen.candidates.view'],
  },
  {
    id: 'leadgen.candidates.manage',
    title: 'Submit candidates and run verification or CRM intake',
    module: 'leadgen',
    dependsOn: ['leadgen.candidates.view'],
  },
  { id: 'leadgen.quota.view', title: 'View lead quotas', module: 'leadgen' },
  {
    id: 'leadgen.quota.manage',
    title: 'Reserve lead quota',
    module: 'leadgen',
    dependsOn: ['leadgen.quota.view'],
  },
] as const

export default features
