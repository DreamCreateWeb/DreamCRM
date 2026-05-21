import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

/**
 * Website front door. Per DESIGN.md ("the website is the trunk"), the
 * editor should be a first-class top-level surface — not buried in
 * Settings. For now this redirects to the existing /settings/clinic
 * editor (logo, hero, services, staff, hours, brand). A dedicated
 * Website dashboard (page list, traffic, SEO snapshot, publish state)
 * lands as a follow-up.
 */
export default async function WebsiteEditorRedirect() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  redirect('/settings/clinic')
}
