import { redirect } from 'next/navigation'

/**
 * 工作台 → the existing dashboard.
 *
 * A redirect rather than a copy: the dashboard stays the single implementation, and the
 * menu gets a destination a salesperson can actually click.
 */
export default function WorkbenchEntryPage() {
  redirect('/backend')
}
