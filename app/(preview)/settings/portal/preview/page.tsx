export const metadata = {
  title: 'Portal preview - DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import { getPortalClinicInfo } from '@/lib/services/patient-portal'
import { buildPortalNav } from '@/components/patient-portal/nav'
import { PortalIcon } from '@/components/patient-portal/portal-chrome'
import {
  PortalCard,
  PortalHeading,
  PortalSectionLabel,
  PORTAL_INK,
  PORTAL_MUTED,
  PORTAL_BORDER,
} from '@/components/patient-portal/ui'
import { fmtVisitDayTime, greetingFor } from '@/components/patient-portal/format'
import { CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import type { ClinicStaff } from '@/lib/types/clinic-content'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq } from 'drizzle-orm'

/**
 * "Preview as a patient" — a static, watermarked replica of the portal
 * home rendered with the clinic's REAL saved settings + branding and a
 * sample patient. No competitor ships this; it makes the toggle page
 * trustworthy ("save, preview, done"). Buttons here are intentionally
 * inert — it's a look, not a login.
 */
export default async function PortalPreviewPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  const [settings, clinic, [profileRow]] = await Promise.all([
    getPortalSettings(ctx.organizationId),
    getPortalClinicInfo(ctx.organizationId),
    db
      .select({ staff: clinicProfile.staff })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1),
  ])

  const brand = clinic?.brandColor ?? '#9CAF9F'
  const clinicName = clinic?.displayName ?? ctx.organizationName
  const timeZone = clinic?.timezone?.trim() || CLINIC_DEFAULT_TZ
  const staff = (profileRow?.staff ?? []) as ClinicStaff[]
  const sampleProvider = staff[0] ?? null

  const nav = buildPortalNav({ settings, hasShop: settings.features.shopLink, hasDependents: false })
  const sampleVisitTime = new Date(Date.now() + 26 * 3_600_000) // tomorrow-ish

  const headline = settings.copy.welcomeHeadline
    ? settings.copy.welcomeHeadline.replaceAll('{firstName}', 'Sam')
    : greetingFor('Sam', timeZone)

  const verbs = [
    { label: 'Book a visit', sub: 'See real openings', icon: 'calendar' as const, show: settings.features.booking },
    { label: 'Message us', sub: 'Reach the front desk', icon: 'chat' as const, show: settings.features.messages },
    { label: 'Billing', sub: 'Balance & history', icon: 'card' as const, show: settings.features.billing },
  ].filter((v) => v.show)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF7F2', color: PORTAL_INK }}>
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-gray-900 px-4 py-2.5 text-white">
        <p className="text-sm font-medium">
          Preview — this is what a patient named <span className="font-bold">Sam</span> would see,
          with your saved settings. Sample data; buttons are disabled.
        </p>
        <Link
          href="/settings/portal"
          className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25"
        >
          ← Back to settings
        </Link>
      </div>

      {settings.copy.announcement && (
        <div className="px-4 py-2.5 text-center text-[0.85rem] font-medium text-white" style={{ backgroundColor: brand }}>
          {settings.copy.announcement}
        </div>
      )}

      <header className="bg-[#FAF7F2]/90" style={{ borderBottom: `1px solid ${PORTAL_BORDER}` }}>
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {clinic?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinic.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            ) : (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                style={{ backgroundColor: brand, fontFamily: 'var(--font-display)' }}
              >
                {clinicName.charAt(0)}
              </span>
            )}
            <span className="truncate text-[1.02rem] font-semibold tracking-tight">{clinicName}</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {[...nav.primary, ...nav.more].map((item, i) => (
              <span
                key={item.href}
                className="rounded-full px-3.5 py-2 text-[0.92rem] font-medium"
                style={i === 0 ? { backgroundColor: brand, color: '#fff' } : { color: PORTAL_MUTED }}
              >
                {item.label}
              </span>
            ))}
          </nav>
          {settings.features.booking && (
            <span className="rounded-full px-4 py-2 text-[0.85rem] font-semibold text-white" style={{ backgroundColor: brand }}>
              Book a visit
            </span>
          )}
        </div>
      </header>

      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; }`}</style>

      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <PortalHeading color={brand}>{headline}</PortalHeading>
        <p className="mt-1.5 text-[0.95rem]" style={{ color: PORTAL_MUTED }}>
          {settings.copy.welcomeMessage ?? `Welcome to your ${clinicName} portal.`}
        </p>

        {settings.features.forms && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ backgroundColor: '#FBF3E4', border: '1px solid #EBDCB8' }}>
            <PortalIcon name="doc" className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-[0.9rem] font-medium" style={{ color: '#8A6116' }}>
              A few questions before your visit — it takes about 5 minutes and saves you the clipboard.
            </span>
            <span className="text-[0.85rem] font-bold" style={{ color: '#8A6116' }}>→</span>
          </div>
        )}

        <section className="mt-6">
          <PortalSectionLabel>Your next visit</PortalSectionLabel>
          <div
            className="rounded-2xl bg-white p-5"
            style={{ border: `1px solid ${PORTAL_BORDER}`, borderLeft: `4px solid ${brand}`, boxShadow: '0 1px 2px rgba(28,26,23,0.04)' }}
          >
            <div className="flex items-start gap-3.5">
              {settings.display.showTeamPhotos &&
                (sampleProvider?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sampleProvider.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[0.95rem] font-semibold text-white"
                    style={{ backgroundColor: brand, fontFamily: 'var(--font-display)' }}
                  >
                    {(sampleProvider?.name ?? 'Dr Q').replace(/^Dr\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
                  </span>
                ))}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[1.05rem] font-semibold leading-snug">
                    Cleaning
                    {sampleProvider && (
                      <span className="font-normal" style={{ color: PORTAL_MUTED }}>
                        {' '}with {sampleProvider.name}
                      </span>
                    )}
                  </p>
                  <span className="rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold" style={{ backgroundColor: '#FBF3E4', color: '#8A6116' }}>
                    Needs confirming
                  </span>
                </div>
                <p className="mt-1 text-[0.92rem]" style={{ color: PORTAL_MUTED }}>
                  {fmtVisitDayTime(sampleVisitTime, timeZone)}
                  <span className="ml-2 rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide" style={{ backgroundColor: '#FAF7F2', color: brand }}>
                    Tomorrow
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full px-3.5 py-2 text-[0.8rem] font-semibold text-white" style={{ backgroundColor: brand }}>
                Confirm visit
              </span>
              <span className="rounded-full bg-white px-3.5 py-2 text-[0.8rem] font-semibold" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
                Add to calendar
              </span>
              {settings.features.reschedule && (
                <>
                  <span className="rounded-full bg-white px-3.5 py-2 text-[0.8rem] font-semibold" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
                    Reschedule
                  </span>
                  <span className="rounded-full bg-white px-3.5 py-2 text-[0.8rem] font-semibold" style={{ border: '1px solid #E8C8C0', color: '#9B4434' }}>
                    Cancel
                  </span>
                </>
              )}
            </div>
          </div>
        </section>

        {settings.copy.aftercareNote && (
          <section className="mt-7">
            <PortalSectionLabel>After your visit</PortalSectionLabel>
            <PortalCard>
              <p className="whitespace-pre-line text-[0.92rem] leading-relaxed">{settings.copy.aftercareNote}</p>
            </PortalCard>
          </section>
        )}

        {verbs.length > 0 && (
          <section className="mt-7">
            <div className={`grid gap-3 ${verbs.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {verbs.map((v) => (
                <div key={v.label} className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${PORTAL_BORDER}` }}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: '#FAF7F2', color: brand }}>
                    <PortalIcon name={v.icon} className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-[0.95rem] font-semibold">{v.label}</p>
                  <p className="text-[0.8rem]" style={{ color: PORTAL_MUTED }}>{v.sub}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
