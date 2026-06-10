import { NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  getAccessiblePatientIds,
  getVisitForPatients,
  getPortalClinicInfo,
} from '@/lib/services/patient-portal'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

/**
 * "Add to calendar" — a standards-plain .ics download for a single visit.
 * Times are emitted as UTC instants (Z), which every calendar client
 * renders in the user's local zone. Auth: signed-in patient, scoped to
 * self + linked dependents.
 */

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext()
  if (!ctx || ctx.tenantType !== 'patient' || !ctx.patientId) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { id } = await params
  const settings = await getPortalSettings(ctx.organizationId)
  const allowed = await getAccessiblePatientIds(ctx.patientId, ctx.organizationId, settings.features.family)
  const [visit, clinic] = await Promise.all([
    getVisitForPatients(id, allowed, ctx.organizationId),
    getPortalClinicInfo(ctx.organizationId),
  ])
  if (!visit) return new NextResponse('Not found', { status: 404 })

  const clinicName = clinic?.displayName ?? ctx.organizationName
  const label = PORTAL_VISIT_LABELS[visit.type] ?? 'Visit'
  const summary = `${label} at ${clinicName}`
  const start = visit.startTime
  const end = visit.endTime ?? new Date(start.getTime() + 30 * 60_000)
  const location = [clinic?.addressLine1, clinic?.city, clinic?.state, clinic?.postalCode]
    .filter(Boolean)
    .join(', ')
  const description = [
    visit.providerName ? `With ${visit.providerName}.` : '',
    clinic?.phone ? `Questions? Call ${clinicName} at ${clinic.phone}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DreamCRM//Patient Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:visit-${visit.id}@dreamcreatestudio.com`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    location ? `LOCATION:${icsEscape(location)}` : '',
    description ? `DESCRIPTION:${icsEscape(description)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(summary)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="visit-${visit.id}.ics"`,
    },
  })
}
