export const metadata = {
  title: 'My info — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { getPortalPageContext } from '../portal-data'
import { PortalCard, PortalHeading, PortalSectionLabel, PORTAL_MUTED } from '@/components/patient-portal/ui'
import ProfileForm from './profile-form'
import FamilyLinkRequest from '@/components/patient-portal/family-link-request'
import TextSizeToggle from '@/components/ui/text-size-toggle'

export default async function PortalProfilePage() {
  const pc = await getPortalPageContext()
  const { ctx, brand, settings } = pc

  const me = await getMyPatientRecord(ctx.patientId, ctx.organizationId)
  if (!me) return null

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>My info</PortalHeading>
      <p className="mb-6 mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        Keep your details current so we can reach you the right way.
      </p>
      <ProfileForm
        brand={brand}
        marketingEmailOptIn={me.marketingEmailOptIn === 1}
        values={{
          firstName: me.firstName,
          lastName: me.lastName,
          email: me.email ?? '',
          phone: me.phone ?? '',
          dateOfBirth: me.dateOfBirth ?? '',
          addressLine1: me.addressLine1 ?? '',
          city: me.city ?? '',
          state: me.state ?? '',
          postalCode: me.postalCode ?? '',
          insuranceProvider: me.insuranceProvider ?? '',
          insurancePolicyNumber: me.insurancePolicyNumber ?? '',
          insuranceGroupNumber: me.insuranceGroupNumber ?? '',
        }}
      />

      {/* "Never squint" — per-device text scaling for the whole portal. */}
      <div className="mt-7">
        <PortalSectionLabel>Text size</PortalSectionLabel>
        <PortalCard>
          <p className="mb-3 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
            Make everything on this site bigger. Saved on this device, applies right away.
          </p>
          <TextSizeToggle tone="portal" brand={brand} />
        </PortalCard>
      </div>

      {/* Family access lives behind the Family tab once a dependent is
          linked — but the FIRST link request has to start somewhere always
          reachable, and that's here. */}
      {settings.features.family && settings.features.messages && (
        <div className="mt-7">
          <FamilyLinkRequest brand={brand} />
        </div>
      )}
    </div>
  )
}
