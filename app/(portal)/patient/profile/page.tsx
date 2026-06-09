export const metadata = {
  title: 'My info — Patient portal',
}

export const dynamic = 'force-dynamic'

import { getMyPatientRecord } from '@/lib/services/patient-portal'
import { getPortalPageContext } from '../portal-data'
import { PortalHeading, PORTAL_MUTED } from '@/components/patient-portal/ui'
import ProfileForm from './profile-form'

export default async function PortalProfilePage() {
  const pc = await getPortalPageContext()
  const { ctx, brand } = pc

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
    </div>
  )
}
