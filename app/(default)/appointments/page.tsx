export const metadata = {
  title: 'Appointments - DreamCRM',
  description: 'Confirm, reschedule, and follow up on the bookings on your books',
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
import AgendaView from './agenda-view'

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
  const valid = ['unconfirmed', 'needs_intake', 'new_patients', 'has_balance', 'cancelled', 'no_show', 'lapsed_rebooking']
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
    search: typeof params.q === 'string' ? params.q : undefined,
  }

  const [rows, meta] = await Promise.all([
    listAppointments(ctx.organizationId, filters),
    getAppointmentFilterMeta(ctx.organizationId),
  ])
  const groups = groupByDay(rows)

  return (
    <AgendaView
      groups={groups}
      meta={meta}
      filters={filters}
      orgName={ctx.organizationName}
    />
  )
}
