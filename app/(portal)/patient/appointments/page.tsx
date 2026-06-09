export const metadata = {
  title: 'Visits — Patient portal',
}

export const dynamic = 'force-dynamic'

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

export default async function PortalVisitsPage() {
  const pc = await getPortalPageContext()
  const { ctx, settings, clinic, brand, timeZone } = pc

  const [upcoming, past] = await Promise.all([
    getUpcomingVisits(pc.allowedPatientIds, ctx.organizationId),
    getPastVisits(pc.allowedPatientIds, ctx.organizationId),
  ])
  const mapsQuery = mapsQueryFor(clinic)

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
              body="Whenever you’re ready — most weeks have openings."
              ctaHref={settings.features.booking ? '/patient/book' : undefined}
              ctaLabel={settings.features.booking ? 'Book a visit' : undefined}
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
                minNoticeHours={settings.reschedule.minNoticeHours}
                showFace={settings.display.showTeamPhotos}
              />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <PortalSectionLabel>Past visits</PortalSectionLabel>
          <div className="overflow-hidden rounded-2xl bg-white" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
            <ul>
              {past.map((v, i) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                  style={i > 0 ? { borderTop: `1px solid ${PORTAL_BORDER}` } : undefined}
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
                  <VisitStatusPill status={v.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}
