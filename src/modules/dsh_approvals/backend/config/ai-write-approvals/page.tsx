import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import AiWriteApprovalsPageClient from './AiWriteApprovalsPageClient'

export default async function AiWriteApprovalsPage() {
  return (
    <Page>
      <PageBody>
        <AiWriteApprovalsPageClient />
      </PageBody>
    </Page>
  )
}
