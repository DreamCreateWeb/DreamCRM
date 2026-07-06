export const metadata = {
  title: 'Family — Patient portal',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getUpcomingVisits } from '@/lib/services/patient-portal'
import { getPortalPageContext, requirePortalFeature, toVisitCardData, mapsQueryFor } from '../portal-data'
import VisitCard from '@/components/patient-portal/visit-card'
import FamilyLinkRequest from '@/components/patient-portal/family-link-request'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PORTAL_INK,
  PORTAL_MUTED,
} from '@/components/patient-portal/ui'

function ageFrom(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(`${dob}T12:00:00Z`)
  if (isNaN(d.getTime())) return null
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000))
}

export default async function PortalFamilyPage() {
  const pc = await getPortalPageContext()
  requirePortalFeature(pc, 'family')
  const { ctx, settings, clinic, brand, timeZone, dependents, selfBookingEnabled } = pc

  if (dependents.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <PortalHeading color={brand}>Family</PortalHeading>
        <PortalCard className="mt-6">
          <p className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
            Manage your family&apos;s visits from one login
          </p>
          <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
            Ask the front desk to link your kids or family members to your account — then their
            visits and forms show up right here, no extra passwords.
          </p>
          {clinic?.phone && (
            <a
              href={`tel:${clinic.phone}`}
              className="mt-4 inline-block rounded-full px-5 py-2.5 text-[0.88rem] font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              Call us to set it up
            </a>
          )}
        </PortalCard>
      </div>
    )
  }

  const mapsQuery = mapsQueryFor(clinic)
  const visitsByDependent = await Promise.all(
    dependents.map((d) => getUpcomingVisits([d.id], ctx.organizationId)),
  )

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>Family</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        Everyone you look after, in one place.
      </p>

      {dependents.map((dep, i) => {
        const visits = visitsByDependent[i]
        const age = ageFrom(dep.dateOfBirth)
        return (
          <section key={dep.id} className="mt-7">
            <PortalSectionLabel>
              {dep.firstName} {dep.lastName}
              {age != null ? ` · ${age}` : ''}
            </PortalSectionLabel>
            {visits.length === 0 ? (
              <PortalCard>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
                    No upcoming visits for {dep.firstName}.
                  </p>
                  {settings.features.booking && (
                    <Link
                      href="/patient/book"
                      className="rounded-full px-4 py-2 text-[0.82rem] font-semibold text-white"
                      style={{ backgroundColor: brand }}
                    >
                      {selfBookingEnabled ? `Book for ${dep.firstName}` : `Request for ${dep.firstName}`}
                    </Link>
                  )}
                </div>
              </PortalCard>
            ) : (
              <div className="space-y-3">
                {visits.map((v) => (
                  <VisitCard
                    key={v.id}
                    visit={toVisitCardData(v, ctx.patientId)}
                    brand={brand}
                    timeZone={timeZone}
                    clinicPhone={clinic?.phone ?? null}
                    mapsQuery={mapsQuery}
                    canModify={settings.features.reschedule}
                canJoinWaitlist={settings.features.waitlist}
                    minNoticeHours={settings.reschedule.minNoticeHours}
                    showFace={settings.display.showTeamPhotos}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Add another family member — rides the message thread; staff verify
          and link with their existing tools. */}
      <section className="mt-7">
        <FamilyLinkRequest brand={brand} />
      </section>
    </div>
  )
}
