export const metadata = {
  title: 'Home — Patient portal',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  getMyPatientRecord,
  getUpcomingVisits,
  getPastVisits,
  getMyRecallStatus,
  getMyPendingForms,
} from '@/lib/services/patient-portal'
import { getPortalPageContext, toVisitCardData, mapsQueryFor } from '../portal-data'
import { countReferrals } from '@/lib/services/patient-referrals'
import { getLoyaltySettings, getPointsBalance } from '@/lib/services/loyalty'
import VisitCard from '@/components/patient-portal/visit-card'
import ReferCard from '@/components/patient-portal/refer-card'
import LoyaltyCard from '@/components/patient-portal/loyalty-card'
import { PortalIcon } from '@/components/patient-portal/portal-chrome'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PortalEmptyState,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { greetingFor } from '@/components/patient-portal/format'
import { todaysHoursLabel } from '@/lib/clinic-site-helpers'
import type { PortalIconName } from '@/components/patient-portal/nav'

const WEEK_MS = 7 * 86_400_000

export default async function PortalHome() {
  const pc = await getPortalPageContext()
  const { ctx, settings, clinic, brand, timeZone, selfBookingEnabled } = pc
  // When self-scheduling is off, every "book" affordance becomes "request".
  const bookLabel = selfBookingEnabled ? 'Book a visit' : 'Request a visit'
  const bookSub = selfBookingEnabled ? 'See real openings' : 'We’ll find you a time'

  const [me, upcoming, past, recall, pendingForms, referredCount, loyalty] = await Promise.all([
    getMyPatientRecord(ctx.patientId, ctx.organizationId),
    getUpcomingVisits(pc.allowedPatientIds, ctx.organizationId),
    getPastVisits([ctx.patientId], ctx.organizationId),
    getMyRecallStatus(ctx.patientId, ctx.organizationId),
    settings.features.forms ? getMyPendingForms(ctx.patientId, ctx.organizationId) : Promise.resolve([]),
    countReferrals(ctx.organizationId, ctx.patientId),
    getLoyaltySettings(ctx.organizationId),
  ])
  const loyaltyBalance = loyalty.enabled
    ? await getPointsBalance(ctx.organizationId, ctx.patientId)
    : 0

  const firstName = me?.firstName ?? null
  const headline = settings.copy.welcomeHeadline
    ? settings.copy.welcomeHeadline.replaceAll('{firstName}', firstName ?? 'there')
    : greetingFor(firstName, timeZone)

  const nextVisit = upcoming[0] ?? null
  const laterVisits = upcoming.slice(1, 3)
  const mapsQuery = mapsQueryFor(clinic)

  // Pre-visit task: the default intake form, when one is pending and a visit
  // is on the books.
  const pendingDefaultForm = pendingForms.find((f) => f.isDefault) ?? null
  const showFormTask = Boolean(pendingDefaultForm && nextVisit)

  // Recall nudge — only when nothing is booked (a booked visit IS the recall).
  const showRecallNudge = settings.features.booking && upcoming.length === 0 && (recall === 'due' || recall === 'overdue')

  // Aftercare note for ~a week after the most recent completed visit.
  const recentCompleted = past.find(
    (v) => v.status === 'completed' && Date.now() - v.startTime.getTime() < WEEK_MS,
  )
  const showAftercare = Boolean(settings.copy.aftercareNote && recentCompleted)

  const verbs: Array<{ href: string; label: string; sub: string; icon: PortalIconName; show: boolean }> = [
    { href: '/patient/book', label: bookLabel, sub: bookSub, icon: 'calendar', show: settings.features.booking },
    { href: '/patient/messages', label: 'Message us', sub: 'Reach the front desk', icon: 'chat', show: settings.features.messages },
    { href: '/patient/invoices', label: 'Billing', sub: 'Balance & history', icon: 'card', show: settings.features.billing },
  ]
  const shownVerbs = verbs.filter((v) => v.show)

  return (
    <div className="mx-auto max-w-2xl">
      <PortalHeading color={brand}>{headline}</PortalHeading>
      <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
        {settings.copy.welcomeMessage ?? `Welcome to your ${clinic?.displayName ?? ctx.organizationName} portal.`}
      </p>

      {showFormTask && pendingDefaultForm && (
        <Link
          href="/patient/intake"
          className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5"
          style={{ backgroundColor: '#FBF3E4', border: '1px solid #EBDCB8' }}
        >
          <PortalIcon name="doc" className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[0.9rem] font-medium" style={{ color: '#8A6116' }}>
            A few questions before your visit — it takes about 5 minutes and saves you the clipboard.
          </span>
          <span className="text-[0.85rem] font-bold" style={{ color: '#8A6116' }}>
            →
          </span>
        </Link>
      )}

      <section className="mt-6">
        <PortalSectionLabel>Your next visit</PortalSectionLabel>
        {nextVisit ? (
          <VisitCard
            visit={toVisitCardData(nextVisit, ctx.patientId)}
            brand={brand}
            timeZone={timeZone}
            clinicPhone={clinic?.phone ?? null}
            mapsQuery={mapsQuery}
            canModify={settings.features.reschedule}
            minNoticeHours={settings.reschedule.minNoticeHours}
            showFace={settings.display.showTeamPhotos}
          />
        ) : showRecallNudge ? (
          <PortalCard accent={brand}>
            <p className="text-[1.05rem] font-semibold" style={{ color: PORTAL_INK }}>
              {recall === 'overdue' ? 'It’s been a while — time for your next cleaning' : 'Time for your next cleaning'}
            </p>
            <p className="mt-1 text-[0.9rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
              {selfBookingEnabled
                ? 'However long it’s been, you’re welcome here. Pick a time that works — most weeks have openings.'
                : 'However long it’s been, you’re welcome here. Send us a request and we’ll find you a time.'}
            </p>
            <Link
              href="/patient/book"
              className="mt-4 inline-block rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              {bookLabel}
            </Link>
          </PortalCard>
        ) : (
          <PortalCard>
            <PortalEmptyState
              title="No upcoming visits"
              body="When you have a visit booked, it’ll live here with everything you need."
              ctaHref={settings.features.booking ? '/patient/book' : undefined}
              ctaLabel={settings.features.booking ? bookLabel : undefined}
              brand={brand}
            />
          </PortalCard>
        )}

        {laterVisits.length > 0 && (
          <div className="mt-3 space-y-3">
            {laterVisits.map((v) => (
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
        {upcoming.length > 3 && (
          <Link href="/patient/appointments" className="mt-3 inline-block text-[0.88rem] font-semibold" style={{ color: brand }}>
            See all visits →
          </Link>
        )}
      </section>

      {showAftercare && (
        <section className="mt-7">
          <PortalSectionLabel>After your visit</PortalSectionLabel>
          <PortalCard>
            <p className="whitespace-pre-line text-[0.92rem] leading-relaxed" style={{ color: PORTAL_INK }}>
              {settings.copy.aftercareNote}
            </p>
            {clinic?.phone && (
              <p className="mt-3 text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
                Anything feel off? Call us at{' '}
                <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                  {clinic.phone}
                </a>
                {' '}— that’s what we’re here for.
              </p>
            )}
          </PortalCard>
        </section>
      )}

      {shownVerbs.length > 0 && (
        <section className="mt-7">
          <div className={`grid gap-3 ${shownVerbs.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {shownVerbs.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                className="group rounded-2xl bg-white p-4"
                style={{ border: `1px solid ${PORTAL_BORDER}` }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#FAF7F2', color: brand }}
                >
                  <PortalIcon name={v.icon} className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
                  {v.label}
                </p>
                <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>
                  {v.sub}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loyalty.enabled && (
        <section className="mt-7">
          <PortalSectionLabel>Rewards</PortalSectionLabel>
          <LoyaltyCard
            brand={brand}
            balance={loyaltyBalance}
            redeemPoints={loyalty.redeemPoints}
            redeemValueCents={loyalty.redeemValueCents}
            shopHref={settings.features.shopLink ? '/patient/shop' : null}
          />
        </section>
      )}

      <section className="mt-7">
        <PortalSectionLabel>Share the love</PortalSectionLabel>
        <ReferCard
          brand={brand}
          clinicName={clinic?.displayName ?? ctx.organizationName}
          referredCount={referredCount}
        />
      </section>

      <section className="mt-7 md:hidden">
        <PortalCard>
          <p className="font-semibold" style={{ color: PORTAL_INK }}>
            {clinic?.displayName ?? ctx.organizationName}
          </p>
          {clinic?.hours && (
            <p className="mt-1 text-[0.85rem]" style={{ color: PORTAL_MUTED }}>
              {todaysHoursLabel(clinic.hours as Record<string, { open?: string; close?: string; closed?: boolean }>, timeZone)}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {clinic?.phone && (
              <a
                href={`tel:${clinic.phone}`}
                className="rounded-full px-4 py-2 text-[0.82rem] font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                Call {clinic.phone}
              </a>
            )}
            {mapsQuery && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-white px-4 py-2 text-[0.82rem] font-semibold"
                style={{ border: `1px solid ${PORTAL_BORDER}`, color: PORTAL_INK }}
              >
                Directions
              </a>
            )}
          </div>
        </PortalCard>
      </section>
    </div>
  )
}
