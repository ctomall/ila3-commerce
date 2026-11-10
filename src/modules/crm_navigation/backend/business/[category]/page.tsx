import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import BusinessCategory from './BusinessCategory'

export default async function BusinessCategoryPage({
  params,
}: {
  params: Promise<{ category?: string }>
}) {
  const { category } = await params
  return (
    <Page>
      <PageBody>
        <BusinessCategory category={category ?? ''} />
      </PageBody>
    </Page>
  )
}
