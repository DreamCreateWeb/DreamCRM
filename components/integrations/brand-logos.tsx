import { useId } from 'react'

/**
 * Integrations brand logos — recognizable, brand-accurate inline SVG marks in
 * each brand's REAL colors. This is the single biggest upgrade to the
 * Integrations marketplace: it replaces the old generic plug/emoji icons that
 * made every card look like a wireframe.
 *
 * Each logo is purely decorative (`aria-hidden`); the card always renders a text
 * label alongside, so the meaning never lives in the SVG. Logos are recreations
 * for product UI (the same way an app store renders connector marks) — kept
 * simple, single-glyph, and color-true.
 *
 * Three families:
 *   - Social + Google: trademark-accurate marks (Instagram gradient camera,
 *     Facebook blue f, TikTok offset note, YouTube red play, LinkedIn blue in,
 *     Google four-color G).
 *   - PMS we actually wire (Open Dental): a clean monogram tile in its blue.
 *   - Roadmap PMSs with no clean public mark (Dentrix Ascend / Dentrix /
 *     Eaglesoft / Curve): tasteful brand-colored monogram tiles.
 *
 * `BrandLogo` is the dispatcher keyed by a stable id; `BRAND_ACCENTS` exposes
 * each brand's primary color so cards can tint a logo well / hover glow to
 * match. `brandLogoTitle` gives a human title for tests + a11y.
 */

export type BrandLogoId =
  // Google + social
  | 'googlebusiness'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  // PMS
  | 'open_dental'
  | 'demo' // demo sandbox presents as Open Dental
  | 'dentrix_ascend'
  | 'dentrix_desktop'
  | 'eaglesoft'
  | 'curve'

/**
 * Each brand's primary accent color (used for the tinted logo well + hover
 * glow). Demo reuses Open Dental's. These are the recognizable brand hues.
 */
export const BRAND_ACCENTS: Record<BrandLogoId, string> = {
  googlebusiness: '#4285F4',
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#111111',
  youtube: '#FF0000',
  linkedin: '#0A66C2',
  open_dental: '#1B75BC',
  demo: '#1B75BC',
  dentrix_ascend: '#0072CE',
  dentrix_desktop: '#005EB8',
  eaglesoft: '#00833E',
  curve: '#6D2E8C',
}

const TITLES: Record<BrandLogoId, string> = {
  googlebusiness: 'Google Business Profile',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  open_dental: 'Open Dental',
  demo: 'Open Dental',
  dentrix_ascend: 'Dentrix Ascend',
  dentrix_desktop: 'Dentrix',
  eaglesoft: 'Eaglesoft',
  curve: 'Curve Dental',
}

/** Human title for any logo id (used for tests + screen-reader labels). */
export function brandLogoTitle(id: BrandLogoId): string {
  return TITLES[id]
}

interface LogoProps {
  /** Edge size in px (the logo is square). */
  size?: number
  className?: string
}

// ── Google Business — the four-color Google "G" ─────────────────────────────

function GoogleBusinessLogo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="googlebusiness"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.97 21.97 0 002 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

// ── Instagram — the gradient camera glyph ───────────────────────────────────

function InstagramLogo({ size = 28, className = '' }: LogoProps) {
  const gid = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="instagram"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={gid} cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#FDF497" />
          <stop offset="0.05" stopColor="#FDF497" />
          <stop offset="0.45" stopColor="#FD5949" />
          <stop offset="0.6" stopColor="#D6249F" />
          <stop offset="0.9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="40" height="40" rx="12" fill={`url(#${gid})`} />
      <rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="24" cy="24" r="6.5" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="32.5" cy="15.5" r="2.2" fill="#fff" />
    </svg>
  )
}

// ── Facebook — the blue rounded square + white f ────────────────────────────

function FacebookLogo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="facebook"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M30.5 25l.9-5.8h-5.6v-3.76c0-1.59.78-3.14 3.27-3.14h2.53V7.39s-2.3-.39-4.5-.39c-4.59 0-7.59 2.78-7.59 7.82v4.43H14.7V25h4.81v14h5.92V25z"
      />
    </svg>
  )
}

// ── TikTok — the offset music note (black note + cyan/magenta offset) ───────

function TikTokLogo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="tiktok"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="12" fill="#010101" />
      {/* cyan offset (behind, lower-left) */}
      <path
        fill="#25F4EE"
        d="M28.4 10c1 2.5 2.9 4.5 5.3 5.6v4.9c-2.1-.1-4.1-.8-5.9-1.9v8.7c0 5-4.1 9.2-9.1 9.2-1.9 0-3.6-.6-5-1.6 2.3 1.5 5.2 1.7 7.6.6 3.1-1.4 5.1-4.5 5.1-7.9V19c1.8 1.1 3.8 1.8 5.9 1.9V16c-2.4-1.1-4.3-3.1-5.3-5.6z"
      />
      {/* magenta offset */}
      <path
        fill="#FE2C55"
        d="M30 12c1 2.5 2.9 4.5 5.3 5.6v4.9c-2.1-.1-4.1-.8-5.9-1.9v8.7c0 5-4.1 9.2-9.1 9.2-1.9 0-3.6-.6-5-1.6 2.3 1.5 5.2 1.7 7.6.6 3.1-1.4 5.1-4.5 5.1-7.9V21c1.8 1.1 3.8 1.8 5.9 1.9V18c-2.4-1.1-4.3-3.1-5.3-5.6z"
      />
      {/* white note (front) */}
      <path
        fill="#fff"
        d="M29.2 11.2c-1.1-1.2-1.8-2.8-1.8-4.5h-3.7v20.4c0 1.8-1.5 3.2-3.2 3.2-1.1 0-2.1-.6-2.7-1.4-1-.5-2.2-.6-3.3-.2-1.6.6-2.6 2.1-2.6 3.8 0 2.8 2.3 5.1 5.1 5.1 5 0 9.1-4.1 9.1-9.2v-8.7c1.8 1.1 3.8 1.8 5.9 1.9V17c-2.4-1.1-4.3-3.1-5.3-5.6-.3-.04-.6-.1-.8-.2z"
      />
    </svg>
  )
}

// ── YouTube — the red rounded rectangle + white play triangle ───────────────

function YouTubeLogo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="youtube"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="10" width="44" height="28" rx="8" fill="#FF0000" />
      <path fill="#fff" d="M20 17.5l11 6.5-11 6.5z" />
    </svg>
  )
}

// ── LinkedIn — the blue square + white "in" ─────────────────────────────────

function LinkedInLogo({ size = 28, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="linkedin"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="48" height="48" rx="8" fill="#0A66C2" />
      <circle cx="14" cy="14" r="3.4" fill="#fff" />
      <rect x="11" y="20" width="6" height="17" fill="#fff" />
      <path
        fill="#fff"
        d="M22 20h5.7v2.4h.08c.8-1.4 2.74-2.9 5.64-2.9 6.03 0 7.14 3.7 7.14 8.5V37h-5.95v-7.6c0-1.8-.03-4.14-2.6-4.14-2.6 0-3 2-3 4.04V37H22z"
      />
    </svg>
  )
}

// ── Open Dental — clean wordmark monogram in its blue ───────────────────────

function OpenDentalLogo({ size = 28, className = '' }: LogoProps) {
  const gid = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="open_dental"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2E8FD6" />
          <stop offset="1" stopColor="#1B75BC" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gid})`} />
      {/* "OD" — an O ring + a D, evoking the dental wordmark */}
      <circle cx="18" cy="24" r="7.5" fill="none" stroke="#fff" strokeWidth="3.4" />
      <path
        fill="#fff"
        d="M29 15.5h4.4c5.2 0 8.6 3.4 8.6 8.5s-3.4 8.5-8.6 8.5H29zm4 4.1v8.8h.5c2.6 0 4.2-1.7 4.2-4.4s-1.6-4.4-4.2-4.4z"
      />
    </svg>
  )
}

// ── Monogram tile — for roadmap PMSs with no clean public mark ───────────────

function MonogramTile({
  letters,
  color,
  size = 28,
  className = '',
}: {
  letters: string
  color: string
  size?: number
  className?: string
}) {
  const gid = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      data-brand-logo="monogram"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gid})`} />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Geist, ui-sans-serif, system-ui, sans-serif"
        fontWeight="700"
        fontSize={letters.length > 1 ? 17 : 22}
        fill="#fff"
        letterSpacing="0.5"
      >
        {letters}
      </text>
    </svg>
  )
}

const MONOGRAM_LETTERS: Partial<Record<BrandLogoId, string>> = {
  dentrix_ascend: 'DA',
  dentrix_desktop: 'D',
  eaglesoft: 'ES',
  curve: 'C',
}

/**
 * The dispatcher — render the brand-accurate logo for any integration id. Always
 * `aria-hidden`; the surrounding card carries the text label.
 */
export function BrandLogo({ id, size = 28, className = '' }: { id: BrandLogoId; size?: number; className?: string }) {
  switch (id) {
    case 'googlebusiness':
      return <GoogleBusinessLogo size={size} className={className} />
    case 'instagram':
      return <InstagramLogo size={size} className={className} />
    case 'facebook':
      return <FacebookLogo size={size} className={className} />
    case 'tiktok':
      return <TikTokLogo size={size} className={className} />
    case 'youtube':
      return <YouTubeLogo size={size} className={className} />
    case 'linkedin':
      return <LinkedInLogo size={size} className={className} />
    case 'open_dental':
    case 'demo':
      return <OpenDentalLogo size={size} className={className} />
    case 'dentrix_ascend':
    case 'dentrix_desktop':
    case 'eaglesoft':
    case 'curve':
      return (
        <MonogramTile
          letters={MONOGRAM_LETTERS[id] ?? '?'}
          color={BRAND_ACCENTS[id]}
          size={size}
          className={className}
        />
      )
    default:
      return null
  }
}

/**
 * A logo seated in a soft, brand-tinted "well" — the card's hero. The tint is
 * derived from the brand accent at low alpha so the well reads as that app's
 * color without overpowering the etched card. `connected` brightens it slightly.
 */
export function BrandLogoWell({
  id,
  size = 26,
  wellSize = 48,
  connected = false,
  className = '',
}: {
  id: BrandLogoId
  size?: number
  wellSize?: number
  connected?: boolean
  className?: string
}) {
  const accent = BRAND_ACCENTS[id]
  return (
    <span
      data-brand-well={id}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[var(--r-md)] ring-1 ring-inset ${className}`}
      style={{
        width: wellSize,
        height: wellSize,
        // Tint the well to the brand color (faint), with a matching ring.
        backgroundColor: `color-mix(in srgb, ${accent} ${connected ? 16 : 10}%, transparent)`,
        // @ts-expect-error -- CSS custom property for the ring color
        '--tw-ring-color': `color-mix(in srgb, ${accent} ${connected ? 34 : 22}%, transparent)`,
      }}
    >
      <BrandLogo id={id} size={size} />
    </span>
  )
}
