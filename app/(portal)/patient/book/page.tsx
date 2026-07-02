export const metadata = {
  title: 'Book a visit — Patient portal',
}

export const dynamic = 'force-dynamic'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import { PortalHeading, PORTAL_MUTED } from '@/components/patient-portal/ui'
import { portalVisitTypes } from '@/lib/types/visit-types'
import { resolveClinicTimeZone } from '@/lib/clinic-timezone'
import PortalBookForm from './book-form'
import PortalRequestForm from './request-form'

export default async function PortalBookPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'booking')
  const { ctx, settings, clinic, brand, selfBookingEnabled } = pc

  const [me, profileRows] = await Promise.all([
    getMyPatientRecord(ctx.patientId, ctx.organizationId),
    db
      .select({ visitTypeSettings: clinicProfile.visitTypeSettings, timezone: clinicProfile.timezone })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1),
  ])
  const timeZone = resolveClinicTimeZone(profileRows[0]?.timezone)

  // Bookable types = the clinic's portal-bookable catalog ∩ the portal
  // settings' allowed list. The settings list stays the patient-facing gate
  // (clinics curate it in /settings/portal); the catalog adds the
  // bookablePortal flag + nice labels for custom types. Falls back to the raw
  // settings list when the intersection is empty so booking never dead-ends.
  const catalog = portalVisitTypes(profileRows[0]?.visitTypeSettings ?? null)
  const allowedSet = new Set(settings.booking.allowedTypes)
  const intersected = catalog.filter((t) => allowedSet.has(t.id))
  const allowedTypes = intersected.length > 0 ? intersected.map((t) => t.id) : settings.booking.allowedTypes
  const typeLabels: Record<string, string> = {}
  for (const t of catalog) typeLabels[t.id] = t.label

  const self = { id: ctx.patientId, firstName: me?.firstName ?? 'Me' }
  const dependents = pc.dependents.map((d) => ({ id: d.id, firstName: d.firstName }))

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>{selfBookingEnabled ? 'Book a visit' : 'Request a visit'}</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        {selfBookingEnabled
          ? 'Real openings, straight from our calendar. Pick what works — no phone call needed.'
          : 'Tell us what you need and we’ll reach out to find a time that works — usually within one business day.'}
      </p>

      <div className="mt-6">
        {selfBookingEnabled ? (
          <PortalBookForm
            brand={brand}
            timeZone={timeZone}
            allowedTypes={allowedTypes}
            typeLabels={typeLabels}
            minNoticeHours={settings.booking.minNoticeHours}
            self={self}
            dependents={dependents}
            clinicPhone={clinic?.phone ?? null}
          />
        ) : (
          <PortalRequestForm
            brand={brand}
            allowedTypes={allowedTypes}
            typeLabels={typeLabels}
            self={self}
            dependents={dependents}
            clinicPhone={clinic?.phone ?? null}
          />
        )}
      </div>
    </div>
  )
}
