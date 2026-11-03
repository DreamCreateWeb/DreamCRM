export const metadata = {
  title: 'Inquiries - DreamCRM',
  description: 'People who reached out through the contact form on your website',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listLeads, getLeadCounts, getLeadsPerDay14, type LeadStatus } from '@/lib/services/leads'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { canUseInsuranceTool } from '@/lib/insurance-eligibility'
import { getInsuranceSetup } from '@/lib/services/insurance-eligibility'
import LeadsView from './leads-view'
import ModuleHint from '@/components/onboarding/module-hint'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseStatus(raw: string | string[] | undefined): LeadStatus | 'all' {
  const v = typeof raw === 'string' ? raw : ''
  const valid = ['new', 'contacted', 'converted', 'archived', 'all']
  return valid.includes(v) ? (v as LeadStatus | 'all') : 'new'
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/')

  const params = await searchParams
  const status = parseStatus(params.status)
  const search = typeof params.q === 'string' ? params.q : undefined

  const [rows, counts, perDay14, timeZone, insuranceOpen] = await Promise.all([
    listLeads(ctx.organizationId, { status, search }),
    getLeadCounts(ctx.organizationId),
    getLeadsPerDay14(ctx.organizationId),
    getClinicTimeZone(ctx.organizationId),
    // `canUseInsuranceTool` is the ONE predicate; the switch is its setup read. Unreadable = closed.
    canUseInsuranceTool(ctx) ? getInsuranceSetup(ctx.organizationId).then((s) => s.enabled).catch(() => false) : Promise.resolve(false),
  ])

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="leads" />
      </div>
      <LeadsView rows={rows} counts={counts} perDay14={perDay14} status={status} search={search ?? ''} orgName={ctx.organizationName} timeZone={timeZone} insuranceOpen={insuranceOpen} />
    </>
  )
}
