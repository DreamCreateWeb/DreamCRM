import type { SiteChromeMobileProps } from '@/lib/site-templates/page-props'
import { SITE_DEEP, SITE_DEEP_INK } from '@/components/clinic-site/tokens'

/**
 * Hometown sticky mobile bar — the classic full-width two-button strip
 * (Call | Book) pinned to the bottom edge. Squared and solid, in keeping
 * with the straightforward register. Hidden at `sm` and up.
 */
export default function HometownMobileActions({
  data,
  bookHref,
  bookLabel,
}: SiteChromeMobileProps) {
  const phone = data.profile.phone ?? null
  return (
    <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="flex items-center justify-center gap-2 h-13 py-3.5 text-sm font-bold"
          style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
          aria-label={`Call ${phone}`}
        >
          Call us
        </a>
      ) : (
        <span aria-hidden="true" style={{ background: SITE_DEEP }} />
      )}
      <a
        href={bookHref}
        className="flex items-center justify-center gap-2 h-13 py-3.5 text-sm font-bold"
        style={{ background: 'var(--c-strip, #E8A33D)', color: 'var(--c-strip-ink, #27303B)' }}
      >
        {bookLabel}
      </a>
    </div>
  )
}
