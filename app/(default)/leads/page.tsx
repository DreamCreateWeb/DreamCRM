export const metadata = {
  title: 'Leads - DreamCRM',
  description: 'Inbound contact-form submissions from your public website',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listLeads, getLeadCounts, type LeadStatus } from '@/lib/services/leads'
import LeadsView from './leads-view'

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

  const [rows, counts] = await Promise.all([
    listLeads(ctx.organizationId, { status, search }),
    getLeadCounts(ctx.organizationId),
  ])

  return <LeadsView rows={rows} counts={counts} status={status} search={search ?? ''} />
}
