import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import AgentDirectoryClient from './AgentDirectoryClient'

export default function AgentDirectoryPage() {
  return (
    <Page>
      <PageBody>
        <AgentDirectoryClient />
      </PageBody>
    </Page>
  )
}
