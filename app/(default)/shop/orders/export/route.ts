import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { exportShopOrdersCsv } from '@/lib/services/shop'

/**
 * Download the clinic's shop orders as a CSV (month-end bookkeeping).
 * Owner/admin + clinic only; demo allowed so the platform can showcase it.
 */
export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') return new NextResponse('Not found', { status: 404 })
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  const csv = await exportShopOrdersCsv(ctx.organizationId)
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = (ctx.organizationSlug || 'clinic').replace(/[^a-z0-9-]/gi, '-')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-orders-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
