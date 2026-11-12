import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import LeadgenCandidatesPageClient from './LeadgenCandidatesPageClient'

export default async function LeadgenCandidatesPage() {
  return (
    <Page>
      <PageBody>
        <LeadgenCandidatesPageClient />
      </PageBody>
    </Page>
  )
}
