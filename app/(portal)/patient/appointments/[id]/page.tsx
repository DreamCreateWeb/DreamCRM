export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getVisitForPatients, getMyPendingForms } from '@/lib/services/patient-portal'
import { getPortalPageContext, toVisitCardData, mapsQueryFor } from '../../portal-data'
import VisitCard from '@/components/patient-portal/visit-card'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PORTAL_INK,
  PORTAL_MUTED,
} from '@/components/patient-portal/ui'
import { fmtVisitDayShort, fmtVisitTime } from '@/components/patient-portal/format'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

export const metadata = {
  title: 'Your visit — Patient portal',
}

/**
 * /patient/appointments/[id] — a real destination per visit, not just a card
 * in a list. The VisitCard stays the single action hub (confirm / reschedule
 * / cancel / waitlist / calendar / directions), and the page wraps it with
 * what a patient actually wants before a visit: who they'll see, how to get
 * ready (pending forms, universal bring-list), and where to go. Family-aware
 * — a guardian can open a dependent's visit.
 */
export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pc = await getPortalPageContext()
  const { ctx, settings, clinic, brand, timeZone } = pc

  const visit = await getVisitForPatients(id, pc.allowedPatientIds, ctx.organizationId)
  if (!visit) notFound()

  const upcoming = visit.startTime.getTime() > Date.now()
  const pendingForms =
    upcoming && settings.features.forms
      ? await getMyPendingForms(visit.patientId, ctx.organizationId).catch(() => [])
      : []
  const mapsQuery = mapsQueryFor(clinic)
  const typeLabel = PORTAL_VISIT_LABELS[visit.type] ?? 'Visit'

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/patient/appointments"
        className="text-[0.85rem] font-semibold"
        style={{ color: PORTAL_MUTED }}
      >
        ← All visits
      </Link>
      <div className="mt-2">
        <PortalHeading color={brand}>
          {typeLabel}
          {visit.patientFirstName && visit.patientId !== ctx.patientId
            ? ` for ${visit.patientFirstName}`
            : ''}
        </PortalHeading>
        <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
          {fmtVisitDayShort(visit.startTime, timeZone)} at {fmtVisitTime(visit.startTime, timeZone)}
        </p>
      </div>

      {/* The action hub — same card as everywhere, so muscle memory holds. */}
      <section className="mt-5">
        <VisitCard
          visit={toVisitCardData(visit, ctx.patientId)}
          brand={brand}
          timeZone={timeZone}
          clinicPhone={clinic?.phone ?? null}
          mapsQuery={mapsQuery}
          canModify={settings.features.reschedule}
          canJoinWaitlist={settings.features.waitlist}
          linkToDetail={false}
          minNoticeHours={settings.reschedule.minNoticeHours}
          showFace={settings.display.showTeamPhotos}
        />
      </section>

      {/* Get ready — only while the visit is ahead. Pending forms are the one
          thing that genuinely saves waiting-room time; the rest is a calm,
          universal checklist (no invented clinical instructions). */}
      {upcoming && (
        <section className="mt-6">
          <PortalSectionLabel>Get ready</PortalSectionLabel>
          <PortalCard>
            {pendingForms.length > 0 && (
              <div
                className="mb-4 rounded-2xl p-3.5"
                style={{ backgroundColor: '#FBF3E4' }}
              >
                <p className="text-[0.9rem] font-semibold" style={{ color: '#8A6116' }}>
                  {pendingForms.length === 1
                    ? '1 form to fill out before you arrive'
                    : `${pendingForms.length} forms to fill out before you arrive`}
                </p>
                <Link
                  href="/patient/intake"
                  className="mt-1 inline-block text-[0.85rem] font-semibold"
                  style={{ color: '#8A6116' }}
                >
                  Do it from the couch →
                </Link>
              </div>
            )}
            <ul className="space-y-2 text-[0.9rem]" style={{ color: PORTAL_INK }}>
              <li className="flex items-start gap-2.5">
                <span aria-hidden="true">🪪</span>
                <span>Bring a photo ID and your insurance card, if you have one.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden="true">💊</span>
                <span>Know your medications — a list on your phone works great.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span aria-hidden="true">🕐</span>
                <span>Arriving a few minutes early keeps everything relaxed.</span>
              </li>
            </ul>
          </PortalCard>
        </section>
      )}

      {/* Where to go — address + directions + a human to call. */}
      {clinic && (clinic.addressLine1 || clinic.phone) && (
        <section className="mt-6">
          <PortalSectionLabel>Where to go</PortalSectionLabel>
          <PortalCard>
            {clinic.addressLine1 && (
              <p className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
                {clinic.addressLine1}
                {clinic.city ? `, ${clinic.city}` : ''}
                {clinic.state ? `, ${clinic.state}` : ''}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.88rem]">
              {mapsQuery && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`}
                  className="font-semibold"
                  style={{ color: brand }}
                >
                  Get directions →
                </a>
              )}
              {clinic.phone && (
                <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                  Call {clinic.phone}
                </a>
              )}
            </div>
          </PortalCard>
        </section>
      )}
    </div>
  )
}
