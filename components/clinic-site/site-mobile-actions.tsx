import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'

const { INK, BORDER } = CLINIC_THEME

interface Props {
  data: ClinicSiteData
  basePath: string
  bookHref: string
  bookLabel: string
  signInUrl?: string
}

/**
 * Persistent sticky bottom action bar — matches Tend's #sticky element.
 * Always visible across every breakpoint (was mobile-only before this
 * pass), pinned to the viewport bottom with a backdrop blur so it floats
 * above scrolling content. Three CTAs left-to-right: Book Now (brand
 * primary) · Login (white outline) · phone (icon-only on small screens,
 * icon + number on desktop).
 *
 * To keep the bar from overlapping the actual footer at the very bottom
 * of the page, we render a spacer below the page content (sized so the
 * bar's footprint can never cover the bottom of the footer). A more
 * precise scroll-into-footer hide would need IntersectionObserver +
 * `'use client'`; the spacer is the no-JS path Tend itself uses.
 */
export default function SiteMobileActions({
  data,
  basePath: _basePath,
  bookHref,
  bookLabel,
  signInUrl,
}: Props) {
  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'

  // Phone CTA uses Tend's "alert" color — a warm tan/peach that reads as
  // "tap to call" without competing with the brand-colored Book Now. We
  // hard-code it here (not theme-driven) because the warm tan reads well
  // against essentially every clinic brand color and grounds the bar.
  const phoneCta = '#bc8452'

  return (
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-30 pb-[max(env(safe-area-inset-bottom),10px)] pt-3 px-4"
        style={{
          background: '#FFFFFFEE',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderTop: `1px solid ${BORDER}`,
          boxShadow: '0 -4px 16px rgba(28, 26, 23, 0.06)',
        }}
      >
        <div className="max-w-[1100px] mx-auto flex items-center gap-2 sm:gap-3 justify-center">
          <a
            href={bookHref}
            className="flex-1 sm:flex-initial sm:min-w-[180px] inline-flex items-center justify-center px-5 py-3 rounded-full text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
            style={{ backgroundColor: brand }}
          >
            {bookLabel}
          </a>
          {signInUrl && (
            <a
              href={signInUrl}
              className="hidden sm:inline-flex items-center justify-center px-5 py-3 rounded-full text-sm font-semibold bg-white transition hover:shadow-sm"
              style={{ color: INK, border: `1px solid ${BORDER}` }}
            >
              Login
            </a>
          )}
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-full text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
              style={{ backgroundColor: phoneCta }}
              aria-label={`Call ${name}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <span className="hidden sm:inline">{profile.phone}</span>
            </a>
          )}
        </div>
      </div>

      {/* Spacer so page content (incl. the footer) doesn't sit under the bar. */}
      <div className="h-20 sm:h-24" aria-hidden="true" />
    </>
  )
}
