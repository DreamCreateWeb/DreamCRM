import type { ClinicSiteData } from '@/lib/services/clinic-site'

// Warm-neutral tokens shared with the modern template + intake pages.
const BG = '#FAF7F2'
const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

/**
 * Minimal public chrome for the blog index + post pages (and the auth-gated
 * editor preview). Mirrors the intake page's self-contained header/footer
 * rather than embedding the full ModernTemplate, so blog pages stay light and
 * consistent across the site.
 */
export default function BlogChrome({
  data,
  basePath,
  children,
}: {
  data: ClinicSiteData
  basePath: string
  children: React.ReactNode
}) {
  const { profile } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#9CAF9F'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const bookHref = isPro ? `${basePath}/book` : `${basePath}#contact`
  const signIn = `${(process.env.NEXT_PUBLIC_APP_URL || 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')}/signin`

  return (
    <div className="min-h-screen font-inter antialiased" style={{ backgroundColor: BG, color: INK }}>
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <a href={basePath || '/'} className="flex items-center gap-3 min-w-0">
            {profile.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.logoUrl} alt={name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <span
                className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-semibold text-[17px] leading-tight truncate" style={{ color: INK }}>
              {name}
            </span>
          </a>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href={`${basePath}/blog`}
              className="hidden sm:inline-flex text-sm font-medium px-3 py-2 rounded-lg transition hover:bg-[#F1ECE3]"
              style={{ color: INK_MUTED }}
            >
              Blog
            </a>
            <a
              href={signIn}
              className="inline-flex items-center gap-1.5 text-[13px] sm:text-sm font-medium px-2.5 sm:px-3 py-2 rounded-lg transition hover:bg-[#F1ECE3]"
              style={{ color: INK_MUTED }}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <span className="hidden sm:inline">Patient Login</span>
              <span className="sm:hidden">Login</span>
            </a>
            <a
              href={bookHref}
              className="inline-flex items-center px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:opacity-95"
              style={{ backgroundColor: brand }}
            >
              Book a Visit
            </a>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t mt-16" style={{ borderColor: BORDER }}>
        <div
          className="max-w-[1100px] mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm"
          style={{ color: INK_MUTED }}
        >
          <a href={basePath || '/'} className="font-medium hover:underline" style={{ color: INK }}>
            ← Back to {name}
          </a>
          <div className="flex items-center gap-3">
            <a href={signIn} className="hover:underline" style={{ color: INK_MUTED }}>
              Staff login
            </a>
            <span aria-hidden="true">·</span>
            <span>
              © {new Date().getFullYear()} {name}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
