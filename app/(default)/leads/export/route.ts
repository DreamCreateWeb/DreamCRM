import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { exportLeadsCsv, type LeadStatus } from '@/lib/services/leads'

/**
 * Download the current lead queue as a CSV attachment, honoring the same
 * status + search filters as the on-screen list (passed through the query
 * string). Clinic tenants only; any staff role — the front desk works this
 * queue and pulls call/follow-up sheets, and it's exactly what they already
 * see on /leads. Demo mode allowed so the platform can showcase it.
 */
export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') {
    return new NextResponse('Not found', { status: 404 })
  }

  const sp = req.nextUrl.searchParams
  const rawStatus = sp.get('status') ?? ''
  const valid = ['new', 'contacted', 'converted', 'archived', 'all']
  const status = (valid.includes(rawStatus) ? rawStatus : 'new') as LeadStatus | 'all'
  const search = sp.get('q')?.trim() || undefined

  const csv = await exportLeadsCsv(ctx.organizationId, { status, search })
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = (ctx.organizationSlug || 'clinic').replace(/[^a-z0-9-]/gi, '-')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-leads-${status}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
