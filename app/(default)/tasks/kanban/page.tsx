import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

/**
 * Retired 2026-07-07 (platform declutter). The generic Mosaic task board was
 * never dental (no shipping dental product ships a todo/kanban) and was the
 * last template surface in the platform sidebar. It's out of every nav now;
 * this route redirects so an old bookmark never dead-ends. Clinic followups
 * live contextually (Overview attention cards, Patients needs-attention,
 * Appointments aging, Leads rot); the platform's own work lives in
 * Prospecting + Sales Pipeline.
 */
export default async function KanbanRetired() {
  await requireTenant()
  redirect('/dashboard')
}
