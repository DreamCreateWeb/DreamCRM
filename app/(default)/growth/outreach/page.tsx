import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import ClinicRecallDashboard from '../../marketing/clinic-recall-dashboard'

export const metadata = {
  title: 'Recall & Outreach - DreamCRM',
  description: 'Who needs a nudge today — recall due, lapsed, birthdays, and your campaign performance.',
}

export const dynamic = 'force-dynamic'

/**
 * Growth → Outreach — the clinic recall dashboard's home in the Growth
 * workspace (moved from /marketing, which now serves only the platform
 * tenant's pipeline). The dashboard component itself stays in
 * app/(default)/marketing/ — it shares its actions + data layer with the
 * platform surfaces, so only the ROUTE moved.
 *
 * Since the phase-3 fold this hub is also the clinic's campaign home:
 * queue/audience CTAs land here with ?prefill_audience/?prefill_template
 * and the New-campaign modal auto-opens pre-targeted.
 */
export default async function GrowthOutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill_audience?: string; prefill_template?: string; new?: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/marketing')
  const { prefill_audience, prefill_template, new: newParam } = await searchParams
  const prefillAudienceId =
    prefill_audience && Number.isFinite(Number(prefill_audience)) ? Number(prefill_audience) : undefined
  const prefillTemplateId =
    prefill_template && Number.isFinite(Number(prefill_template)) ? Number(prefill_template) : undefined
  return (
    <ClinicRecallDashboard
      ctx={ctx}
      prefillAudienceId={prefillAudienceId}
      prefillTemplateId={prefillTemplateId}
      autoOpenNew={newParam === '1'}
    />
  )
}
