'use client'

import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'
import { useClinicNotFound } from '@/components/clinic-site/clinic-not-found-context'
import { SITE_INK as INK, SITE_INK_MUTED as INK_MUTED, SITE_BORDER as BORDER } from '@/components/clinic-site/tokens'

/**
 * Clinic-site 404, two honest cases:
 *
 *  - The clinic RESOLVED and the page did not (a mistyped /servces, a retired
 *    blog post): the site layout supplies the clinic through
 *    ClinicNotFoundProvider, and the visitor gets that clinic's own header,
 *    "Back to <clinic> home", its phone and the booking door.
 *  - The slug resolves to nothing (no provider): the neutral "Clinic not
 *    found", with no clinic to link back to.
 *
 * Either way it renders under a 404 status and Next marks it noindex.
 */
export default function ClinicNotFound() {
  const clinic = useClinicNotFound()

  if (!clinic) {
    return (
      <MinimalSiteChrome homeHref={null}>
        <div className="flex items-center justify-center px-4 py-24 sm:py-32">
          <div className="text-center max-w-md">
            <p className="text-5xl mb-6" aria-hidden="true">
              🦷
            </p>
            <h1
              className="text-3xl sm:text-4xl font-semibold mb-3 tracking-tight"
              style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
            >
              Clinic not found
            </h1>
            <p className="text-[15px] leading-relaxed" style={{ color: INK_MUTED }}>
              This clinic website doesn&rsquo;t exist, or the link may have changed.
            </p>
          </div>
        </div>
      </MinimalSiteChrome>
    )
  }

  const doorClass = 'inline-flex items-center justify-center min-h-11 px-5 py-2.5 rounded-full text-sm font-semibold'
  return (
    <MinimalSiteChrome clinicName={clinic.name} logoUrl={clinic.logoUrl} brand={clinic.brand} homeHref={clinic.homeHref}>
      <div className="flex items-center justify-center px-4 py-24 sm:py-32">
        <div className="text-center max-w-md">
          <h1
            className="text-3xl sm:text-4xl font-semibold mb-3 tracking-tight"
            style={{ color: 'var(--c-heading, var(--c-ink, #1C1A17))', fontFamily: 'var(--font-display, Georgia, serif)' }}
          >
            We couldn&rsquo;t find that page
          </h1>
          <p className="text-[15px] leading-relaxed mb-8" style={{ color: INK_MUTED }}>
            The link may have changed. Here&rsquo;s the way back to {clinic.name}.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={clinic.homeHref}
              className={doorClass}
              style={{ background: 'var(--c-brand-strong, #36514c)', color: 'var(--c-brand-ink, #FFFFFF)' }}
            >
              Back to {clinic.name} home
            </a>
            <a href={clinic.bookHref} className={doorClass} style={{ border: `1px solid ${BORDER}`, color: INK }}>
              Book a visit
            </a>
            {clinic.phone && (
              <a href={`tel:${clinic.phone}`} className={doorClass} style={{ border: `1px solid ${BORDER}`, color: INK }}>
                Call {clinic.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    </MinimalSiteChrome>
  )
}
