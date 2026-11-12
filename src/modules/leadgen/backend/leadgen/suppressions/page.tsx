import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import SuppressionsPageClient from './SuppressionsPageClient'

export default async function SuppressionsPage() {
  return (
    <Page>
      <PageBody>
        <SuppressionsPageClient />
      </PageBody>
    </Page>
  )
}
