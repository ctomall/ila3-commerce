import { notFound } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { SCENE_MAP } from '@/nav/crm-navigation'
import BusinessCategory from './BusinessCategory'

export default async function BusinessCategoryPage({
  params,
}: {
  params: Promise<{ category?: string }>
}) {
  const { category } = await params
  if (!category || !SCENE_MAP.businessCategories.some((entry) => entry.id === category)) {
    notFound()
  }
  return (
    <Page>
      <PageBody>
        <BusinessCategory category={category} />
      </PageBody>
    </Page>
  )
}
