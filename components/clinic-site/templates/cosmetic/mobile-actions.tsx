import type { SiteChromeMobileProps } from '@/lib/site-templates/page-props'
import { SITE_BG, SITE_BORDER, SITE_DEEP, SITE_DEEP_INK, SITE_INK } from '@/components/clinic-site/tokens'

/**
 * Cosmetic/Luxury sticky mobile booking bar (DESIGN.md shared invariant: a
 * one-tap Book affordance always within thumb reach on phones). A slim cream
 * bar with a hairline top rule — quieter than the modern floating pills, in
 * keeping with the editorial register. Hidden at `sm` and up (the header CTA
 * is visible there).
 */
export default function CosmeticMobileActions({
  data,
  bookHref,
  bookLabel,
}: SiteChromeMobileProps) {
  const phone = data.profile.phone ?? null
  return (
    <div
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-2 px-3 py-2.5"
      style={{ background: SITE_BG, borderTop: `1px solid ${SITE_BORDER}` }}
    >
      {phone && (
        <a
          href={`tel:${phone}`}
          className="inline-flex items-center justify-center rounded-full px-4 text-sm font-medium"
          style={{ border: `1px solid ${SITE_BORDER}`, color: SITE_INK }}
          aria-label={`Call ${phone}`}
        >
          Call
        </a>
      )}
      <a
        href={bookHref}
        className="flex-1 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-semibold"
        style={{ background: SITE_DEEP, color: SITE_DEEP_INK }}
      >
        {bookLabel}
      </a>
    </div>
  )
}
