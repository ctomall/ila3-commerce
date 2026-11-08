import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { PrototypeShell } from '../PrototypeShell'
import { PrototypeSection } from '../sections'

export default function CrmPrototypePage() {
  return (
    <Page>
      <PageBody>
        <PrototypeShell active="candidates">
          <PrototypeSection section="candidates" />
        </PrototypeShell>
      </PageBody>
    </Page>
  )
}
