export const metadata = {
  title: 'Book a visit — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { getPortalPageContext, requirePortalFeature } from '../portal-data'
import { PortalHeading, PORTAL_MUTED } from '@/components/patient-portal/ui'
import PortalBookForm from './book-form'

export default async function PortalBookPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'booking')
  const { ctx, settings, clinic, brand } = pc

  const me = await getMyPatientRecord(ctx.patientId, ctx.organizationId)

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>Book a visit</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        Real openings, straight from our calendar. Pick what works — no phone call needed.
      </p>

      <div className="mt-6">
        <PortalBookForm
          brand={brand}
          allowedTypes={settings.booking.allowedTypes}
          minNoticeHours={settings.booking.minNoticeHours}
          self={{ id: ctx.patientId, firstName: me?.firstName ?? 'Me' }}
          dependents={pc.dependents.map((d) => ({ id: d.id, firstName: d.firstName }))}
          clinicPhone={clinic?.phone ?? null}
        />
      </div>
    </div>
  )
}
