import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  appBaseUrl,
  getClinicSiteBySlug,
  resolveSiteBasePath,
} from '@/lib/services/clinic-site'
import { getDefaultFormTemplate } from '@/lib/services/forms'
import { auth } from '@/lib/auth/server'
import { CLINIC_THEME, readableInk } from '@/lib/clinic-site-theme'
import IntakeStartForm from './intake-start-form'

interface Props {
  params: Promise<{ slug: string }>
}

export const metadata = {
  title: 'Start your intake — DreamCRM',
  // Public flow shouldn't be indexed — the page is just a sign-in/sign-up
  // gate to the patient portal's intake form.
  robots: { index: false, follow: false },
}

const { BG, INK, INK_MUTED, SURFACE, BORDER } = CLINIC_THEME

export default async function IntakeStartPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  // The intake form is only useful when the clinic actually has one set up;
  // otherwise this gate would deposit the patient on a dead page.
  const template = await getDefaultFormTemplate(data.orgId)
  if (!template) notFound()

  // Defensive subdomain redirect. If someone lands on
  // `<slug>.dreamcreatestudio.com/intake-start`, send them to the apex
  // `www.` version so better-auth's POST to `/api/auth/sign-up/email`
  // (relative URL on the same origin) hits the actual auth handler
  // rather than getting rewritten to `/site/<slug>/api/auth/...` (which
  // doesn't exist and 404s). The whole intake flow — auth, cookies,
  // patient portal — must live on a single origin for the cookie to
  // travel with the user.
  const h = await headers()
  const host = (h.get('x-forwarded-host') || h.get('host') || '')
    .split(',')[0]
    .split(':')[0]
    .toLowerCase()
  const apex = new URL(appBaseUrl()).hostname.toLowerCase()
  if (host && host !== apex && host.endsWith(apex.replace(/^www\./, ''))) {
    redirect(`${appBaseUrl()}/site/${slug}/intake-start`)
  }

  // If the user is ALREADY signed in, short-circuit straight to the
  // authenticated intake page. The patient page handles the case where
  // they're not yet a patient of THIS clinic (it redirects to "/" which
  // then routes them to their actual dashboard).
  const session = await auth.api.getSession({ headers: h })
  if (session?.user) {
    redirect('/patient/intake')
  }

  const basePath = await resolveSiteBasePath(slug)
  const profile = data.profile
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  // Contrast-safe text fill for brand-colored headings/eyebrows on the warm
  // ground (raw brand stays on backgrounds/borders/pills only).
  const headingInk = readableInk(brand)

  return (
    <div
      className="min-h-screen antialiased flex flex-col"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      {/* Minimal chrome — same intent as /intake/[formSlug]: this is a
          focused flow, not a browsable surface. Just clinic name + a way
          back to the site. */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[64px] flex items-center justify-between gap-4">
          <a href={basePath || '/'} className="flex items-center min-w-0">
            <span
              className="font-semibold text-[17px] sm:text-[19px] leading-tight truncate"
              style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              {name}
            </span>
          </a>
          <a
            href={basePath || '/'}
            className="text-sm font-medium transition hover:underline"
            style={{ color: INK_MUTED }}
          >
            ← Back to site
          </a>
        </div>
      </header>

      <main className="flex-1 py-12 sm:py-20">
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
      </main>
    </div>
  )
}
