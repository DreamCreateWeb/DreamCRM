import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { appBaseUrl, getClinicSiteBySlug, resolveSiteBasePath } from '@/lib/services/clinic-site'
import { auth } from '@/lib/auth/server'
import { readableInk } from '@/lib/clinic-site-theme'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import IntakeStartForm from '../intake-start/intake-start-form'
import { SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

interface Props {
  params: Promise<{ slug: string }>
}

export const metadata = {
  title: 'Patient portal — sign in',
  // A sign-in gate, not content — keep it out of the index.
  robots: { index: false, follow: false },
}


/**
 * Clinic-scoped PATIENT portal sign-in / sign-up. This is where a clinic's
 * public-site "Login" sends patients — NOT the platform staff sign-in (which
 * offers clinic onboarding, so a patient there could accidentally spin up a
 * whole new clinic). A returning patient signs in and lands in THIS clinic's
 * portal; a new patient creates an account at THIS clinic. The shared
 * `linkUserToClinicAsPatient` action adopts an existing clinic-created patient
 * row by email and points the session's active org at this clinic.
 */
export default async function PortalSignInPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // Defensive subdomain → apex redirect so better-auth's relative POST to
  // `/api/auth/*` hits the real handler on www (a subdomain `/portal` rewrites
  // to `/site/<slug>/portal`, and the auth call would 404). The whole auth flow
  // — sign-in, cookie, portal — must share one origin.
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || '')
    .split(',')[0]
    .split(':')[0]
    .toLowerCase()
  const apex = new URL(appBaseUrl()).hostname.toLowerCase()
  if (host && host !== apex && host.endsWith(apex.replace(/^www\./, ''))) {
    redirect(`${appBaseUrl()}/site/${slug}/portal`)
  }

  // Already signed in → straight to the portal. (A signed-in non-patient lands
  // on /patient/dashboard, which routes them to their real home.)
  const session = await auth.api.getSession({ headers: h })
  if (session?.user) {
    redirect('/patient/dashboard')
  }

  const basePath = await resolveSiteBasePath(slug)
  const profile = data.profile
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const headingInk = readableInk(brand)

  return (
    <MinimalSiteChrome clinicName={name} logoUrl={profile.logoUrl} brand={brand} homeHref={basePath || '/'}>
      <div className="py-12 sm:py-20">
        <div className="max-w-[480px] mx-auto px-5 sm:px-8">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] mb-4" style={{ color: headingInk }}>
              Patient portal
            </p>
            <h1
              className="text-[32px] sm:text-[40px] lg:text-[44px] font-semibold leading-[1.06] tracking-[-0.015em] mb-4"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Sign in to {name}.
            </h1>
            <p className="text-base leading-[1.55]" style={{ color: INK_MUTED }}>
              Sign in — or create your account — to see your upcoming visits, fill out forms, view your bills, and
              message the team, all in one place.
            </p>
          </div>

          <div
            className="rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-sm"
            style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <IntakeStartForm orgId={data.orgId} clinicName={name} brand={brand} purpose="portal" />
          </div>

          <p className="text-xs text-center mt-6" style={{ color: INK_MUTED }}>
            <a href={basePath || '/'} className="font-semibold hover:underline" style={{ color: headingInk }}>
              ← Back to {name}
            </a>
          </p>
        </div>
      </div>
    </MinimalSiteChrome>
  )
}
