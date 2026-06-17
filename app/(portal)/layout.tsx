import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  getPortalClinicInfo,
  getMyPatientRecord,
  getMyDependents,
} from '@/lib/services/patient-portal'
import { getShopConfig } from '@/lib/services/shop'
import { buildPortalNav } from '@/components/patient-portal/nav'
import {
  PortalDesktopNav,
  PortalTabBar,
  PortalAnnouncement,
} from '@/components/patient-portal/portal-chrome'
import { todaysHoursLabel } from '@/lib/clinic-site-helpers'
import DemoBanner from '@/components/ui/demo-banner'

/**
 * Patient-portal chrome — the clinic-branded replacement for the Mosaic
 * admin shell. Per the portal research: patients should feel they're inside
 * their CLINIC's brand (warm neutrals, the clinic's accent color + logo,
 * serif display type), not inside dental software. Same palette + Fraunces
 * pattern as the public clinic site.
 *
 * Mobile gets a bottom tab bar (one-thumb reach); desktop a slim header nav.
 * Navigation derives from the clinic's portal settings — features toggled
 * off in Settings → Patient portal never render here.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant()
  // A user can wear several hats (one email = one user). If they land here but
  // their ACTIVE tenancy isn't patient — e.g. a clinic staffer who is also a
  // patient at another clinic, with their active org pointed at the clinic they
  // work at — don't bounce them to `/`. Look for a patient-role membership in
  // another org and switch their active org to it so the portal resolves, then
  // re-render. (Same active-org-switch pattern used on sign-in + invite accept.)
  // Only redirect home when they genuinely have no patient membership anywhere.
  if (ctx.tenantType !== 'patient') {
    const patientMembership = await findPatientMembershipForUser(ctx.userId, ctx.organizationId)
    if (!patientMembership) redirect('/')
    await switchActiveOrg(patientMembership.organizationId)
    redirect('/patient/dashboard')
  }

  const clinic = await getPortalClinicInfo(ctx.organizationId)
  const brand = clinic?.brandColor ?? '#9CAF9F'
  const clinicName = clinic?.displayName ?? ctx.organizationName

  // A patient member whose patient row was never linked can't load any
  // portal data. Render a soft help screen (redirecting to `/` would loop —
  // `/` sends patients right back here).
  if (!ctx.patientId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-3" style={{ color: '#1C1A17' }}>
            Almost there
          </h1>
          <p className="text-[0.95rem] leading-relaxed" style={{ color: '#6B635A' }}>
            Your account isn&apos;t linked to a patient record yet. Give {clinicName} a
            quick call{clinic?.phone ? ' at ' : ''}
            {clinic?.phone && (
              <a href={`tel:${clinic.phone}`} className="font-semibold" style={{ color: brand }}>
                {clinic.phone}
              </a>
            )}{' '}
            and they&apos;ll have you set up in a minute.
          </p>
        </div>
      </div>
    )
  }

  const [settings, me, dependents, shopConfig] = await Promise.all([
    getPortalSettings(ctx.organizationId),
    getMyPatientRecord(ctx.patientId, ctx.organizationId),
    getMyDependents(ctx.patientId, ctx.organizationId),
    getShopConfig(ctx.organizationId),
  ])

  const nav = buildPortalNav({
    settings,
    hasShop: shopConfig.storefrontEnabled,
    hasDependents: dependents.length > 0,
  })

  // Master self-scheduling switch (Settings → Practice): off → the booking CTA
  // becomes a request CTA (the /patient/book page renders the request form).
  const portalBookLabel = clinic?.selfBookingEnabled === false ? 'Request a visit' : 'Book a visit'

  const todayHours = clinic?.hours
    ? todaysHoursLabel(clinic.hours as Record<string, { open?: string; close?: string; closed?: boolean }>)
    : null

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; }`}</style>

      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: '#FAF7F2', color: '#1C1A17' }}
      >
        <DemoBanner ctx={ctx} />
        {settings.copy.announcement && (
          <PortalAnnouncement text={settings.copy.announcement} brand={brand} />
        )}

        <header
          className="sticky top-0 z-20 bg-[#FAF7F2]/90 backdrop-blur"
          style={{ borderBottom: '1px solid #E8E2D9' }}
        >
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/patient/dashboard" className="flex min-w-0 items-center gap-2.5">
              {clinic?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clinic.logoUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                  style={{ backgroundColor: brand, fontFamily: 'var(--font-display)' }}
                >
                  {clinicName.charAt(0)}
                </span>
              )}
              <span className="truncate text-[1.02rem] font-semibold tracking-tight">
                {clinicName}
              </span>
            </Link>

            <PortalDesktopNav items={[...nav.primary, ...nav.more]} brand={brand} />

            <div className="flex shrink-0 items-center gap-2">
              {clinic?.phone && (
                <a
                  href={`tel:${clinic.phone}`}
                  className="hidden sm:flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.85rem] font-semibold"
                  style={{ border: '1px solid #E8E2D9', color: '#1C1A17', backgroundColor: '#FFFFFF' }}
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                    <path d="M3.6 1.7c.4-.4 1-.5 1.5-.2l1.9 1.2c.5.4.8 1 .6 1.6l-.4 1.4c-.1.4 0 .8.3 1.1l1.7 1.7c.3.3.7.4 1.1.3l1.4-.4c.6-.2 1.2.1 1.6.6l1.2 1.9c.3.5.2 1.1-.2 1.5l-1 1c-.6.6-1.5.8-2.3.5-1.9-.7-3.7-1.8-5.2-3.3S3.1 9.3 2.4 7.4c-.3-.8-.1-1.7.5-2.3l.7-3.4Z" />
                  </svg>
                  Call us
                </a>
              )}
              {settings.features.booking && (
                <Link
                  href="/patient/book"
                  className="rounded-full px-4 py-2 text-[0.85rem] font-semibold text-white"
                  style={{ backgroundColor: brand }}
                >
                  {portalBookLabel}
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-16">
          {children}
        </main>

        <footer className="hidden md:block" style={{ borderTop: '1px solid #E8E2D9' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-6 px-6 py-8 text-[0.85rem]" style={{ color: '#6B635A' }}>
            <div>
              <p className="font-semibold" style={{ color: '#1C1A17' }}>{clinicName}</p>
              {clinic?.addressLine1 && (
                <p className="mt-1">
                  {clinic.addressLine1}
                  {clinic.city ? `, ${clinic.city}` : ''}
                  {clinic.state ? `, ${clinic.state}` : ''} {clinic.postalCode ?? ''}
                </p>
              )}
              {todayHours && <p className="mt-1">{todayHours}</p>}
            </div>
            <div className="text-right">
              {clinic?.phone && (
                <a href={`tel:${clinic.phone}`} className="block font-semibold" style={{ color: '#1C1A17' }}>
                  {clinic.phone}
                </a>
              )}
              {clinic?.email && (
                <a href={`mailto:${clinic.email}`} className="mt-1 block hover:underline">
                  {clinic.email}
                </a>
              )}
              <p className="mt-3 text-[0.75rem] opacity-70">
                Powered by DreamCreate
              </p>
            </div>
          </div>
        </footer>

        <PortalTabBar primary={nav.primary} more={nav.more} brand={brand} />
      </div>
    </>
  )
}

/**
 * Find a patient-role membership for this user in an org OTHER than the one they
 * have active (so a clinic staffer who is also a patient can be routed into the
 * portal). Returns the membership's org, or null if they're a patient nowhere.
 */
async function findPatientMembershipForUser(
  userId: string,
  activeOrgId: string,
): Promise<{ organizationId: string } | null> {
  const memberships = await db
    .select({ organizationId: schema.member.organizationId, role: schema.member.role })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
  const patientMemberships = memberships.filter((m) => m.role === 'patient')
  if (patientMemberships.length === 0) return null
  // Prefer one that isn't the (non-patient) active org; else just the first.
  const preferred = patientMemberships.find((m) => m.organizationId !== activeOrgId) ?? patientMemberships[0]
  return { organizationId: preferred.organizationId }
}

/** Point the current session at `orgId` so getTenantContext resolves the portal
 *  tenant on the next request. No-op if there's no session. */
async function switchActiveOrg(orgId: string): Promise<void> {
  const sess = await auth.api.getSession({ headers: await headers() })
  if (!sess?.session) return
  await db
    .update(schema.session)
    .set({ activeOrganizationId: orgId })
    .where(and(eq(schema.session.id, sess.session.id)))
}
