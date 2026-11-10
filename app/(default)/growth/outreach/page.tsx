import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { TeamDidItBand } from '@/components/ui/team-did-it-band'
import { teamDidIt, TEAM_DID_IT_QUIET } from '@/lib/services/team-did-it'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { OUTREACH_LANES } from '@/lib/team-did-it-lanes'
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
  if (ctx.tenantType === 'caller') redirect('/calls')
  if (ctx.tenantType !== 'clinic') redirect('/marketing')
  const { prefill_audience, prefill_template, new: newParam } = await searchParams
  const prefillAudienceId =
    prefill_audience && Number.isFinite(Number(prefill_audience)) ? Number(prefill_audience) : undefined
  const prefillTemplateId =
    prefill_template && Number.isFinite(Number(prefill_template)) ? Number(prefill_template) : undefined
  const teamDid = await getClinicTimeZone(ctx.organizationId)
    .then((tz) => teamDidIt(ctx.organizationId, OUTREACH_LANES.capabilities, { timeZone: tz }))
    .catch(() => TEAM_DID_IT_QUIET)
  return (
    <>
      {teamDid.open > 0 || teamDid.doneThisWeek > 0 ? (
        <div className="px-4 sm:px-6 lg:px-8 pt-8 w-full max-w-[96rem] mx-auto -mb-6">
          <TeamDidItBand data={teamDid} what={OUTREACH_LANES.what} />
        </div>
      ) : null}
      <ClinicRecallDashboard
        ctx={ctx}
        prefillAudienceId={prefillAudienceId}
        prefillTemplateId={prefillTemplateId}
        autoOpenNew={newParam === '1'}
      />
    </>
  )
}
