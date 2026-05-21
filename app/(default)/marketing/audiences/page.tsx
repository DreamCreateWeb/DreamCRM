import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { marketingTerminology } from '@/lib/marketing/terminology'
import {
  listAudiences,
  resolveAudience,
  type AudienceFilterT,
  type PatientAudienceFilterT,
} from '@/lib/services/marketing'
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
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      <div className="sm:flex sm:justify-between sm:items-center mb-4">
        <div className="mb-3 sm:mb-0">
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Audiences
          </h1>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5">
            Saved segments of {t.leads} you can target with a campaign send.
          </p>
        </div>
        <Link
          href="/marketing"
          className="text-[12px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← Marketing
        </Link>
      </div>

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
      />
    </div>
  )
}
