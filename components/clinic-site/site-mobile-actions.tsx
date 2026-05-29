import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { CLINIC_THEME } from '@/lib/clinic-site-theme'

const { BG, INK, SURFACE, BORDER } = CLINIC_THEME

interface Props {
  data: ClinicSiteData
  basePath: string
  bookHref: string
  bookLabel: string
}

/**
 * Persistent mobile + desktop CTAs that ride below every public-site page.
 *
 * Two pieces:
 *  - Floating phone circle, desktop-only (`hidden lg:flex`), pinned bottom-right.
 *  - Sticky bottom Book + Call bar, mobile-only (`lg:hidden`), pinned bottom of viewport.
 *
 * Both originally lived inside `modern-template.tsx` and so only rendered on the
 * homepage. Extracted here so every other page (/about, /services, /faq, /book,
 * /careers, …) can mount the same conversion surface without duplicating markup.
 */
export default function SiteMobileActions({ data, basePath: _basePath, bookHref, bookLabel }: Props) {
  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'

  return (
    <>
      {/* ── Floating phone CTA — desktop only ──────────────────────────── */}
      {profile.phone && (
        <a
          href={`tel:${profile.phone}`}
          className="hidden lg:flex fixed bottom-8 right-8 z-30 w-14 h-14 rounded-full items-center justify-center shadow-lg transition hover:shadow-xl hover:-translate-y-0.5"
          style={{ backgroundColor: brand }}
          aria-label={`Call ${name} at ${profile.phone}`}
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
        </a>
      )}

      {/* ── Sticky mobile booking bar — Book + Call ────────────────────── */}
      {/* Always-visible bottom bar on small screens. Two equal buttons.    */}
      <div
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3"
        style={{
          background: `linear-gradient(to top, ${BG} 60%, ${BG}00)`,
        }}
      >
        <div className="flex gap-2 max-w-md mx-auto">
          <a
            href={bookHref}
            className="flex-1 inline-flex items-center justify-center px-4 py-3.5 rounded-full text-sm font-semibold text-white shadow-lg"
            style={{ backgroundColor: brand }}
          >
            {bookLabel}
          </a>
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="inline-flex items-center justify-center w-14 h-[52px] rounded-full shadow-lg"
              style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}`, color: INK }}
              aria-label={`Call ${name}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Bottom padding to keep content above sticky bar on mobile */}
      <div className="lg:hidden h-20" aria-hidden="true" />
    </>
  )
}
