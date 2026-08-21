export const metadata = {
  title: 'Visits — Patient portal',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { getUpcomingVisits, getPastVisits } from '@/lib/services/patient-portal'
import { getPortalPageContext, toVisitCardData, mapsQueryFor } from '../portal-data'
import VisitCard from '@/components/patient-portal/visit-card'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PortalEmptyState,
  VisitStatusPill,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { fmtVisitDayShort, fmtVisitTime } from '@/components/patient-portal/format'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

/** History shows the latest 10 by default; ?all=1 shows everything. */
const PAST_PAGE_SIZE = 10

export default async function PortalVisitsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const pc = await getPortalPageContext()
  const { ctx, settings, clinic, brand, timeZone, selfBookingEnabled } = pc
  const bookLabel = selfBookingEnabled ? 'Book a visit' : 'Request a visit'

  const [upcoming, past] = await Promise.all([
    getUpcomingVisits(pc.allowedPatientIds, ctx.organizationId),
    getPastVisits(pc.allowedPatientIds, ctx.organizationId),
  ])
  const mapsQuery = mapsQueryFor(clinic)
  const showAllPast = (await searchParams)?.all === '1'
  const shownPast = showAllPast ? past : past.slice(0, PAST_PAGE_SIZE)
  const olderCount = past.length - shownPast.length

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>Your visits</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        Everything coming up, and everywhere you’ve been.
      </p>

      <section className="mt-6">
        <PortalSectionLabel>Coming up</PortalSectionLabel>
        {upcoming.length === 0 ? (
          <PortalCard>
            <PortalEmptyState
              title="Nothing on the books"
              body={selfBookingEnabled ? 'Whenever you’re ready — most weeks have openings.' : 'Whenever you’re ready — send us a request and we’ll find a time.'}
              ctaHref={settings.features.booking ? '/patient/book' : undefined}
              ctaLabel={settings.features.booking ? bookLabel : undefined}
              brand={brand}
            />
          </PortalCard>
        ) : (
          <div className="space-y-3">
            {upcoming.map((v) => (
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

      <section className="mt-8">
        <PortalSectionLabel>Past visits</PortalSectionLabel>
        {past.length === 0 ? (
          // Say so instead of silently omitting the section — a new patient
          // wondering "where's my history?" deserves a sentence.
          <p className="text-[0.9rem]" style={{ color: PORTAL_MUTED }}>
            No past visits with us yet — your history will collect here.
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
              <ul>
                {shownPast.map((v, i) => (
                  <li key={v.id} style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}>
                    {/* Each row opens its visit page (the detail route always
                        handled past visits — the rows just never linked). */}
                    <Link
                      href={`/patient/appointments/${v.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAF7F2]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[0.92rem] font-semibold" style={{ color: PORTAL_INK }}>
                          {PORTAL_VISIT_LABELS[v.type] ?? 'Visit'}
                          {v.patientId !== ctx.patientId && (
                            <span className="ml-2 font-medium" style={{ color: brand }}>
                              {v.patientFirstName}
                            </span>
                          )}
                        </p>
                        <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                          {fmtVisitDayShort(v.startTime, timeZone)} · {fmtVisitTime(v.startTime, timeZone)}
                          {v.providerName ? ` · with ${v.providerName}` : ''}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <VisitStatusPill status={v.status} />
                        <span aria-hidden="true" className="text-[0.85rem] font-bold" style={{ color: PORTAL_MUTED }}>
                          ›
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {olderCount > 0 && (
              <Link
                href="/patient/appointments?all=1"
                className="mt-3 inline-block text-[0.88rem] font-semibold"
                style={{ color: brand }}
              >
                Show older visits ({olderCount} more)
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  )
}
