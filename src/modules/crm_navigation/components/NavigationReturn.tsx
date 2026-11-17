"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { readCrmCatalog } from '@/nav/crm-navigation'
import { navigationParent } from '../lib/navigation-parent'

export function NavigationReturn() {
  const { payload, isLoading } = useBackendChrome()
  const pathname = usePathname()
  const t = useT()
  const parent = navigationParent(readCrmCatalog(payload), pathname ?? '')
  if (isLoading || !parent) return null
  const label = t('crmNav.returnToList', '返回 {name}', { name: parent.label })
  return <Button asChild variant="ghost" size="sm" className="inline-flex" title={label}>
    <Link href={parent.href} aria-label={label} data-navigation-return="">
      <ArrowLeft className="size-4" aria-hidden />
      <span className="hidden max-w-32 truncate md:inline">{parent.label}</span>
    </Link>
  </Button>
}
