import type { SiteChromeMobileProps } from '@/lib/site-templates/page-props'
import { SITE_SURFACE, SITE_INK, SITE_BORDER } from '@/components/clinic-site/tokens'

/**
 * Established mobile actions — a bottom-RIGHT stack (a round Call button
 * and the accent Book pill), the same corner the modern template uses, so
 * the site chat widget's bottom-left pill never lands on top of it. Hidden
 * at `sm` and up.
 */
export default function EstablishedMobileActions({ data, bookHref, bookLabel }: SiteChromeMobileProps) {
  const phone = data.profile.phone ?? null
  return (
    <div className="sm:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2">
      {phone && (
        <a
          href={`tel:${phone}`}
          className="inline-flex items-center justify-center w-12 h-12 rounded-full shadow-md"
          style={{ background: SITE_SURFACE, border: `1.5px solid ${SITE_BORDER}`, color: SITE_INK }}
          aria-label={`Call ${phone}`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
          </svg>
        </a>
      )}
      <a
        href={bookHref}
        className="inline-flex items-center justify-center rounded-full px-6 h-12 text-sm font-bold shadow-md"
        style={{ background: 'var(--c-brand-strong, #B5121B)', color: 'var(--c-brand-ink, #FFFFFF)' }}
      >
        {bookLabel}
      </a>
    </div>
  )
}
