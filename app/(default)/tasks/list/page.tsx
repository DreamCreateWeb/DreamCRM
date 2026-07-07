import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

/**
 * Retired 2026-07-07 (platform declutter) — see tasks/kanban/page.tsx. The
 * generic Mosaic task list is out of every nav; this redirects any old
 * bookmark to the dashboard.
 */
export default async function TasksListRetired() {
  await requireTenant()
  redirect('/dashboard')
}
