import type { SiteChromeMobileProps } from '@/lib/site-templates/page-props'
import { SITE_BORDER, SITE_INK, SITE_SURFACE } from '@/components/clinic-site/tokens'

/**
 * Pediatric sticky mobile booking bar — a rounded floating pill pair (Call +
 * Book) hovering above the bottom edge, in keeping with the bouncy register.
 * Hidden at `sm` and up (the header CTA takes over).
 */
export default function PediatricMobileActions({
  data,
  bookHref,
  bookLabel,
}: SiteChromeMobileProps) {
  const phone = data.profile.phone ?? null
  return (
    <div className="sm:hidden fixed inset-x-0 bottom-3 z-40 flex justify-center gap-2 px-4 pointer-events-none">
      {phone && (
        <a
          href={`tel:${phone}`}
          className="pointer-events-auto inline-flex items-center justify-center rounded-full w-12 h-12 text-lg shadow-lg"
          style={{ background: SITE_SURFACE, border: `2px solid ${SITE_BORDER}`, color: SITE_INK }}
          aria-label={`Call ${phone}`}
        >
          📞
        </a>
      )}
      <a
        href={bookHref}
        className="pointer-events-auto inline-flex items-center justify-center gap-1.5 rounded-full px-6 h-12 text-sm font-bold shadow-lg"
        style={{ background: 'var(--c-brand-strong, #36514c)', color: 'var(--c-brand-ink, #FFFFFF)' }}
      >
        🗓️ {bookLabel}
      </a>
    </div>
  )
}
