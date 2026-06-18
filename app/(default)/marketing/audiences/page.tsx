import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import {
  listAudiences,
  resolveAudience,
  type AudienceFilterT,
  type PatientAudienceFilterT,
} from '@/lib/services/marketing'
import { listPatientTags } from '@/lib/services/patient-tags'
import AudiencesClient from './audiences-client'

export const metadata = {
  title: 'Audiences - DreamCRM',
  description: 'Saved segments for campaign sends',
}

export const dynamic = 'force-dynamic'

export default async function AudiencesPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  const t = marketingTerminology(ctx.tenantType)

  const audiences = await listAudiences(ctx.organizationId)
  const tags = ctx.tenantType === 'clinic' ? await listPatientTags(ctx.organizationId) : []
  const counts = await Promise.all(
    audiences.map(async (a) => {
      const rows = await resolveAudience(ctx.organizationId, {
        recipientSource: (a.recipientSource ?? 'customers') as 'customers' | 'patients',
        filter: (a.filter ?? {}) as AudienceFilterT,
        patientFilter: (a.patientFilter ?? {}) as PatientAudienceFilterT,
      })
      return rows.length
    }),
  )

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <AudiencesClient
        initial={audiences.map((a, i) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          recipientSource: (a.recipientSource ?? 'customers') as 'customers' | 'patients',
          filter: (a.filter ?? {}) as AudienceFilterT,
          patientFilter: (a.patientFilter ?? {}) as PatientAudienceFilterT,
          recipientCount: counts[i],
        }))}
        tenantType={ctx.tenantType === 'platform' ? 'platform' : 'clinic'}
        stages={t.stages}
        sources={t.sources}
        tags={tags}
        orgName={ctx.organizationName}
        leadsLabel={t.leads}
      />
    </div>
  )
}
