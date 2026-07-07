import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'

export const dynamic = 'force-dynamic'

/**
 * Retired 2026-07-07 (platform declutter). The generic Mosaic FullCalendar
 * wrapped around `calendar_events` was a template leftover — clinics run the
 * dental-correct Appointments module, and the platform's scheduling lives in
 * Prospecting (demo bookings) + the sales pipeline. Out of every nav now;
 * this redirects any old bookmark. (The patient .ics calendar FEED —
 * services/calendar-feed — is a separate, live system and is untouched.)
 */
export default async function CalendarRetired() {
  const ctx = await requireTenant()
  redirect(ctx.tenantType === 'clinic' ? '/appointments' : '/dashboard')
}
