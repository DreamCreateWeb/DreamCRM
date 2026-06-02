import type { ClinicSiteData } from '@/lib/services/clinic-site'

interface Props {
  data: ClinicSiteData
  basePath: string
  bookHref: string
  bookLabel: string
  /** Legacy prop kept for back-compat with existing call sites. The Login
   *  pill no longer lives here — patient login is reachable from the
   *  chartreuse top strip of the site header instead. */
  signInUrl?: string
}

/**
 * Floating action widgets pinned to the bottom-right corner of the
 * viewport. Replaces the prior full-width sticky bottom bar — much less
 * intrusive while preserving one-tap access to Book + Call.
 *
 * Two stacked widgets:
 *   - top:    Phone circle (warm tan, icon-only)
 *   - bottom: Book pill (brand color, calendar icon + label)
 *
 * Wrapper uses `pointer-events: none` so the empty space between widgets
 * doesn't trap clicks meant for underlying content. Each widget re-enables
 * pointer events on itself.
 *
 * No layout spacer needed (the prior sticky bar reserved a horizontal
 * strip and required one to keep the footer reachable; the floating
 * widgets just sit in the corner).
 */
export default function SiteMobileActions({
  data,
  basePath: _basePath,
  bookHref,
  bookLabel,
  signInUrl: _signInUrl,
}: Props) {
  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'

  // Warm tan/peach — reads as "tap to call" without competing with the
  // brand-colored Book CTA. Hardcoded (not theme-driven) because it works
  // against every clinic brand color and grounds the corner stack.
  const phoneCta = '#bc8452'

  return (
    <div
      className="floating-cta-stack fixed z-30 flex flex-col items-end gap-3 pointer-events-none"
      style={{
        right: 'max(env(safe-area-inset-right), 16px)',
        bottom: 'max(env(safe-area-inset-bottom), 16px)',
      }}
    >
      {profile.phone && (
        <a
          href={`tel:${profile.phone}`}
          aria-label={`Call ${name}`}
          className="pointer-events-auto inline-flex items-center justify-center w-12 h-12 sm:w-13 sm:h-13 rounded-full text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/80"
          style={{ backgroundColor: phoneCta }}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
            />
          </svg>
        </a>
      )}
      <a
        href={bookHref}
        className="pointer-events-auto inline-flex items-center gap-2 px-5 sm:px-6 py-3 sm:py-3.5 rounded-full text-sm sm:text-base font-semibold text-white shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/80"
        style={{ backgroundColor: brand }}
      >
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
        {bookLabel}
      </a>
    </div>
  )
}
