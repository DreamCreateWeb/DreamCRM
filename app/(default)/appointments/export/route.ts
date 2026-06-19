import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { exportAppointmentsCsv, type AppointmentListFilters } from '@/lib/services/appointments'

const WINDOWS = ['today', 'tomorrow', 'this_week', 'next_14d', 'all_upcoming', 'past_30d']
const ATTENTION = ['unconfirmed', 'needs_intake', 'new_patients', 'has_balance', 'cancelled', 'no_show', 'lapsed_rebooking', 'needs_rebooking']

/**
 * Download the current agenda view as a CSV "call sheet" — same window /
 * attention / provider / source / search filters as the on-screen list (passed
 * through the query string), with patient phone + email and clinic-local times.
 * Clinic tenants only; any staff role (the front desk runs the schedule and
 * this is what they already see). Demo mode allowed for showcasing.
 */
export async function GET(req: NextRequest) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'clinic') {
    return new NextResponse('Not found', { status: 404 })
  }

  const sp = req.nextUrl.searchParams
  const rawWindow = sp.get('window') ?? ''
  const window = (WINDOWS.includes(rawWindow) ? rawWindow : 'next_14d') as AppointmentListFilters['window']
  const attention = (sp.get('attention') ?? '')
    .split(',')
    .filter((a) => ATTENTION.includes(a)) as NonNullable<AppointmentListFilters['attention']>
  const providerId = sp.get('provider')?.trim() || undefined
  const source = sp.get('source')?.trim() || undefined
  const search = sp.get('q')?.trim() || undefined

  const csv = await exportAppointmentsCsv(ctx.organizationId, { window, attention, providerId, source, search })
  const stamp = new Date().toISOString().slice(0, 10)
  const slug = (ctx.organizationSlug || 'clinic').replace(/[^a-z0-9-]/gi, '-')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}-appointments-${window}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
