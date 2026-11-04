import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import ModelCatalogPageClient from './ModelCatalogPageClient'

export default async function AiModelConfigurationPage() {
  return (
    <Page>
      <PageBody>
        <ModelCatalogPageClient />
      </PageBody>
    </Page>
  )
}
