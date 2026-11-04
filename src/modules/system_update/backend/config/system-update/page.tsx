import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import SystemUpdatePageClient from './SystemUpdatePageClient'

export default async function SystemUpdatePage() {
  return (
    <Page>
      <PageBody>
        <SystemUpdatePageClient />
      </PageBody>
    </Page>
  )
}
