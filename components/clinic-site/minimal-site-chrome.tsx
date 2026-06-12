import { CLINIC_THEME, readableInk } from '@/lib/clinic-site-theme'

const { BG, INK, INK_MUTED, BORDER } = CLINIC_THEME

export interface MinimalSiteChromeProps {
  /** Clinic display name. When absent (e.g. a not-found host with no clinic),
   *  the header falls back to a neutral "Dental Care" label. */
  clinicName?: string | null
  /** Optional clinic logo URL. Falls back to a brand-tinted letter-mark. */
  logoUrl?: string | null
  /** Clinic brand color. Defaults to the sage neutral. */
  brand?: string | null
  /** Root link target for the header logo + footer (the clinic home, or null
   *  to render the logo non-interactively on a 404 with no resolvable site). */
  homeHref?: string | null
  children: React.ReactNode
}

/**
 * MinimalSiteChrome — the warm, focused shell for public pages that are NOT
 * browsable surfaces: /intake-start, /r/[token] (review), and the clinic-site
 * 404. Shares the site's #FAF7F2 ground + brand accent + Fraunces display so a
 * patient still feels they're inside the clinic's brand, but without the full
 * nav (these are single-purpose flows).
 *
 * Pure server component (no DB). The caller resolves clinicName / logo / brand
 * and passes them in.
 */
export default function MinimalSiteChrome({
  clinicName,
  logoUrl,
  brand,
  homeHref,
  children,
}: MinimalSiteChromeProps) {
  const name = clinicName?.trim() || 'Dental Care'
  const accent = brand || '#9CAF9F'
  const ink = readableInk(accent)
  const letter = name.charAt(0).toUpperCase()

  const Logo = (
    <span className="flex items-center gap-2.5 min-w-0">
      {logoUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={logoUrl}
          alt={name}
          width={36}
          height={36}
          loading="eager"
          decoding="async"
          className="h-9 w-auto object-contain"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-9 h-9 rounded-full text-white text-base font-bold shrink-0"
          style={{ backgroundColor: accent }}
        >
          {letter}
        </span>
      )}
      <span
        className="font-semibold text-[17px] sm:text-[19px] leading-tight truncate"
        style={{ color: INK, fontFamily: 'var(--font-display, Georgia, serif)' }}
      >
        {name}
      </span>
    </span>
  )

  return (
    <div
      className="min-h-screen antialiased flex flex-col"
      style={{
        backgroundColor: BG,
        color: INK,
        fontFamily: 'var(--font-sans, Inter, sans-serif)',
      }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[var(--site-header-h,64px)] flex items-center justify-between gap-4">
          {homeHref ? (
            <a href={homeHref} className="min-w-0">
              {Logo}
            </a>
          ) : (
            Logo
          )}
          {homeHref && (
            <a
              href={homeHref}
              className="text-sm font-medium transition hover:underline shrink-0"
              style={{ color: INK_MUTED }}
            >
              ← Back to site
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[12px]" style={{ color: INK_MUTED }}>
            {homeHref ? (
              <a href={homeHref} className="font-medium hover:underline" style={{ color: ink }}>
                {name}
              </a>
            ) : (
              <span style={{ color: ink }}>{name}</span>
            )}
          </p>
          <p className="text-[11px]" style={{ color: INK_MUTED }}>
            &copy; {new Date().getFullYear()} {name}
          </p>
        </div>
      </footer>
    </div>
  )
}
