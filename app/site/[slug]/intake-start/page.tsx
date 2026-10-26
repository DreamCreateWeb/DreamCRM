import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  appBaseUrl,
  getClinicSiteBySlug,
  resolveSiteBasePath,
} from '@/lib/services/clinic-site'
import { getPatientFacingDefaultForm } from '@/lib/services/forms'
import { auth } from '@/lib/auth/server'
import { intakeStartHref } from '@/lib/clinic-site-helpers'
import { readableInk } from '@/lib/clinic-site-theme'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import IntakeStartForm from './intake-start-form'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_SURFACE as SURFACE, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  // Title against the CLINIC's name like every sibling public page — the patient
  // must never see the internal product name in their browser tab.
  const name = data ? data.profile.displayName ?? data.orgName : 'Our practice'
  return {
    title: `Start your intake — ${name}`,
    // Public flow shouldn't be indexed — the page is just a sign-in/sign-up
    // gate to the patient portal's intake form.
    robots: { index: false, follow: false },
  }
}


export default async function IntakeStartPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // The intake form is only useful when the clinic actually has one set up
  // AND has opened the Intake Forms door (law 1, audit round 3); otherwise
  // this gate would deposit the patient on a dead page.
  const template = await getPatientFacingDefaultForm(data.orgId)
  if (!template) notFound()

  // Defensive host redirect. If someone lands on this gate on ANY host where
  // the site is served at the root — `<slug>.dreamcreatestudio.com` OR a
  // clinic's custom domain (tedpinneydds.com) — send them to the apex `www.`
  // version so better-auth's POST to `/api/auth/sign-up/email` (relative
  // URL on the same origin) hits the actual auth handler rather than
  // getting rewritten to `/site/<slug>/api/auth/...` (which doesn't exist
  // and 404s). The whole intake flow — auth, cookies, patient portal — must
  // live on a single origin for the cookie to travel with the user. The
  // first cut matched only hosts ENDING in the platform domain, so a custom
  // domain rendered the gate in place and its submit 404'd.
  const basePath = await resolveSiteBasePath(slug)
  if (basePath === '') {
    redirect(intakeStartHref(slug))
  }

  // If the user is ALREADY signed in, short-circuit straight to the
  // authenticated intake page. The patient page handles the case where
  // they're not yet a patient of THIS clinic (it redirects to "/" which
  // then routes them to their actual dashboard). Absolute, for the same
  // one-origin reason: `/patient/*` only exists on www.
  const h = await headers()
  const session = await auth.api.getSession({ headers: h })
  if (session?.user) {
    redirect(`${appBaseUrl()}/patient/intake`)
  }

  const profile = data.profile
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)

  return (
    <MinimalSiteChrome
      clinicName={name}
      logoUrl={profile.logoUrl}
      brand={brand}
      homeHref={basePath || '/'}
    >
      <div className="py-12 sm:py-20">
        <div className="max-w-[480px] mx-auto px-5 sm:px-8">
          <div className="text-center mb-8">
            <p
              className="text-xs font-semibold uppercase tracking-[0.22em] mb-4"
              style={{ color: headingInk }}
            >
              Patient intake
            </p>
            <h1
              className="text-[32px] sm:text-[40px] lg:text-[44px] font-semibold leading-[1.06] tracking-[-0.015em] mb-4"
              style={{ color: headingInk, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Save your intake to your account.
            </h1>
            <p className="text-base leading-[1.55]" style={{ color: INK_MUTED }}>
              Sign in or create an account with {name} to fill out the new-patient
              form. Your answers stay in your portal so you can review them later.
            </p>
          </div>

          <div
            className="rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-sm"
            style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <IntakeStartForm orgId={data.orgId} clinicName={name} brand={brand} />
          </div>

          <p className="text-xs text-center mt-6" style={{ color: INK_MUTED }}>
            Prefer to fill it out without an account?{' '}
            <a
              href={`${basePath}/intake/${template.slug}`}
              className="font-semibold hover:underline"
              style={{ color: INK }}
            >
              Use the public form
            </a>
            .
          </p>
        </div>
      </div>
    </MinimalSiteChrome>
  )
}
