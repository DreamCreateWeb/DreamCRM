import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { exportPatientsCsv } from '@/lib/services/patient-import'

/**
 * Download the clinic's patients as a CSV attachment.
 *
 * Owner/admin only, clinic tenants only — this is the "can I get my data out?"
 * answer to the lock-in question, so it has to be real and self-serve, but a
 * patient export is sensitive (PHI-adjacent contact data), hence the role gate.
 * Demo mode is allowed so the platform can showcase it.
 */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') {
    return new NextResponse('Not found', { status: 404 })
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const csv = await exportPatientsCsv(ctx.organizationId)
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = (ctx.organizationSlug || 'clinic').replace(/[^a-z0-9-]/gi, '-')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-patients-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
