export const metadata = {
  title: 'Appointments - DreamCRM',
  description: 'Confirm, reschedule, and follow up on your upcoming visits',
}

export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listAppointments,
  getAppointmentFilterMeta,
  groupByDay,
  type AppointmentListFilters,
} from '@/lib/services/appointments'
import { listSavedViews } from '@/lib/services/saved-views'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { listWaitlist } from '@/lib/services/appointment-waitlist'
import {
  normalizeAppointmentViewFilters,
  appointmentViewFiltersToQuery,
} from '@/lib/types/appointment-views'
import AgendaView from './agenda-view'
import WaitlistPanel from './waitlist-panel'
import ModuleHint from '@/components/onboarding/module-hint'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseWindow(raw: string | string[] | undefined): AppointmentListFilters['window'] {
  const v = typeof raw === 'string' ? raw : ''
  const valid = ['today', 'tomorrow', 'this_week', 'next_14d', 'all_upcoming', 'past_30d'] as const
  return (valid as readonly string[]).includes(v) ? (v as AppointmentListFilters['window']) : 'next_14d'
}

function parseAttention(raw: string | string[] | undefined): NonNullable<AppointmentListFilters['attention']> {
  const v = typeof raw === 'string' ? raw : ''
  if (!v) return []
  const parts = v.split(',').filter(Boolean)
  const valid = ['unconfirmed', 'needs_intake', 'new_patients', 'has_balance', 'cancelled', 'no_show', 'lapsed_rebooking', 'needs_rebooking']
  return parts.filter((p) => valid.includes(p)) as NonNullable<AppointmentListFilters['attention']>
}

export default async function AppointmentsPage({ searchParams }: PageProps) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/calendar')

  const params = await searchParams
  const filters: AppointmentListFilters = {
    window: parseWindow(params.window),
    attention: parseAttention(params.attention),
    providerId: typeof params.provider === 'string' ? params.provider : undefined,
    source: typeof params.source === 'string' ? params.source : undefined,
    search: typeof params.q === 'string' ? params.q : undefined,
  }

  const [rows, meta, viewRows, timeZone, waitlistRows] = await Promise.all([
    listAppointments(ctx.organizationId, filters),
    getAppointmentFilterMeta(ctx.organizationId),
    listSavedViews(ctx.organizationId, 'appointments'),
    getClinicTimeZone(ctx.organizationId),
    listWaitlist(ctx.organizationId),
  ])
  const groups = groupByDay(rows, timeZone)
  // Map each stored view to the chip the bar needs (name + reopen query).
  const savedViews = viewRows.map((v) => {
    const f = normalizeAppointmentViewFilters(v.filters)
    return { id: v.id, name: v.name, query: appointmentViewFiltersToQuery(f) }
  })
  // Serialize for the client panel (Dates → ISO strings).
  const waitlistEntries = waitlistRows.map((w) => ({
    id: w.id,
    patientId: w.patientId,
    patientName: w.patientName,
    visitTypeLabel: w.visitTypeLabel,
    providerName: w.providerName,
    currentVisitAtIso: w.currentVisitAt ? w.currentVisitAt.toISOString() : null,
    pendingOffers: w.pendingOffers,
  }))

    return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pt-6 w-full max-w-[96rem] mx-auto -mb-2">
        <ModuleHint id="appointments" />
        <WaitlistPanel entries={waitlistEntries} />
      </div>
    <AgendaView
      groups={groups}
      meta={meta}
      filters={filters}
      orgName={ctx.organizationName}
      savedViews={savedViews}
    />
    </>
  )
}
